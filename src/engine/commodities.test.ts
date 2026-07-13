import { describe, test, expect } from "vitest";
import { COMMODITIES, makeEmptyCargo } from "./commodities.js";
import { Ship } from "./Ship.js";
import { Planet } from "./Planet.js";
import { BASE_MARKETS } from "./GameInstance.js";

const SORTED = [...COMMODITIES].sort();

describe("COMMODITIES single source of truth (spec 031)", () => {
  test("the list is frozen and holds the seven commodities", () => {
    expect(Object.isFrozen(COMMODITIES)).toBe(true);
    expect(COMMODITIES).toContain("ore");
    expect(COMMODITIES.length).toBe(7);
  });

  test("makeEmptyCargo covers exactly COMMODITIES, all zero, fresh each call", () => {
    const a = makeEmptyCargo();
    expect(Object.keys(a).sort()).toEqual(SORTED);
    expect(Object.values(a).every((v) => v === 0)).toBe(true);
    expect(makeEmptyCargo()).not.toBe(a); // independent objects (no shared ref)
  });

  test("a fresh Ship's cargo covers exactly COMMODITIES", () => {
    expect(Object.keys(new Ship({}).cargo).sort()).toEqual(SORTED);
  });

  test("a Planet's default market covers exactly COMMODITIES", () => {
    expect(Object.keys(new Planet({ name: "X" }).market).sort()).toEqual(
      SORTED,
    );
  });

  test("every BASE_MARKETS planet defines every commodity", () => {
    for (const [name, market] of Object.entries(BASE_MARKETS)) {
      for (const commodity of COMMODITIES) {
        expect(typeof market[commodity]).toBe("number"); // present, no gaps
      }
      // ...and no stray non-commodity keys crept in.
      expect(Object.keys(market).sort()).toEqual(SORTED);
      expect(name).toBeTruthy();
    }
  });
});
