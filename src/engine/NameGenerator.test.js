import { createSeededRng, pilotName, shipName } from "./NameGenerator.js";

describe("NameGenerator (EW8)", () => {
  test("is deterministic for a given seed", () => {
    expect(pilotName(createSeededRng(7))).toBe(pilotName(createSeededRng(7)));
    expect(shipName(createSeededRng(42))).toBe(shipName(createSeededRng(42)));
  });

  test("produces non-empty two-part names", () => {
    for (const seed of [1, 99, 1234]) {
      const pilot = pilotName(createSeededRng(seed));
      const ship = shipName(createSeededRng(seed));
      expect(pilot.split(" ").filter(Boolean).length).toBe(2);
      expect(ship.split(" ").filter(Boolean).length).toBe(2);
      expect(pilot.length).toBeGreaterThan(2);
      expect(ship.length).toBeGreaterThan(2);
    }
  });

  test("diverges across seeds (not a constant)", () => {
    const pilots = new Set();
    const ships = new Set();
    for (let seed = 1; seed <= 16; seed++) {
      pilots.add(pilotName(createSeededRng(seed)));
      ships.add(shipName(createSeededRng(seed)));
    }
    expect(pilots.size).toBeGreaterThan(1);
    expect(ships.size).toBeGreaterThan(1);
  });

  test("a single rng drives a varied sequence", () => {
    const rng = createSeededRng(2026);
    const names = new Set();
    for (let i = 0; i < 20; i++) names.add(pilotName(rng));
    expect(names.size).toBeGreaterThan(1);
  });
});
