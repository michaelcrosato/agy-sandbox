import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("Ship construction", () => {
  test("applies documented defaults", () => {
    const s = new Ship();
    expect(s.type).toBe("ship");
    expect(s.mass).toBe(2000);
    expect(s.radius).toBe(15);
    expect(s.name).toBe("Starfarer");
    expect(s.thrustPower).toBe(8000);
    expect(s.brakePower).toBe(4000);
    expect(s.turnRate).toBe(2.5);
    expect(s.maxSpeed).toBe(300);
    expect(s.maxShield).toBe(200);
    expect(s.shield).toBe(200);
    expect(s.maxArmor).toBe(100);
    expect(s.armor).toBe(100);
    expect(s.credits).toBe(5000);
    expect(s.cargoCapacity).toBe(20);
    expect(s.energy).toBe(100);
    expect(s.heat).toBe(0);
    expect(s.hyperFuel).toBe(100);
    expect(s.isOverheated).toBe(false);
    expect(s.isDisabled).toBe(false);
    expect(s.outfits).toEqual(["Basic Laser"]);
    expect(s.getCargoWeight()).toBe(0);
    expect(s.hullMass).toBe(2000);
    expect(s.outfitMass).toBe(0);
    // Combat record (EW1) defaults
    expect(s.bountyValue).toBeNull();
    expect(s.kills).toBe(0);
    expect(s.combatValue).toBe(0);
    expect(s.combatRating).toBe(0);
  });

  test("accepts an explicit bountyValue override", () => {
    const s = new Ship({ bountyValue: 2500 });
    expect(s.bountyValue).toBe(2500);
  });

  test("shield and armor initialise to their maxima even when only the max is given", () => {
    const s = new Ship({ maxShield: 500, maxArmor: 300 });
    expect(s.shield).toBe(500);
    expect(s.armor).toBe(300);
  });

  test("passes unrecognised config through to the SpaceEntity base", () => {
    const s = new Ship({ position: new Vector2D(7, 8), heading: 1 });
    expect(s.position.x).toBe(7);
    expect(s.position.y).toBe(8);
    expect(s.heading).toBe(1);
  });
});

describe("Ship controls", () => {
  test("setControls merges without clobbering untouched flags", () => {
    const s = new Ship();
    s.setControls({ isThrusting: true });
    s.setControls({ isFiring: true });
    expect(s.controls.isThrusting).toBe(true);
    expect(s.controls.isFiring).toBe(true);
    expect(s.controls.isBraking).toBe(false);
  });

  test("clearControls resets every command flag", () => {
    const s = new Ship();
    s.setControls({
      isThrusting: true,
      isBraking: true,
      isTurningLeft: true,
      isTurningRight: true,
      isFiring: true,
    });
    s.setControls({ isBoosting: true });
    s.clearControls();
    expect(s.controls).toEqual({
      isThrusting: false,
      isBraking: false,
      isTurningLeft: false,
      isTurningRight: false,
      isFiring: false,
      isBoosting: false,
    });
  });
});

describe("Ship cargo", () => {
  test("adds known commodities and tracks total weight", () => {
    const s = new Ship({ cargoCapacity: 10 });
    expect(s.addCargo("food", 3)).toBe(true);
    expect(s.addCargo("minerals", 2)).toBe(true);
    expect(s.cargo.food).toBe(3);
    expect(s.getCargoWeight()).toBe(5);
  });

  test("rejects loads that exceed capacity", () => {
    const s = new Ship({ cargoCapacity: 5 });
    expect(s.addCargo("food", 5)).toBe(true);
    expect(s.addCargo("food", 1)).toBe(false);
    expect(s.getCargoWeight()).toBe(5);
  });

  test("rejects unknown commodities", () => {
    const s = new Ship({ cargoCapacity: 10 });
    expect(s.addCargo("antimatter", 1)).toBe(false);
    expect(s.getCargoWeight()).toBe(0);
  });

  test("removes cargo only when enough is present", () => {
    const s = new Ship();
    s.addCargo("electronics", 4);
    expect(s.removeCargo("electronics", 5)).toBe(false);
    expect(s.removeCargo("electronics", 4)).toBe(true);
    expect(s.cargo.electronics).toBe(0);
    expect(s.removeCargo("luxuries", 1)).toBe(false);
  });
});

describe("Ship.takeDamage", () => {
  test("drains shields before armor", () => {
    const s = new Ship({ maxShield: 200, maxArmor: 100 });
    const destroyed = s.takeDamage(50);
    expect(s.shield).toBe(150);
    expect(s.armor).toBe(100);
    expect(destroyed).toBe(false);
  });

  test("overflows excess damage from shields into armor", () => {
    const s = new Ship({ maxShield: 200, maxArmor: 100 });
    s.shield = 30;
    s.takeDamage(50);
    expect(s.shield).toBe(0);
    expect(s.armor).toBe(80);
  });

  test("hits armor directly once shields are gone", () => {
    const s = new Ship({ maxArmor: 100 });
    s.shield = 0;
    s.takeDamage(40);
    expect(s.armor).toBe(60);
  });

  test("enters disabled standby at zero armor instead of exploding", () => {
    const s = new Ship({ maxArmor: 100 });
    s.shield = 0;
    s.armor = 10;
    const destroyed = s.takeDamage(15);
    expect(destroyed).toBe(false);
    expect(s.isDisabled).toBe(true);
    expect(s.armor).toBe(30);
    expect(s.shield).toBe(0);
  });

  test("explodes when standby armor is then drained to zero", () => {
    const s = new Ship({ maxArmor: 100 });
    s.shield = 0;
    s.armor = 10;
    s.takeDamage(15); // -> disabled, armor 30
    const destroyed = s.takeDamage(35);
    expect(destroyed).toBe(true);
    expect(s.armor).toBe(0);
    expect(s.isDestroyed).toBe(true);
  });

  test("is a no-op for non-positive damage", () => {
    const s = new Ship();
    const beforeShield = s.shield;
    expect(s.takeDamage(0)).toBe(false);
    expect(s.takeDamage(-10)).toBe(false);
    expect(s.shield).toBe(beforeShield);
  });
});

describe("Ship.regenerateShields", () => {
  test("recharges shields, spending energy and producing heat", () => {
    const s = new Ship({ maxShield: 200, shieldRegen: 10 });
    s.shield = 100;
    s.energy = 100;
    s.heat = 0;
    s.regenerateShields(1);
    expect(s.shield).toBe(110); // +min(deficit, regen*dt) = +10
    expect(s.energy).toBeCloseTo(88, 6); // -10 * 1.2
    expect(s.heat).toBeCloseTo(4, 6); // +10 * 0.4
  });

  test("regenerates partially when energy is constrained", () => {
    const s = new Ship({ maxShield: 200, shieldRegen: 10 });
    s.shield = 100;
    s.energy = 6;
    s.regenerateShields(1);
    expect(s.shield).toBeCloseTo(105, 6); // energy/1.2 = 5 units
    expect(s.energy).toBe(0);
  });

  test("does nothing when shields are already full", () => {
    const s = new Ship({ maxShield: 200 });
    s.energy = 100;
    s.regenerateShields(1);
    expect(s.shield).toBe(200);
    expect(s.energy).toBe(100);
  });

  test("does nothing while overheated", () => {
    const s = new Ship({ maxShield: 200 });
    s.shield = 50;
    s.isOverheated = true;
    s.energy = 100;
    s.regenerateShields(1);
    expect(s.shield).toBe(50);
    expect(s.energy).toBe(100);
  });

  test("does not regenerate during the post-hit combat lockout", () => {
    const s = new Ship({ maxShield: 200, shieldRegen: 10 });
    s.shield = 100;
    s.takeDamage(10); // shield 90, resets the combat-lockout timer to 0
    expect(s.shield).toBe(90);
    s.regenerateShields(1);
    expect(s.shield).toBe(90); // still locked out, no regen
  });

  test("resumes regeneration once the combat delay elapses", () => {
    const s = new Ship({ maxShield: 200, shieldRegen: 10 });
    s.shield = 100;
    s.takeDamage(10); // shield 90, timer 0
    s.timeSinceLastHit = s.shieldRegenDelay; // delay has now elapsed
    s.regenerateShields(1);
    expect(s.shield).toBe(100); // +10
  });
});

describe("Ship shield-piercing damage", () => {
  test("a piercing fraction strikes armor directly, bypassing shields", () => {
    const s = new Ship({ maxShield: 200, maxArmor: 100 });
    s.takeDamage(100, 0.5); // 50 to shields, 50 straight to armor
    expect(s.shield).toBe(150);
    expect(s.armor).toBe(50);
  });

  test("full pierce ignores shields entirely", () => {
    const s = new Ship({ maxShield: 200, maxArmor: 100 });
    s.takeDamage(40, 1);
    expect(s.shield).toBe(200);
    expect(s.armor).toBe(60);
  });

  test("defaults to zero pierce for backward compatibility", () => {
    const s = new Ship({ maxShield: 200, maxArmor: 100 });
    s.takeDamage(30);
    expect(s.shield).toBe(170);
    expect(s.armor).toBe(100);
  });
});

describe("Ship afterburner", () => {
  test("update advances the combat-lockout timer", () => {
    const s = new Ship();
    s.takeDamage(10); // timer -> 0
    s.update(0.5);
    expect(s.timeSinceLastHit).toBeCloseTo(0.5, 6);
  });

  test("boosting yields more speed but burns more energy than normal thrust", () => {
    const normal = new Ship();
    normal.setControls({ isThrusting: true });
    normal.update(0.1);

    const boosted = new Ship();
    boosted.setControls({ isThrusting: true, isBoosting: true });
    boosted.update(0.1);

    expect(boosted.velocity.magnitude()).toBeGreaterThan(
      normal.velocity.magnitude(),
    );
    expect(boosted.energy).toBeLessThan(normal.energy);
  });

  test("raises the speed ceiling only while actively boosting", () => {
    const capped = new Ship({ maxSpeed: 300 });
    capped.velocity = new Vector2D(400, 0);
    capped.setControls({ isThrusting: true });
    capped.update(0.001);
    expect(capped.velocity.magnitude()).toBeCloseTo(300, 6);

    const boosted = new Ship({ maxSpeed: 300 });
    boosted.velocity = new Vector2D(400, 0);
    boosted.setControls({ isThrusting: true, isBoosting: true });
    boosted.update(0.001);
    expect(boosted.velocity.magnitude()).toBeGreaterThan(300);
  });
});

describe("Ship.update propulsion and systems", () => {
  test("is a no-op for non-positive dt", () => {
    const s = new Ship();
    s.energy = 40;
    s.update(0);
    expect(s.position.x).toBe(0);
    expect(s.energy).toBe(40);
    s.update(-2);
    expect(s.position.x).toBe(0);
  });

  test("is a no-op once destroyed", () => {
    const s = new Ship({ maxArmor: 100 });
    s.armor = 0; // destroyed
    s.velocity = new Vector2D(50, 0);
    s.update(1);
    expect(s.position.x).toBe(0);
  });

  test("regenerates energy up to the cap", () => {
    const s = new Ship();
    s.energy = 50;
    s.energyRegen = 50;
    s.update(0.5);
    expect(s.energy).toBe(75);
  });

  test("dissipates heat down to zero", () => {
    const s = new Ship();
    s.heat = 3;
    s.heatDissipation = 10;
    s.update(1);
    expect(s.heat).toBe(0);
  });

  test("thrusting spends energy, adds heat, and accelerates along heading", () => {
    const s = new Ship({ thrustPower: 10000, mass: 1000 });
    s.energy = 100;
    s.heat = 0;
    s.setControls({ isThrusting: true });
    s.update(1);
    expect(s.energy).toBeCloseTo(85, 6); // 100 + regen(cap) - 15
    expect(s.heat).toBeCloseTo(8, 6);
    expect(s.velocity.x).toBeCloseTo(10, 6); // a = 10000/1000 = 10
    expect(s.position.x).toBeCloseTo(10, 6);
  });

  test("does not thrust when energy is insufficient", () => {
    const s = new Ship({ thrustPower: 10000, mass: 1000 });
    s.energy = 10;
    s.energyRegen = 0;
    s.setControls({ isThrusting: true });
    s.update(1);
    expect(s.velocity.x).toBe(0);
    expect(s.energy).toBe(10);
  });

  test("turning sets angular velocity by direction", () => {
    const left = new Ship({ turnRate: 2.5 });
    left.setControls({ isTurningLeft: true });
    left.update(1);
    expect(left.angularVelocity).toBe(-2.5);

    const right = new Ship({ turnRate: 2.5 });
    right.setControls({ isTurningRight: true });
    right.update(1);
    expect(right.angularVelocity).toBe(2.5);

    const both = new Ship({ turnRate: 2.5 });
    both.setControls({ isTurningLeft: true, isTurningRight: true });
    both.update(1);
    expect(both.angularVelocity).toBe(0);
  });

  test("caps speed at maxSpeed", () => {
    const s = new Ship({ maxSpeed: 100 });
    s.velocity = new Vector2D(500, 0);
    s.update(0.1);
    expect(s.velocity.magnitude()).toBeCloseTo(100, 6);
  });
});

describe("Ship overheat meltdown", () => {
  test("trips overheated when heat reaches maxHeat and decays armor", () => {
    const s = new Ship({ maxArmor: 100 });
    s.armor = 100;
    s.heat = 150;
    s.update(0.1);
    expect(s.isOverheated).toBe(true);
    expect(s.armor).toBeCloseTo(99.6, 6); // -4 * 0.1
  });

  test("halves the speed cap during meltdown", () => {
    const s = new Ship({ maxSpeed: 400 });
    s.isOverheated = true;
    s.heat = 150;
    s.velocity = new Vector2D(500, 0);
    s.update(0.1);
    expect(s.velocity.magnitude()).toBeLessThanOrEqual(200);
  });

  test("lifts meltdown once heat falls below 50", () => {
    const s = new Ship({ maxArmor: 100 });
    s.isOverheated = true;
    s.heat = 30;
    s.update(0.1);
    expect(s.isOverheated).toBe(false);
  });

  test("armor never decays below 1 from heat alone", () => {
    const s = new Ship({ maxArmor: 100 });
    s.armor = 1;
    s.isOverheated = true;
    s.heat = 150;
    s.update(1);
    expect(s.armor).toBe(1);
    expect(s.isDestroyed).toBe(false);
  });
});

describe("Ship disabled drift", () => {
  test("drifts with no power and cleared controls when disabled", () => {
    const s = new Ship();
    s.isDisabled = true;
    s.shield = 50;
    s.energy = 80;
    s.heat = 40;
    s.heatDissipation = 10;
    s.velocity = new Vector2D(10, 0);
    s.setControls({ isThrusting: true });
    s.update(1);
    expect(s.shield).toBe(0);
    expect(s.energy).toBe(0);
    expect(s.heat).toBe(30);
    expect(s.controls.isThrusting).toBe(false);
    expect(s.position.x).toBeCloseTo(10, 6); // still drifting at prior velocity
    expect(s.velocity.x).toBeCloseTo(10, 6);
  });
});

describe("Ship outfit mass handling tradeoff (P6)", () => {
  test("captures hull mass at construction and starts with zero outfit mass", () => {
    const s = new Ship({ mass: 3000 });
    expect(s.hullMass).toBe(3000);
    expect(s.outfitMass).toBe(0);
    expect(s.mass).toBe(3000);
  });

  test("addOutfitMass grows both outfitMass and total mass", () => {
    const s = new Ship({ mass: 2000 });
    s.addOutfitMass(800);
    expect(s.outfitMass).toBe(800);
    expect(s.mass).toBe(2800);
    s.addOutfitMass(200);
    expect(s.outfitMass).toBe(1000);
    expect(s.mass).toBe(3000);
    // Hull mass is immutable once captured.
    expect(s.hullMass).toBe(2000);
  });

  test("addOutfitMass ignores non-positive or non-finite values", () => {
    const s = new Ship({ mass: 2000 });
    s.addOutfitMass(0);
    s.addOutfitMass(-500);
    s.addOutfitMass(Number.NaN);
    s.addOutfitMass(Number.POSITIVE_INFINITY);
    expect(s.outfitMass).toBe(0);
    expect(s.mass).toBe(2000);
  });

  test("getEffectiveTurnRate scales inversely with total mass", () => {
    const s = new Ship({ mass: 1000, turnRate: 4 });
    expect(s.getEffectiveTurnRate()).toBe(4);
    s.addOutfitMass(1000); // total mass doubles
    expect(s.getEffectiveTurnRate()).toBeCloseTo(2, 6);
    s.addOutfitMass(2000); // total mass quadruples vs hull
    expect(s.getEffectiveTurnRate()).toBeCloseTo(1, 6);
  });

  test("heavier ship accelerates less than lighter ship under identical thrust", () => {
    const baseConfig = {
      thrustPower: 10000,
      turnRate: 2.5,
      mass: 1000,
    };
    const light = new Ship(baseConfig);
    const heavy = new Ship(baseConfig);
    heavy.addOutfitMass(3000); // 4x total mass

    light.setControls({ isThrusting: true });
    heavy.setControls({ isThrusting: true });
    light.update(1);
    heavy.update(1);

    // a = F / m, so heavy.v ≈ light.v / 4.
    expect(light.velocity.magnitude()).toBeGreaterThan(
      heavy.velocity.magnitude(),
    );
    expect(heavy.velocity.magnitude()).toBeCloseTo(
      light.velocity.magnitude() / 4,
      6,
    );
  });

  test("heavier ship turns more sluggishly under identical turn rate", () => {
    const baseConfig = {
      thrustPower: 10000,
      turnRate: 2.5,
      mass: 1000,
    };
    const light = new Ship(baseConfig);
    const heavy = new Ship(baseConfig);
    heavy.addOutfitMass(1000); // doubles mass -> half turn rate

    light.setControls({ isTurningRight: true });
    heavy.setControls({ isTurningRight: true });
    light.update(1);
    heavy.update(1);

    expect(light.heading).toBeCloseTo(2.5, 6);
    expect(heavy.heading).toBeCloseTo(1.25, 6);
    expect(heavy.angularVelocity).toBeLessThan(light.angularVelocity);
  });

  test("a fully-loaded heavy build accelerates and turns far less than a stock hull", () => {
    const stock = new Ship({ thrustPower: 8000, turnRate: 2.5 }); // mass 2000
    const loaded = new Ship({ thrustPower: 8000, turnRate: 2.5 }); // mass 2000
    // Two heavy shields + bulk cargo compressor: 800 + 800 + 1200 = 2800 kg.
    loaded.addOutfitMass(800);
    loaded.addOutfitMass(800);
    loaded.addOutfitMass(1200);
    expect(loaded.mass).toBe(4800);

    stock.setControls({ isThrusting: true, isTurningRight: true });
    loaded.setControls({ isThrusting: true, isTurningRight: true });
    stock.update(1);
    loaded.update(1);

    expect(loaded.velocity.magnitude()).toBeLessThan(
      stock.velocity.magnitude(),
    );
    expect(loaded.heading).toBeLessThan(stock.heading);
    // Stock ratio vs loaded ratio for both axes lines up with the mass ratio.
    const massRatio = stock.mass / loaded.mass;
    expect(
      loaded.velocity.magnitude() / stock.velocity.magnitude(),
    ).toBeCloseTo(massRatio, 6);
    expect(loaded.heading / stock.heading).toBeCloseTo(massRatio, 6);
  });
});

describe("Ship cargo jettison (EW6)", () => {
  test("jettisons up to the carried amount and returns a pod spec", () => {
    const s = new Ship();
    s.addCargo("minerals", 5);
    const spec = s.jettison("minerals", 3);
    expect(spec).toEqual({ resourceType: "minerals", amount: 3 });
    expect(s.cargo.minerals).toBe(2);
    expect(s.getCargoWeight()).toBe(2);
  });

  test("dumping more than carried ejects everything held", () => {
    const s = new Ship();
    s.addCargo("food", 4);
    const spec = s.jettison("food", 99);
    expect(spec).toEqual({ resourceType: "food", amount: 4 });
    expect(s.cargo.food).toBe(0);
  });

  test("returns null and changes nothing on unknown commodity or bad amount", () => {
    const s = new Ship();
    s.addCargo("luxuries", 2);
    expect(s.jettison("unobtainium", 1)).toBeNull();
    expect(s.jettison("luxuries", 0)).toBeNull();
    expect(s.jettison("luxuries", -5)).toBeNull();
    expect(s.jettison("luxuries", NaN)).toBeNull();
    expect(s.cargo.luxuries).toBe(2);
  });

  test("returns null when the commodity bay is empty", () => {
    const s = new Ship();
    expect(s.jettison("minerals", 1)).toBeNull();
  });
});
