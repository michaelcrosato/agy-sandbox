/**
 * BinaryCodec — pure, versioned binary encoder/decoder for the P7 world-state
 * broadcast frames (spec 015).
 *
 * The server currently ships `state_snapshot` / `state_delta` frames as JSON
 * text. JSON repeats every object key as a string on every entity, which
 * dominates the payload for entity-heavy frames. This codec encodes the same
 * `{type, seq, ...}` frame object into a compact binary buffer whose single
 * biggest win is a per-frame **key dictionary**: each distinct object key (the
 * entity field names `id`/`x`/`y`/`type`/… that repeat across dozens of
 * entities) is written once in a table and referenced by a small varint index
 * everywhere it occurs. Integers use zig-zag varints; floats use IEEE-754
 * float64 (so the round-trip is bit-exact, matching the JSON path); strings are
 * length-prefixed UTF-8.
 *
 * Invariant: `decode(encode(x))` deep-equals `x` for any JSON-shaped value
 * (null, undefined, boolean, finite number, string, array, plain object) —
 * including the `undefined`-valued fields a delta uses to signal field removal,
 * which JSON would silently drop.
 *
 * Pure: no DOM, sockets, timers, or randomness. A `version` byte leads every
 * buffer so the wire format can migrate without ambiguity.
 */

export const BINARY_PROTOCOL_VERSION = 1;

// Value type tags.
const T_NULL = 0;
const T_UNDEFINED = 1;
const T_FALSE = 2;
const T_TRUE = 3;
const T_INT = 4; // zig-zag varint
const T_FLOAT = 5; // float64 LE
const T_STRING = 6; // varint length + UTF-8
const T_ARRAY = 7; // varint count + values
const T_OBJECT = 8; // varint count + (varint keyIndex, value) pairs

const INT_LIMIT = 0x7fffffff; // values within ±2^31-1 go as varints; others as float64

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Growable byte sink with the primitive writers the encoder needs. */
class ByteWriter {
  constructor() {
    this.bytes = [];
  }
  u8(v) {
    this.bytes.push(v & 0xff);
  }
  /** Unsigned LEB128 varint (used for lengths, counts, key indices). */
  varint(n) {
    let v = n >>> 0;
    while (v >= 0x80) {
      this.bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.bytes.push(v);
  }
  /** Zig-zag + varint, so small negatives stay small. */
  zigzag(n) {
    this.varint(((n << 1) ^ (n >> 31)) >>> 0);
  }
  f64(v) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, v, true);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) this.bytes.push(arr[i]);
  }
  str(s) {
    const enc = textEncoder.encode(s);
    this.varint(enc.length);
    for (let i = 0; i < enc.length; i++) this.bytes.push(enc[i]);
  }
  toUint8() {
    return Uint8Array.from(this.bytes);
  }
}

/** Cursor over a Uint8Array with bounds-checked readers. */
class ByteReader {
  constructor(u8) {
    this.u8 = u8;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.off = 0;
  }
  ensure(n) {
    if (this.off + n > this.u8.byteLength) {
      throw new Error("BinaryCodec: truncated buffer");
    }
  }
  u8r() {
    this.ensure(1);
    return this.u8[this.off++];
  }
  varint() {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.u8r();
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error("BinaryCodec: varint too long");
    }
    return result >>> 0;
  }
  zigzag() {
    const zz = this.varint();
    return (zz >>> 1) ^ -(zz & 1);
  }
  f64() {
    this.ensure(8);
    const v = this.view.getFloat64(this.off, true);
    this.off += 8;
    return v;
  }
  str() {
    const len = this.varint();
    this.ensure(len);
    const slice = this.u8.subarray(this.off, this.off + len);
    this.off += len;
    return textDecoder.decode(slice);
  }
}

/** Recursively collects every object key in `value` into `dict` (Map key→index). */
function collectKeys(value, dict) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, dict);
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (!dict.has(key)) dict.set(key, dict.size);
      collectKeys(value[key], dict);
    }
  }
}

function encodeValue(w, value, dict) {
  if (value === null) return w.u8(T_NULL);
  if (value === undefined) return w.u8(T_UNDEFINED);
  const t = typeof value;
  if (t === "boolean") return w.u8(value ? T_TRUE : T_FALSE);
  if (t === "number") {
    if (Number.isInteger(value) && value >= -INT_LIMIT && value <= INT_LIMIT) {
      w.u8(T_INT);
      w.zigzag(value);
    } else {
      w.u8(T_FLOAT);
      w.f64(value);
    }
    return undefined;
  }
  if (t === "string") {
    w.u8(T_STRING);
    w.str(value);
    return undefined;
  }
  if (Array.isArray(value)) {
    w.u8(T_ARRAY);
    w.varint(value.length);
    for (const item of value) encodeValue(w, item, dict);
    return undefined;
  }
  if (t === "object") {
    const keys = Object.keys(value);
    w.u8(T_OBJECT);
    w.varint(keys.length);
    for (const key of keys) {
      w.varint(dict.get(key));
      encodeValue(w, value[key], dict);
    }
    return undefined;
  }
  // functions/symbols/bigint never appear in frames — encode as null.
  return w.u8(T_NULL);
}

function decodeValue(r, dict) {
  const tag = r.u8r();
  switch (tag) {
    case T_NULL:
      return null;
    case T_UNDEFINED:
      return undefined;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT:
      return r.zigzag();
    case T_FLOAT:
      return r.f64();
    case T_STRING:
      return r.str();
    case T_ARRAY: {
      const n = r.varint();
      const arr = new Array(n);
      for (let i = 0; i < n; i++) arr[i] = decodeValue(r, dict);
      return arr;
    }
    case T_OBJECT: {
      const n = r.varint();
      const obj = {};
      for (let i = 0; i < n; i++) {
        const keyIndex = r.varint();
        if (keyIndex >= dict.length) {
          throw new Error("BinaryCodec: key index out of range");
        }
        obj[dict[keyIndex]] = decodeValue(r, dict);
      }
      return obj;
    }
    default:
      throw new Error("BinaryCodec: unknown tag " + tag);
  }
}

/**
 * Encodes a frame object into a compact binary buffer.
 * @param {Object} frame - A JSON-shaped frame (e.g. `{type, seq, entities}`).
 * @returns {Uint8Array}
 */
export function encode(frame) {
  const w = new ByteWriter();
  w.u8(BINARY_PROTOCOL_VERSION);
  const dict = new Map();
  collectKeys(frame, dict);
  w.varint(dict.size);
  for (const key of dict.keys()) w.str(key);
  encodeValue(w, frame, dict);
  return w.toUint8();
}

/**
 * Decodes a buffer produced by {@link encode} back into the original frame.
 * @param {Uint8Array} u8
 * @returns {*} The reconstructed frame.
 */
export function decode(u8) {
  if (!(u8 instanceof Uint8Array)) {
    throw new Error("BinaryCodec: expected a Uint8Array");
  }
  const r = new ByteReader(u8);
  const version = r.u8r();
  if (version !== BINARY_PROTOCOL_VERSION) {
    throw new Error("BinaryCodec: unsupported version " + version);
  }
  const dictSize = r.varint();
  const dict = new Array(dictSize);
  for (let i = 0; i < dictSize; i++) dict[i] = r.str();
  return decodeValue(r, dict);
}
