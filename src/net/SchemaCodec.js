/**
 * SchemaCodec — an evaluation codec (spec 038) that extends the spec-015
 * `BinaryCodec` with a **value-string dictionary**.
 *
 * `BinaryCodec` already interns object *keys* (the repeated `id`/`x`/`y`/`type`
 * field names) into a per-frame table. But it still writes repeated string
 * *values* inline — e.g. `"ship"` appears once per entity, dozens of times in a
 * snapshot. SchemaCodec interns **every** string (keys AND values) into a single
 * table and references each occurrence by a small varint index, so a frame with
 * 40 `"ship"` entities pays for `"ship"` exactly once. This trades a slightly
 * larger header (one table) for removing all string repetition in the body — a
 * net win on entity-dense frames (measured in SchemaCodec.test.js).
 *
 * Same guarantees as `BinaryCodec`: a leading version byte, integers as zig-zag
 * varints, floats as bit-exact float64, and `decode(encode(x))` deep-equals `x`
 * for any JSON-shaped value (including `undefined`-valued delta-removal fields).
 *
 * Status: this is an EVAL prototype, not wired into the live broadcast. See the
 * recommendation in SchemaCodec.test.js / plan/BACKLOG.md.
 *
 * Pure: no DOM, sockets, timers, or randomness.
 */

/**
 * The wire protocol version header for schema delta state compression.
 * @type {number}
 */
export const SCHEMA_PROTOCOL_VERSION = 1;

// Value type tags. Note: T_STRING's payload is a varint INDEX into the string
// table (not inline bytes) — that is the difference from BinaryCodec.
const T_NULL = 0;
const T_UNDEFINED = 1;
const T_FALSE = 2;
const T_TRUE = 3;
const T_INT = 4; // zig-zag varint
const T_FLOAT = 5; // float64 LE
const T_STRING = 6; // varint string-table index
const T_ARRAY = 7; // varint count + values
const T_OBJECT = 8; // varint count + (varint keyIndex, value) pairs

const INT_LIMIT = 0x7fffffff;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * High-performance byte serialization stream supporting varints,
 * zig-zag encoding, and IEEE 754 float64 primitives.
 */
class ByteWriter {
  constructor() {
    this.bytes = [];
  }
  u8(v) {
    this.bytes.push(v & 0xff);
  }
  varint(n) {
    let v = n >>> 0;
    while (v >= 0x80) {
      this.bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.bytes.push(v);
  }
  zigzag(n) {
    this.varint(((n << 1) ^ (n >> 31)) >>> 0);
  }
  f64(v) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, v, true);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) this.bytes.push(arr[i]);
  }
  rawString(s) {
    const enc = textEncoder.encode(s);
    this.varint(enc.length);
    for (let i = 0; i < enc.length; i++) this.bytes.push(enc[i]);
  }
  toUint8() {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * High-performance byte deserialization stream wrapping standard DataView
 * for decoding compressed wire structures safely.
 */
class ByteReader {
  constructor(u8) {
    this.u8 = u8;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.off = 0;
  }
  ensure(n) {
    if (this.off + n > this.u8.byteLength) {
      throw new Error("SchemaCodec: truncated buffer");
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
      if (shift > 35) throw new Error("SchemaCodec: varint too long");
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
  rawString() {
    const len = this.varint();
    this.ensure(len);
    const slice = this.u8.subarray(this.off, this.off + len);
    this.off += len;
    return textDecoder.decode(slice);
  }
}

/** Interns a string into the table (Map string→index), returning its index. */
function intern(table, str) {
  let idx = table.get(str);
  if (idx === undefined) {
    idx = table.size;
    table.set(str, idx);
  }
  return idx;
}

/** Recursively collects every string (object keys AND string values) into the table. */
function collectStrings(value, table) {
  if (typeof value === "string") {
    intern(table, value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, table);
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      intern(table, key);
      collectStrings(value[key], table);
    }
  }
}

function encodeValue(w, value, table) {
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
    w.varint(table.get(value));
    return undefined;
  }
  if (Array.isArray(value)) {
    w.u8(T_ARRAY);
    w.varint(value.length);
    for (const item of value) encodeValue(w, item, table);
    return undefined;
  }
  if (t === "object") {
    const keys = Object.keys(value);
    w.u8(T_OBJECT);
    w.varint(keys.length);
    for (const key of keys) {
      w.varint(table.get(key));
      encodeValue(w, value[key], table);
    }
    return undefined;
  }
  return w.u8(T_NULL);
}

function decodeValue(r, strings) {
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
    case T_STRING: {
      const i = r.varint();
      if (i >= strings.length) throw new Error("SchemaCodec: string index OOB");
      return strings[i];
    }
    case T_ARRAY: {
      const n = r.varint();
      const arr = new Array(n);
      for (let k = 0; k < n; k++) arr[k] = decodeValue(r, strings);
      return arr;
    }
    case T_OBJECT: {
      const n = r.varint();
      const obj = {};
      for (let k = 0; k < n; k++) {
        const keyIdx = r.varint();
        if (keyIdx >= strings.length) {
          throw new Error("SchemaCodec: key index OOB");
        }
        obj[strings[keyIdx]] = decodeValue(r, strings);
      }
      return obj;
    }
    default:
      throw new Error("SchemaCodec: unknown tag " + tag);
  }
}

/**
 * Encodes a frame into a compact buffer with a single interned string table for
 * both keys and string values.
 * @param {Object} frame
 * @returns {Uint8Array}
 */
export function encode(frame) {
  const w = new ByteWriter();
  w.u8(SCHEMA_PROTOCOL_VERSION);
  /** @type {Map<string, number>} */
  const table = new Map();
  collectStrings(frame, table);
  w.varint(table.size);
  for (const str of table.keys()) w.rawString(str);
  encodeValue(w, frame, table);
  return w.toUint8();
}

/**
 * Decodes a buffer produced by {@link encode}.
 * @param {Uint8Array} u8
 * @returns {*}
 */
export function decode(u8) {
  if (!(u8 instanceof Uint8Array)) {
    throw new Error("SchemaCodec: expected a Uint8Array");
  }
  const r = new ByteReader(u8);
  const version = r.u8r();
  if (version !== SCHEMA_PROTOCOL_VERSION) {
    throw new Error("SchemaCodec: unsupported version " + version);
  }
  const tableSize = r.varint();
  const strings = new Array(tableSize);
  for (let i = 0; i < tableSize; i++) strings[i] = r.rawString();
  return decodeValue(r, strings);
}
