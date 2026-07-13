import { describe, test, expect } from "vitest";
import zlib from "zlib";
import {
  DEFAULT_DEFLATE_OPTIONS,
  perMessageDeflateOption,
} from "./wsCompression.js";

describe("wsCompression.perMessageDeflateOption (spec 037)", () => {
  test("returns false (ws default) when disabled, tuned options when enabled", () => {
    expect(perMessageDeflateOption(false)).toBe(false);
    const opt = perMessageDeflateOption(true);
    expect(opt).toBe(DEFAULT_DEFLATE_OPTIONS);
    // Tuning guards against zlib memory blow-up at high concurrency.
    expect(opt.threshold).toBe(1024);
    expect(opt.concurrencyLimit).toBe(10);
    expect(opt.serverNoContextTakeover).toBe(true);
    expect(opt.clientNoContextTakeover).toBe(true);
  });

  test("the options object is frozen (stable shared config)", () => {
    expect(Object.isFrozen(DEFAULT_DEFLATE_OPTIONS)).toBe(true);
  });
});

describe("permessage-deflate benchmark (spec 037 eval)", () => {
  test("deflate shrinks a large repetitive text frame (the size case for compression)", () => {
    // A representative large JSON-ish frame with repeated structure (the kind of
    // text channel that benefits most from deflate).
    const entities = {};
    for (let i = 0; i < 60; i++) {
      entities["player-" + i] = {
        id: "player-" + i,
        type: "ship",
        name: "NPC Patrol",
        x: 1000 + i,
        y: -500 + i,
      };
    }
    const json = Buffer.from(
      JSON.stringify({ type: "state_snapshot", entities }),
      "utf8",
    );
    const deflated = zlib.deflateSync(json);

    // RECORDED RESULT (the measurement this eval exists to produce): deflate
    // roughly halves a repetitive text frame, so compression IS a real size win
    // for the JSON channels. But per spec 037's recommendation it stays OFF by
    // default because (a) the binary state channel (spec 015) is already compact
    // and gains little, and (b) zlib costs CPU/memory at high concurrency. Enable
    // only if egress bandwidth is the proven bottleneck. (See plan/BACKLOG.md.)
    expect(deflated.length).toBeLessThan(json.length);
    expect(deflated.length).toBeLessThan(json.length * 0.7); // a substantial win on text
  });

  test("deflate's win is small on already-compact data (why binary frames gain little)", () => {
    // High-entropy/short payload: deflate can't compress much and may even add
    // overhead — illustrating why the compact binary state channel benefits less.
    const small = Buffer.from(
      JSON.stringify({ type: "ping", t: 123456 }),
      "utf8",
    );
    const deflated = zlib.deflateSync(small);
    // No strong size claim here — just assert it round-trips and is finite.
    expect(zlib.inflateSync(deflated).toString()).toBe(small.toString());
  });
});
