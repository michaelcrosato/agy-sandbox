import { applyOutfitStats } from "./Outfitting.js";
import { Ship } from "./Ship.js";

describe("Outfitting.applyOutfitStats (spec 007)", () => {
  test("shield outfit raises maxShield, refills shield, adds mass", () => {
    const s = new Ship({ maxShield: 200 });
    expect(applyOutfitStats(s, { type: "shield", value: 350, mass: 800 })).toBe(
      true,
    );
    expect(s.maxShield).toBe(550);
    expect(s.shield).toBe(550);
    expect(s.outfitMass).toBe(800);
  });

  test("each known type mutates the right stat", () => {
    const s = new Ship();
    applyOutfitStats(s, { type: "engine", value: 12000 });
    expect(s.thrustPower).toBe(20000);
    applyOutfitStats(s, { type: "cargo", value: 15 });
    expect(s.cargoCapacity).toBe(35);
    applyOutfitStats(s, { type: "reactor", value: 30 });
    expect(s.energyRegen).toBe(80);
    applyOutfitStats(s, { type: "ramscoop", value: 4 });
    expect(s.ramscoopRate).toBe(4);
    applyOutfitStats(s, { type: "fuel", value: 50 });
    expect(s.maxHyperFuel).toBe(150);
    expect(s.hyperFuel).toBe(150);
    applyOutfitStats(s, { type: "miner", value: 1 });
    expect(s.miningYieldMultiplier).toBe(2);
  });

  test("pierce accumulates and clamps at 1", () => {
    const s = new Ship();
    applyOutfitStats(s, { type: "pierce", value: 0.8 });
    expect(s.weaponShieldPierce).toBe(0.8);
    applyOutfitStats(s, { type: "pierce", value: 0.8 });
    expect(s.weaponShieldPierce).toBe(1);
  });

  test("tractor outfit adds mass and returns true", () => {
    const s = new Ship();
    expect(
      applyOutfitStats(s, { type: "tractor", value: 250, mass: 200 }),
    ).toBe(true);
    expect(s.outfitMass).toBe(200);
  });

  test("jammer outfit adds mass and returns true", () => {
    const s = new Ship();
    expect(applyOutfitStats(s, { type: "jammer", value: 0.6, mass: 600 })).toBe(
      true,
    );
    expect(s.outfitMass).toBe(600);
  });

  test("unknown type returns false and adds no mass; null-safe", () => {
    const s = new Ship();
    expect(
      applyOutfitStats(s, { type: "warp_core", value: 9, mass: 100 }),
    ).toBe(false);
    expect(s.outfitMass).toBe(0);
    expect(applyOutfitStats(null, { type: "shield", value: 1 })).toBe(false);
    expect(applyOutfitStats(s, null)).toBe(false);
  });
});
