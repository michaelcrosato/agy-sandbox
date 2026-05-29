import {
  shouldGcRoom,
  sanitizeNickname,
  DEFAULT_ROOM_IDLE_MS,
} from "./roomLifecycle.js";

describe("roomLifecycle.shouldGcRoom (spec 007)", () => {
  const emptyRoom = () => ({
    id: "room-x",
    clients: new Map(),
    lastActiveTime: 0,
  });

  test("never collects the persistent public room", () => {
    expect(
      shouldGcRoom(
        { id: "public", clients: new Map(), lastActiveTime: 0 },
        { now: 1e9 },
      ),
    ).toBe(false);
  });

  test("never collects a room that still has clients", () => {
    const r = emptyRoom();
    r.clients.set("ws", {});
    expect(shouldGcRoom(r, { now: 1e9 })).toBe(false);
  });

  test("collects an empty custom room once idle past the window", () => {
    expect(shouldGcRoom(emptyRoom(), { now: DEFAULT_ROOM_IDLE_MS + 1 })).toBe(
      true,
    );
  });

  test("keeps a recently-active empty room", () => {
    const r = emptyRoom();
    r.lastActiveTime = 1000;
    expect(shouldGcRoom(r, { now: 1100 })).toBe(false);
  });

  test("null-safe", () => {
    expect(shouldGcRoom(null)).toBe(false);
  });
});

describe("roomLifecycle.sanitizeNickname (spec 007)", () => {
  test("trims and caps at 12 characters", () => {
    expect(sanitizeNickname("  Commander Shepard  ")).toBe("Commander Sh");
  });

  test("falls back to Pilot for empty / nullish input", () => {
    expect(sanitizeNickname("")).toBe("Pilot");
    expect(sanitizeNickname(undefined)).toBe("Pilot");
    expect(sanitizeNickname(null)).toBe("Pilot");
  });
});
