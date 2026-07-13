import { describe, test, expect } from "vitest";
import { createLogger } from "./logger.js";

function capture(level) {
  const lines = [];
  const log = createLogger({
    level,
    now: () => "2026-05-29T00:00:00.000Z",
    sink: (l) => lines.push(l),
  });
  return { log, lines };
}

describe("logger.createLogger (spec 010)", () => {
  test("emits one JSON line per call with level/ts/msg/fields", () => {
    const { log, lines } = capture("info");
    log.info("client_connected", { id: "p1", clients: 3 });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      level: "info",
      ts: "2026-05-29T00:00:00.000Z",
      msg: "client_connected",
      id: "p1",
      clients: 3,
    });
  });

  test("filters out messages below the configured level", () => {
    const { log, lines } = capture("warn");
    log.debug("noise");
    log.info("also noise");
    log.warn("kept");
    log.error("kept too");
    expect(lines.map((l) => JSON.parse(l).msg)).toEqual(["kept", "kept too"]);
  });

  test("never throws on non-serializable fields (falls back to a bare line)", () => {
    const { log, lines } = capture("info");
    const circular = {};
    circular.self = circular;
    expect(() => log.info("weird", { circular })).not.toThrow();
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe("weird");
  });
});
