import { describe, test, expect } from "vitest";
import {
  WeaponArchetype,
  WEAPON_ARCHETYPE_ORDER,
  WEAPON_ARCHETYPE_PROFILES,
  DEFAULT_WEAPON_COSTS,
  getArchetypeProfile,
  applyArchetypeToShip,
} from "./WeaponArchetypes.js";
import { Ship } from "./Ship.js";
import { SpaceEngine } from "./SpaceEngine.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("WeaponArchetype identifiers", () => {
  test("exposes the four canonical archetype names", () => {
    expect(WeaponArchetype.KINETIC).toBe("KINETIC");
    expect(WeaponArchetype.ENERGY).toBe("ENERGY");
    expect(WeaponArchetype.BEAM).toBe("BEAM");
    expect(WeaponArchetype.MISSILE).toBe("MISSILE");
  });

  test("is frozen so the archetype set cannot drift at runtime", () => {
    expect(Object.isFrozen(WeaponArchetype)).toBe(true);
  });

  test("WEAPON_ARCHETYPE_ORDER lists every archetype exactly once", () => {
    expect(WEAPON_ARCHETYPE_ORDER).toEqual([
      "KINETIC",
      "ENERGY",
      "BEAM",
      "MISSILE",
      "FLAK",
    ]);
    expect(Object.isFrozen(WEAPON_ARCHETYPE_ORDER)).toBe(true);
  });
});

describe("WEAPON_ARCHETYPE_PROFILES table", () => {
  test("is deeply frozen", () => {
    expect(Object.isFrozen(WEAPON_ARCHETYPE_PROFILES)).toBe(true);
    for (const name of WEAPON_ARCHETYPE_ORDER) {
      expect(Object.isFrozen(WEAPON_ARCHETYPE_PROFILES[name])).toBe(true);
    }
  });

  test("has a profile for every archetype with all required fields", () => {
    const required = [
      "damageScale",
      "speedScale",
      "rangeScale",
      "cooldownScale",
      "shieldPierce",
      "energyCost",
      "heatCost",
    ];
    for (const name of WEAPON_ARCHETYPE_ORDER) {
      const profile = WEAPON_ARCHETYPE_PROFILES[name];
      expect(profile).toBeDefined();
      for (const key of required) {
        expect(typeof profile[key]).toBe("number");
        expect(Number.isFinite(profile[key])).toBe(true);
      }
    }
  });

  test("KINETIC is the cheap-and-fast archetype with zero shield pierce", () => {
    const k = WEAPON_ARCHETYPE_PROFILES.KINETIC;
    expect(k.shieldPierce).toBe(0);
    // Fastest projectile of the non-BEAM archetypes
    expect(k.speedScale).toBeGreaterThan(
      WEAPON_ARCHETYPE_PROFILES.ENERGY.speedScale,
    );
    expect(k.speedScale).toBeGreaterThan(
      WEAPON_ARCHETYPE_PROFILES.MISSILE.speedScale,
    );
    // Snappy cooldown — quicker than the ENERGY baseline
    expect(k.cooldownScale).toBeLessThan(
      WEAPON_ARCHETYPE_PROFILES.ENERGY.cooldownScale,
    );
    // Cheapest per-shot energy cost
    expect(k.energyCost).toBeLessThan(
      WEAPON_ARCHETYPE_PROFILES.ENERGY.energyCost,
    );
  });

  test("ENERGY is the balanced baseline with some shield pierce", () => {
    const e = WEAPON_ARCHETYPE_PROFILES.ENERGY;
    expect(e.damageScale).toBe(1.0);
    expect(e.speedScale).toBe(1.0);
    expect(e.cooldownScale).toBe(1.0);
    expect(e.shieldPierce).toBeGreaterThan(0);
    expect(e.shieldPierce).toBeLessThan(1);
  });

  test("BEAM is high-speed, short-range, and heat-heavy", () => {
    const b = WEAPON_ARCHETYPE_PROFILES.BEAM;
    expect(b.speedScale).toBeGreaterThanOrEqual(2.5);
    expect(b.rangeScale).toBeLessThan(1.0);
    // BEAM should generate the most heat per shot of any archetype
    for (const name of WEAPON_ARCHETYPE_ORDER) {
      if (name === "BEAM") continue;
      expect(WEAPON_ARCHETYPE_PROFILES[name].heatCost).toBeLessThan(b.heatCost);
    }
  });

  test("MISSILE is slow, high-damage, with the strongest shield pierce", () => {
    const m = WEAPON_ARCHETYPE_PROFILES.MISSILE;
    // Highest damage scale of any archetype
    for (const name of WEAPON_ARCHETYPE_ORDER) {
      if (name === "MISSILE") continue;
      expect(WEAPON_ARCHETYPE_PROFILES[name].damageScale).toBeLessThan(
        m.damageScale,
      );
    }
    // Highest shield pierce of any archetype
    for (const name of WEAPON_ARCHETYPE_ORDER) {
      if (name === "MISSILE") continue;
      expect(WEAPON_ARCHETYPE_PROFILES[name].shieldPierce).toBeLessThan(
        m.shieldPierce,
      );
    }
    // Slow projectile
    expect(m.speedScale).toBeLessThan(1.0);
    // Long cooldown
    expect(m.cooldownScale).toBeGreaterThan(1.0);
  });

  test("FLAK is a rapid, short-range, low-damage point-defense weapon", () => {
    const f = WEAPON_ARCHETYPE_PROFILES.FLAK;
    expect(f.shieldPierce).toBe(0);
    expect(f.rangeScale).toBeLessThan(1.0); // short range
    // Rapid fire and low damage relative to the ENERGY baseline.
    expect(f.cooldownScale).toBeLessThan(
      WEAPON_ARCHETYPE_PROFILES.ENERGY.cooldownScale,
    );
    expect(f.damageScale).toBeLessThan(
      WEAPON_ARCHETYPE_PROFILES.ENERGY.damageScale,
    );
    // Stays under the table superlatives (MISSILE damage/pierce, BEAM heat).
    expect(f.damageScale).toBeLessThan(
      WEAPON_ARCHETYPE_PROFILES.MISSILE.damageScale,
    );
    expect(f.shieldPierce).toBeLessThan(
      WEAPON_ARCHETYPE_PROFILES.MISSILE.shieldPierce,
    );
    expect(f.heatCost).toBeLessThan(WEAPON_ARCHETYPE_PROFILES.BEAM.heatCost);
  });
});

describe("DEFAULT_WEAPON_COSTS", () => {
  test("matches the pre-archetype legacy baseline of 6 energy / 8 heat", () => {
    expect(DEFAULT_WEAPON_COSTS.energyCost).toBe(6);
    expect(DEFAULT_WEAPON_COSTS.heatCost).toBe(8);
    expect(Object.isFrozen(DEFAULT_WEAPON_COSTS)).toBe(true);
  });
});

describe("getArchetypeProfile", () => {
  test("returns the matching profile for each archetype name", () => {
    for (const name of WEAPON_ARCHETYPE_ORDER) {
      expect(getArchetypeProfile(name)).toBe(WEAPON_ARCHETYPE_PROFILES[name]);
    }
  });

  test("returns null for unknown / invalid inputs", () => {
    expect(getArchetypeProfile("PLASMA")).toBeNull();
    expect(getArchetypeProfile("")).toBeNull();
    expect(getArchetypeProfile(null)).toBeNull();
    expect(getArchetypeProfile(undefined)).toBeNull();
    expect(getArchetypeProfile(123)).toBeNull();
  });
});

describe("applyArchetypeToShip", () => {
  function freshShip() {
    return new Ship({
      id: "test",
      weaponDamage: 20,
      weaponSpeed: 500,
      weaponRange: 600,
      weaponCooldown: 0.25,
    });
  }

  test("scales weapon stats by the archetype's profile and tags the ship", () => {
    const ship = freshShip();
    const ok = applyArchetypeToShip(ship, WeaponArchetype.MISSILE);
    expect(ok).toBe(true);
    const p = WEAPON_ARCHETYPE_PROFILES.MISSILE;
    expect(ship.weaponArchetype).toBe("MISSILE");
    expect(ship.weaponDamage).toBeCloseTo(20 * p.damageScale, 6);
    expect(ship.weaponSpeed).toBeCloseTo(500 * p.speedScale, 6);
    expect(ship.weaponRange).toBeCloseTo(600 * p.rangeScale, 6);
    expect(ship.weaponCooldown).toBeCloseTo(0.25 * p.cooldownScale, 6);
    expect(ship.weaponShieldPierce).toBe(p.shieldPierce);
    expect(ship.weaponEnergyCost).toBe(p.energyCost);
    expect(ship.weaponHeatCost).toBe(p.heatCost);
  });

  test("KINETIC strips shield pierce even if the ship had some", () => {
    const ship = freshShip();
    ship.weaponShieldPierce = 0.5; // legacy "Ion Disruptor" loadout
    applyArchetypeToShip(ship, WeaponArchetype.KINETIC);
    expect(ship.weaponShieldPierce).toBe(0);
  });

  test("returns false and does not mutate when given an unknown archetype", () => {
    const ship = freshShip();
    const before = {
      weaponDamage: ship.weaponDamage,
      weaponSpeed: ship.weaponSpeed,
      weaponRange: ship.weaponRange,
      weaponCooldown: ship.weaponCooldown,
      weaponShieldPierce: ship.weaponShieldPierce,
      weaponArchetype: ship.weaponArchetype,
    };
    expect(applyArchetypeToShip(ship, "PLASMA")).toBe(false);
    expect(ship.weaponDamage).toBe(before.weaponDamage);
    expect(ship.weaponSpeed).toBe(before.weaponSpeed);
    expect(ship.weaponRange).toBe(before.weaponRange);
    expect(ship.weaponCooldown).toBe(before.weaponCooldown);
    expect(ship.weaponShieldPierce).toBe(before.weaponShieldPierce);
    expect(ship.weaponArchetype).toBe(before.weaponArchetype);
  });

  test("returns false and does nothing when given no ship", () => {
    expect(applyArchetypeToShip(null, WeaponArchetype.ENERGY)).toBe(false);
    expect(applyArchetypeToShip(undefined, WeaponArchetype.ENERGY)).toBe(false);
  });

  test("is idempotent in terms of shape: a second pass with the same archetype keeps stats finite", () => {
    const ship = freshShip();
    applyArchetypeToShip(ship, WeaponArchetype.ENERGY);
    const after1 = { ...ship };
    applyArchetypeToShip(ship, WeaponArchetype.ENERGY);
    // Damage / speed / range / cooldown will compound (this is by design —
    // scales are applied to current stats), but every value stays finite
    // and the archetype tag is unchanged.
    expect(Number.isFinite(ship.weaponDamage)).toBe(true);
    expect(Number.isFinite(ship.weaponSpeed)).toBe(true);
    expect(Number.isFinite(ship.weaponRange)).toBe(true);
    expect(Number.isFinite(ship.weaponCooldown)).toBe(true);
    expect(ship.weaponArchetype).toBe(after1.weaponArchetype);
    expect(ship.weaponShieldPierce).toBe(after1.weaponShieldPierce);
    expect(ship.weaponEnergyCost).toBe(after1.weaponEnergyCost);
    expect(ship.weaponHeatCost).toBe(after1.weaponHeatCost);
  });
});

describe("SpaceEngine.fireWeapon honors archetype stats", () => {
  function readyShip() {
    const ship = new Ship({
      id: "shooter",
      position: new Vector2D(0, 0),
      weaponDamage: 20,
      weaponSpeed: 500,
      weaponRange: 600,
      weaponCooldown: 0.25,
    });
    ship.energy = 100;
    ship.heat = 0;
    return ship;
  }

  test("produces a projectile whose stats match the KINETIC profile", () => {
    const engine = new SpaceEngine();
    const ship = readyShip();
    applyArchetypeToShip(ship, WeaponArchetype.KINETIC);
    engine.addEntity(ship);

    engine.fireWeapon(ship);
    const proj = engine.entities.find((e) => e.type === "projectile");
    const p = WEAPON_ARCHETYPE_PROFILES.KINETIC;

    expect(proj).toBeDefined();
    expect(proj.damage).toBeCloseTo(20 * p.damageScale, 6);
    expect(proj.shieldPierce).toBe(0);
    expect(proj.maxLifetime).toBeCloseTo(
      (600 * p.rangeScale) / (500 * p.speedScale),
      6,
    );
    expect(ship.energy).toBeCloseTo(100 - p.energyCost, 6);
    expect(ship.heat).toBeCloseTo(p.heatCost, 6);
    expect(ship.activeWeaponCooldown).toBeCloseTo(0.25 * p.cooldownScale, 6);
  });

  test("produces a projectile whose stats match the ENERGY profile", () => {
    const engine = new SpaceEngine();
    const ship = readyShip();
    applyArchetypeToShip(ship, WeaponArchetype.ENERGY);
    engine.addEntity(ship);

    engine.fireWeapon(ship);
    const proj = engine.entities.find((e) => e.type === "projectile");
    const p = WEAPON_ARCHETYPE_PROFILES.ENERGY;

    expect(proj.damage).toBeCloseTo(20 * p.damageScale, 6);
    expect(proj.shieldPierce).toBe(p.shieldPierce);
    expect(ship.energy).toBeCloseTo(100 - p.energyCost, 6);
    expect(ship.heat).toBeCloseTo(p.heatCost, 6);
  });

  test("produces a fast, short-range, high-heat projectile for BEAM", () => {
    const engine = new SpaceEngine();
    const ship = readyShip();
    applyArchetypeToShip(ship, WeaponArchetype.BEAM);
    engine.addEntity(ship);

    engine.fireWeapon(ship);
    const proj = engine.entities.find((e) => e.type === "projectile");
    const p = WEAPON_ARCHETYPE_PROFILES.BEAM;

    // BEAM lifetime should be very short by construction (high speed,
    // low range); guard against accidental tuning regressions.
    expect(proj.maxLifetime).toBeLessThan(0.6);
    // Muzzle velocity should reflect the speed scale on top of the
    // ship's base 500 unit/s weaponSpeed.
    expect(proj.velocity.magnitude()).toBeCloseTo(500 * p.speedScale, 6);
    expect(proj.shieldPierce).toBe(p.shieldPierce);
    expect(ship.heat).toBeCloseTo(p.heatCost, 6);
    expect(ship.activeWeaponCooldown).toBeCloseTo(0.25 * p.cooldownScale, 6);
  });

  test("produces a heavy, piercing, slow projectile for MISSILE", () => {
    const engine = new SpaceEngine();
    const ship = readyShip();
    applyArchetypeToShip(ship, WeaponArchetype.MISSILE);
    engine.addEntity(ship);

    engine.fireWeapon(ship);
    const proj = engine.entities.find((e) => e.type === "projectile");
    const p = WEAPON_ARCHETYPE_PROFILES.MISSILE;

    expect(proj.damage).toBeCloseTo(20 * p.damageScale, 6);
    expect(proj.shieldPierce).toBe(p.shieldPierce);
    expect(proj.velocity.magnitude()).toBeCloseTo(500 * p.speedScale, 6);
    // Long cooldown — MISSILE should fire more slowly than ENERGY.
    expect(ship.activeWeaponCooldown).toBeGreaterThan(0.25);
    expect(ship.energy).toBeCloseTo(100 - p.energyCost, 6);
  });

  test("a ship with no archetype keeps the pre-archetype legacy behavior", () => {
    // Backward-compat guard: this mirrors the existing SpaceEngine test for
    // "spawns a projectile, spends energy, builds heat, and sets cooldown"
    // — if a future change to per-shot costs breaks legacy ships, this fails.
    const engine = new SpaceEngine();
    const ship = readyShip();
    engine.addEntity(ship);
    engine.fireWeapon(ship);

    const proj = engine.entities.find((e) => e.type === "projectile");
    expect(proj.damage).toBe(ship.weaponDamage); // no scaling applied
    expect(proj.shieldPierce).toBe(0);
    expect(ship.energy).toBe(100 - DEFAULT_WEAPON_COSTS.energyCost);
    expect(ship.heat).toBe(DEFAULT_WEAPON_COSTS.heatCost);
    expect(ship.activeWeaponCooldown).toBe(ship.weaponCooldown);
  });

  test("respects per-shot energy gating for an expensive archetype", () => {
    const engine = new SpaceEngine();
    const ship = readyShip();
    applyArchetypeToShip(ship, WeaponArchetype.MISSILE);
    // Just below the MISSILE energy cost — the engine should refuse.
    ship.energy = WEAPON_ARCHETYPE_PROFILES.MISSILE.energyCost - 1;
    engine.addEntity(ship);

    engine.fireWeapon(ship);

    expect(engine.entities.some((e) => e.type === "projectile")).toBe(false);
    expect(ship.energy).toBe(WEAPON_ARCHETYPE_PROFILES.MISSILE.energyCost - 1);
    expect(ship.activeWeaponCooldown).toBe(0);
  });
});
