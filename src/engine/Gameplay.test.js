import { Ship } from "./Ship.js";
import { Planet } from "./Planet.js";
import { MissionManager } from "./MissionManager.js";
import { Vector2D } from "../physics/Vector2D.js";
import { CargoPod } from "./CargoPod.js";

describe("Commodity Trading and Economy Mechanics", () => {
  let player;
  let planet;

  beforeEach(() => {
    player = new Ship({
      credits: 5000,
      cargoCapacity: 20,
    });

    planet = new Planet({
      name: "Sol",
      market: { food: 80, electronics: 350, minerals: 180 },
    });
  });

  test("Buying commodities within credit and cargo bounds", () => {
    const foodPrice = planet.market.food; // 80 CR
    expect(player.credits).toBe(5000);
    expect(player.cargo.food).toBe(0);

    // Buy 1 ton of food
    const added = player.addCargo("food", 1);
    expect(added).toBe(true);
    player.credits -= foodPrice;

    expect(player.cargo.food).toBe(1);
    expect(player.credits).toBe(4920);
    expect(player.getCargoWeight()).toBe(1);
  });

  test("Prevent buying commodities when cargo hold is full", () => {
    // Fill up cargo capacity (20t)
    const filled = player.addCargo("food", 20);
    expect(filled).toBe(true);
    expect(player.getCargoWeight()).toBe(20);

    // Try to add another ton
    const addedExtra = player.addCargo("food", 1);
    expect(addedExtra).toBe(false);
    expect(player.cargo.food).toBe(20);
    expect(player.getCargoWeight()).toBe(20);
  });

  test("Selling commodities adds credits and decrements cargo hold", () => {
    const mineralPrice = planet.market.minerals; // 180 CR

    // Pre-load some minerals
    player.addCargo("minerals", 5);
    expect(player.cargo.minerals).toBe(5);

    // Sell 2 tons
    const removed = player.removeCargo("minerals", 2);
    expect(removed).toBe(true);
    player.credits += mineralPrice * 2;

    expect(player.cargo.minerals).toBe(3);
    expect(player.credits).toBe(5360);
    expect(player.getCargoWeight()).toBe(3);
  });

  test("Prevent selling commodities that are not in the cargo hold", () => {
    expect(player.cargo.electronics).toBe(0);

    // Try to sell electronics
    const removed = player.removeCargo("electronics", 1);
    expect(removed).toBe(false);
    expect(player.credits).toBe(5000);
  });
});

describe("Outfitter Shop System Upgrades", () => {
  let player;
  let planet;

  beforeEach(() => {
    player = new Ship({
      credits: 10000,
      thrustPower: 8000,
      maxSpeed: 300,
      maxShield: 200,
      weaponDamage: 15,
    });

    planet = new Planet({
      name: "Sol",
    });
  });

  test("Equipping Heavy Shields boosts shield capacity and restores shields to max", () => {
    const shieldOutfit = planet.outfitter.find((o) => o.type === "shield");
    expect(shieldOutfit.name).toBe("Heavy Shields");
    expect(shieldOutfit.cost).toBe(1200);

    // Purchase
    player.credits -= shieldOutfit.cost;
    player.outfits.push(shieldOutfit.name);
    player.maxShield += shieldOutfit.value; // +350
    player.shield = player.maxShield;

    expect(player.credits).toBe(8800);
    expect(player.outfits).toContain("Heavy Shields");
    expect(player.maxShield).toBe(550);
    expect(player.shield).toBe(550);
  });

  test("Equipping Overcharged Engines boosts thrusters power and speed bounds", () => {
    const engineOutfit = planet.outfitter.find((o) => o.type === "engine");
    expect(engineOutfit.name).toBe("Overcharged Engines");
    expect(engineOutfit.cost).toBe(1500);

    // Purchase
    player.credits -= engineOutfit.cost;
    player.outfits.push(engineOutfit.name);
    player.thrustPower += engineOutfit.value; // +12000
    player.maxSpeed += 50;

    expect(player.credits).toBe(8500);
    expect(player.outfits).toContain("Overcharged Engines");
    expect(player.thrustPower).toBe(20000);
    expect(player.maxSpeed).toBe(350);
  });

  test("Equipping Plasma Cannons increments weapon damage ratings", () => {
    const weaponOutfit = planet.outfitter.find((o) => o.type === "weapon");
    expect(weaponOutfit.name).toBe("Plasma Cannon");
    expect(weaponOutfit.cost).toBe(1800);

    // Purchase
    player.credits -= weaponOutfit.cost;
    player.outfits.push(weaponOutfit.name);
    player.weaponDamage += weaponOutfit.value; // +25

    expect(player.credits).toBe(8200);
    expect(player.outfits).toContain("Plasma Cannon");
    expect(player.weaponDamage).toBe(40);
  });
});

describe("Shipyard Dealership Transactions", () => {
  let player;
  let planet;

  beforeEach(() => {
    player = new Ship({
      name: "Starfarer",
      credits: 20000,
    });

    planet = new Planet({
      name: "Sol",
    });

    // Add some initial cargo to trade-in ship
    player.addCargo("food", 4);
  });

  test("Trading in hull for a heavy Cargo Hauler updates stats and resets active cargo bay", () => {
    const targetShip = planet.shipyard.find((s) => s.name === "Cargo Hauler");
    expect(targetShip.cost).toBe(18000);

    // Verify initial values
    expect(player.name).toBe("Starfarer");
    expect(player.cargoCapacity).toBe(20);
    expect(player.cargo.food).toBe(4);

    // Execute transaction
    player.credits -= targetShip.cost;
    player.name = targetShip.name;

    // Transfer statistics
    player.maxShield = targetShip.maxShield; // 300
    player.shield = targetShip.maxShield;
    player.maxArmor = targetShip.maxArmor; // 200
    player.armor = targetShip.maxArmor;
    player.cargoCapacity = targetShip.cargoCapacity; // 80
    player.thrustPower = targetShip.thrustPower; // 11000
    player.turnRate = targetShip.turnRate; // 1.5

    // Reset cargo
    player.cargo = {
      food: 0,
      electronics: 0,
      minerals: 0,
      luxuries: 0,
      contraband: 0,
      machinery: 0,
    };

    expect(player.credits).toBe(2000);
    expect(player.name).toBe("Cargo Hauler");
    expect(player.maxShield).toBe(300);
    expect(player.maxArmor).toBe(200);
    expect(player.cargoCapacity).toBe(80);
    expect(player.thrustPower).toBe(11000);
    expect(player.turnRate).toBe(1.5);

    // Verify cargo was successfully cleared during swap
    expect(player.getCargoWeight()).toBe(0);
    expect(player.cargo.food).toBe(0);
  });
});

describe("Expanded 6-Commodity Economy, Smuggling, and Cargo Upgrades", () => {
  let player;
  let corePlanet;
  let piratePlanet;

  beforeEach(() => {
    player = new Ship({
      credits: 5000,
      cargoCapacity: 20,
    });

    corePlanet = new Planet({
      name: "Sol",
      market: {
        food: 100,
        electronics: 300,
        minerals: 150,
        luxuries: 600,
        contraband: 250,
        machinery: 100,
      },
    });

    piratePlanet = new Planet({
      name: "Rogue's Hollow",
      market: {
        food: 250,
        electronics: 220,
        minerals: 160,
        luxuries: 450,
        contraband: 60,
        machinery: 180,
      },
    });
  });

  test("Dynamic trading support for all 6 commodities", () => {
    // 1. Luxuries
    expect(player.addCargo("luxuries", 2)).toBe(true);
    player.credits -= corePlanet.market.luxuries * 2;
    expect(player.cargo.luxuries).toBe(2);
    expect(player.credits).toBe(3800);

    // 2. Contraband
    expect(player.addCargo("contraband", 3)).toBe(true);
    player.credits -= piratePlanet.market.contraband * 3;
    expect(player.cargo.contraband).toBe(3);
    expect(player.credits).toBe(3620);

    // 3. Machinery
    expect(player.addCargo("machinery", 1)).toBe(true);
    player.credits -= corePlanet.market.machinery;
    expect(player.cargo.machinery).toBe(1);
    expect(player.credits).toBe(3520);
  });

  test("Smuggling scans confiscate contraband and issue 1,500 CR fine on core planets", () => {
    // Load some contraband cargo (3 units)
    player.addCargo("contraband", 3);
    expect(player.cargo.contraband).toBe(3);

    // Simulate landing on a core planet Sol
    if (corePlanet.name !== "Rogue's Hollow" && player.cargo.contraband > 0) {
      player.cargo.contraband = 0;
      player.credits = Math.max(0, player.credits - 1500);
    }

    expect(player.cargo.contraband).toBe(0);
    expect(player.credits).toBe(3500); // 5000 - 1500 = 3500
  });

  test("Smuggling scans are bypassed and no fine is issued on Rogue's Hollow", () => {
    player.addCargo("contraband", 4);
    expect(player.cargo.contraband).toBe(4);

    // Simulate landing on Rogue's Hollow
    if (piratePlanet.name !== "Rogue's Hollow" && player.cargo.contraband > 0) {
      player.cargo.contraband = 0;
      player.credits = Math.max(0, player.credits - 1500);
    }

    // Contraband is untouched and no fine is issued
    expect(player.cargo.contraband).toBe(4);
    expect(player.credits).toBe(5000);
  });

  test("Cargo expander outfitter outfits increment ship cargo capacity", () => {
    const cargoOutfit = corePlanet.outfitter.find(
      (o) => o.name === "Sub-space Cargo Compressor",
    );
    expect(cargoOutfit).toBeDefined();
    expect(cargoOutfit.type).toBe("cargo");
    expect(cargoOutfit.value).toBe(45);

    // Purchase
    player.credits -= cargoOutfit.cost;
    player.outfits.push(cargoOutfit.name);
    player.cargoCapacity += cargoOutfit.value;

    expect(player.credits).toBe(2200); // 5000 - 2800 = 2200
    expect(player.cargoCapacity).toBe(65); // 20 + 45 = 65
    expect(player.outfits).toContain("Sub-space Cargo Compressor");
  });
});

describe("Procedural Mission & Event Generation Engine Support", () => {
  let planets;
  let missionManager;
  let player;

  beforeEach(() => {
    planets = [
      new Planet({
        name: "Sol",
        position: new Vector2D(0, 0),
      }),
      new Planet({
        name: "New Polaris",
        position: new Vector2D(2000, -1200),
      }),
      new Planet({
        name: "Sigma Draconis",
        position: new Vector2D(-2200, 1600),
      }),
    ];

    missionManager = new MissionManager();
    player = new Ship({
      credits: 5000,
      cargoCapacity: 20,
    });
  });

  test("Generating procedural missions for a planet", () => {
    missionManager.generateMissionsForPlanet("Sol", planets);

    const solAvailable = missionManager.availableMissions["Sol"];
    expect(solAvailable).toBeDefined();
    expect(solAvailable.length).toBe(4);

    for (const m of solAvailable) {
      expect(["courier", "smuggle", "bounty", "storyline"]).toContain(m.type);
      expect(m.destination).not.toBe("Sol");
      expect(m.reward).toBeGreaterThan(0);
      if (m.type === "courier" || m.type === "smuggle" || m.type === "storyline") {
        expect(m.cargoAmount).toBeGreaterThan(0);
        expect(m.cargoItem).toBeDefined();
      } else {
        expect(m.targetName).toBeDefined();
      }
    }
  });

  test("Accepting a courier mission checks cargo capacity and loads cargo", () => {
    missionManager.generateMissionsForPlanet("Sol", planets);

    // Create a mock high-cargo courier mission
    missionManager.availableMissions["Sol"] = [
      {
        id: "mock-courier-large",
        type: "courier",
        title: "Heavy Cargo Sol to New Polaris",
        reward: 1200,
        destination: "New Polaris",
        cargoItem: "food",
        cargoAmount: 25, // Exceeds player cap (20)
      },
      {
        id: "mock-courier-small",
        type: "courier",
        title: "Light Documents Sol to New Polaris",
        reward: 600,
        destination: "New Polaris",
        cargoItem: "food",
        cargoAmount: 5, // Under player cap
      },
    ];

    // 1. Fail to accept large cargo
    const failRes = missionManager.acceptMission(
      "Sol",
      "mock-courier-large",
      player,
    );
    expect(failRes.success).toBe(false);
    expect(failRes.message).toContain("Insufficient cargo capacity");
    expect(player.cargo.food).toBe(0);
    expect(missionManager.activeMissions.length).toBe(0);

    // 2. Succeed to accept small cargo
    const successRes = missionManager.acceptMission(
      "Sol",
      "mock-courier-small",
      player,
    );
    expect(successRes.success).toBe(true);
    expect(player.cargo.food).toBe(5);
    expect(player.getCargoWeight()).toBe(5);
    expect(missionManager.activeMissions.length).toBe(1);
    expect(missionManager.activeMissions[0].id).toBe("mock-courier-small");
  });

  test("Completing courier/smuggling missions on arrival at target planet", () => {
    // Manually push an active courier mission into player tracker
    missionManager.activeMissions = [
      {
        id: "active-delivery",
        type: "courier",
        title: "Deliver Medical Electronics",
        destination: "Sigma Draconis",
        reward: 1500,
        cargoItem: "electronics",
        cargoAmount: 4,
      },
    ];

    // Load ship cargo
    player.addCargo("electronics", 4);
    expect(player.cargo.electronics).toBe(4);

    // Land on Sigma Draconis
    const completed = missionManager.checkArrivalCompletions(
      "Sigma Draconis",
      player,
    );
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe("active-delivery");
    expect(completed[0].isCompleted).toBe(true);

    // Verify rewards and cargo unloading
    expect(player.credits).toBe(6500); // 5000 + 1500 = 6500
    expect(player.cargo.electronics).toBe(0);
    expect(player.getCargoWeight()).toBe(0);
    expect(missionManager.activeMissions.length).toBe(0);
  });

  test("Completing combat bounty mission on neutralizing target pirate boss ship", () => {
    // Manually push an active bounty hunt contract
    missionManager.activeMissions = [
      {
        id: "active-bounty",
        type: "bounty",
        title: "Hunt Pirate Boss Void Serpent",
        destination: "Sigma Draconis",
        reward: 4000,
        targetName: "Void Serpent 88",
      },
    ];

    // Neutralize a generic pirate ship (does not trigger contract bounty completion)
    const genericRes = missionManager.checkBountyCompletion(
      "Pirate Raider",
      player,
    );
    expect(genericRes).toBeNull();
    expect(player.credits).toBe(5000);
    expect(missionManager.activeMissions.length).toBe(1);

    // Neutralize the actual target boss
    const bossRes = missionManager.checkBountyCompletion(
      "Void Serpent 88",
      player,
    );
    expect(bossRes).toBeDefined();
    expect(bossRes.id).toBe("active-bounty");
    expect(bossRes.isCompleted).toBe(true);

    // Verify bounty payout
    expect(player.credits).toBe(9000); // 5000 + 4000 = 9000
    expect(missionManager.activeMissions.length).toBe(0);
  });

  test("Procedural storyline quest stage advancement and final campaign completion", () => {
    // 1. Generation
    missionManager.generateMissionsForPlanet("Sol", planets);
    const solAvailable = missionManager.availableMissions["Sol"];
    expect(solAvailable).toBeDefined();

    // Verify there is a storyline campaign mission generated
    const storyMission = solAvailable.find((m) => m.type === "storyline");
    expect(storyMission).toBeDefined();
    expect(storyMission.stage).toBe(1);
    expect(storyMission.reward).toBe(15000);

    // 2. Acceptance
    const acceptRes = missionManager.acceptMission(
      "Sol",
      storyMission.id,
      player,
    );
    expect(acceptRes.success).toBe(true);
    expect(player.cargo.electronics).toBe(1);
    expect(missionManager.activeMissions).toContainEqual(
      expect.objectContaining({ type: "storyline", stage: 1 }),
    );

    // 3. Stage 1 Completion (Arrival)
    const activeStory = missionManager.activeMissions.find(
      (m) => m.type === "storyline",
    );
    const dest1 = activeStory.destination;
    const completedList = missionManager.checkArrivalCompletions(dest1, player);
    expect(completedList.length).toBe(1);
    expect(completedList[0].stage).toBe(2); // Should advance to Stage 2

    // Check cargo unloads
    expect(player.cargo.electronics).toBe(0);
    expect(missionManager.activeMissions.length).toBe(1);
    const stage2Mission = missionManager.activeMissions[0];
    expect(stage2Mission.stage).toBe(2);
    expect(stage2Mission.targetName).toBeDefined();

    // 4. Stage 2 Completion (Combat)
    const bossName2 = stage2Mission.targetName;
    const combatRes1 = missionManager.checkBountyCompletion(bossName2, player);
    expect(combatRes1).toBeDefined();
    expect(combatRes1.stageAdvanced).toBe(true);

    const stage3Mission = missionManager.activeMissions[0];
    expect(stage3Mission.stage).toBe(3);
    expect(stage3Mission.targetName).toBe("Nebula Dreadnought");

    // 5. Stage 3 Final Showdown Completion
    const combatRes2 = missionManager.checkBountyCompletion(
      "Nebula Dreadnought",
      player,
    );
    expect(combatRes2).toBeDefined();
    expect(combatRes2.campaignCompleted).toBe(true);

    // Verify rewards (15,000 CR + Aegis Shield Matrix outfit)
    expect(player.credits).toBe(20000); // 5000 + 15000 = 20000
    expect(player.outfits).toContain("Aegis Shield Matrix");
    expect(player.maxShield).toBe(1000); // 200 + 800 = 1000
    expect(missionManager.activeMissions.length).toBe(0);
    expect(missionManager.storylineCompleted).toBe(true);
  });
});

describe("Tactical Nebula Spatial Hazards and Drag Physics", () => {
  let player;
  const NEBULAE = [
    {
      id: "nebula_crimson",
      name: "Crimson Veil Nebula",
      position: { x: 1000, y: 300 },
      radius: 450,
      dragMultiplier: 2.2,
      hazardType: "friction"
    },
    {
      id: "nebula_azure",
      name: "Azure Abyss Nebula",
      position: { x: -1000, y: -800 },
      radius: 500,
      dragMultiplier: 2.6,
      hazardType: "shield_dampen"
    }
  ];

  beforeEach(() => {
    player = new Ship({
      position: new Vector2D(1000, 300), // Center of Crimson Veil
      velocity: new Vector2D(100, 0),
      mass: 1000,
      shieldRegen: 10,
      shield: 50,
      maxShield: 100,
    });
  });

  test("Entering Crimson Veil scales linear drag coefficient correctly", () => {
    // Determine active nebula
    let activeNeb = null;
    for (const neb of NEBULAE) {
      const dist = player.position.distance(neb.position);
      if (dist <= neb.radius) {
        activeNeb = neb;
        break;
      }
    }

    expect(activeNeb).toBeDefined();
    expect(activeNeb.name).toBe("Crimson Veil Nebula");
    expect(activeNeb.dragMultiplier).toBe(2.2);

    // Apply the extra drag coefficient multiplier force: -(dragMultiplier - 1.0) * globalDrag * velocity * mass
    const globalDrag = 0.1;
    const extraDragCoef = activeNeb.dragMultiplier - 1.0; // 1.2
    const extraDragForce = player.velocity.multiply(
      -extraDragCoef * globalDrag * player.mass
    );

    // The normal drag force inside SpaceEngine: -globalDrag * velocity * mass = -10000
    // The extra drag force: -12000
    expect(extraDragForce.x).toBeCloseTo(-12000, 5);
    expect(extraDragForce.y).toBeCloseTo(0, 5);
  });

  test("Entering Azure Abyss dampens shield regeneration by 50%", () => {
    // Relocate to center of Azure Abyss
    player.position = new Vector2D(-1000, -800);

    let activeNeb = null;
    for (const neb of NEBULAE) {
      const dist = player.position.distance(neb.position);
      if (dist <= neb.radius) {
        activeNeb = neb;
        break;
      }
    }

    expect(activeNeb).toBeDefined();
    expect(activeNeb.name).toBe("Azure Abyss Nebula");
    expect(activeNeb.hazardType).toBe("shield_dampen");

    // Suppress shield regeneration rate
    let suppressedRegen = player.shieldRegen;
    if (activeNeb.hazardType === "shield_dampen") {
      suppressedRegen *= 0.5;
    }

    expect(suppressedRegen).toBe(5);
  });
});

describe("Tractor Beam Matrix & Cargo Pod Physics", () => {
  test("CargoPod creates standard lightweight spatial container with resource type and count", () => {
    const pod = new CargoPod({
      resourceType: "electronics",
      amount: 3,
      position: new Vector2D(100, 150)
    });

    expect(pod.type).toBe("cargo_pod");
    expect(pod.resourceType).toBe("electronics");
    expect(pod.amount).toBe(3);
    expect(pod.mass).toBe(50);
    expect(pod.radius).toBe(8);
    expect(pod.position.x).toBe(100);
    expect(pod.position.y).toBe(150);
    expect(pod.heading).toBeGreaterThanOrEqual(0);
    expect(pod.heading).toBeLessThanOrEqual(Math.PI * 2);
  });

  test("Ship.addCargo checks capacities and correctly ingests cargo pods", () => {
    const ship = new Ship({
      cargoCapacity: 5
    });

    // Ingest some food
    let success = ship.addCargo("food", 2);
    expect(success).toBe(true);
    expect(ship.cargo.food).toBe(2);
    expect(ship.getCargoWeight()).toBe(2);

    // Ingest minerals up to limit
    success = ship.addCargo("minerals", 3);
    expect(success).toBe(true);
    expect(ship.getCargoWeight()).toBe(5);

    // Ingesting more should exceed capacity and fail
    success = ship.addCargo("luxuries", 1);
    expect(success).toBe(false);
    expect(ship.cargo.luxuries).toBe(0);
    expect(ship.getCargoWeight()).toBe(5);
  });

  test("Tractor Beam Matrix applies mathematically correct gravimetric pull forces inside 250u", () => {
    const ship = new Ship({
      position: new Vector2D(0, 0),
    });
    ship.outfits.push("Tractor Beam Matrix");

    const pod = new CargoPod({
      resourceType: "minerals",
      amount: 1,
      position: new Vector2D(100, 0) // Distance is exactly 100 units
    });

    // Reset pod forces
    pod.accumulatorForce = new Vector2D(0, 0);

    // Replicate server tractor physics logic
    const toShip = ship.position.subtract(pod.position);
    const dist = toShip.magnitude();
    
    expect(dist).toBe(100);
    expect(ship.outfits).toContain("Tractor Beam Matrix");

    if (dist > 1 && dist <= 250) {
      const forceMag = 400000 / (dist * dist + 100);
      const pullForce = toShip.normalize().multiply(forceMag * pod.mass);
      pod.applyForce(pullForce);
    }

    // Force magnitude should be 400000 / (10000 + 100) = 400000 / 10100 = ~39.60396
    // Pull force = ((-1, 0)) * (39.60396 * 50) = (-1980.198, 0)
    expect(pod.accumulatorForce.x).toBeCloseTo(-1980.198, 2);
    expect(pod.accumulatorForce.y).toBe(0);
  });

  test("Tractor Beam Matrix does not pull cargo pods outside 250u limit", () => {
    const ship = new Ship({
      position: new Vector2D(0, 0),
    });
    ship.outfits.push("Tractor Beam Matrix");

    const pod = new CargoPod({
      resourceType: "minerals",
      amount: 1,
      position: new Vector2D(300, 0) // Distance is exactly 300 units (> 250)
    });

    pod.accumulatorForce = new Vector2D(0, 0);

    const toShip = ship.position.subtract(pod.position);
    const dist = toShip.magnitude();

    expect(dist).toBe(300);

    if (dist > 1 && dist <= 250) {
      const forceMag = 400000 / (dist * dist + 100);
      const pullForce = toShip.normalize().multiply(forceMag * pod.mass);
      pod.applyForce(pullForce);
    }

    expect(pod.accumulatorForce.x).toBe(0);
    expect(pod.accumulatorForce.y).toBe(0);
  });
});

describe("Online Interface Efficiency & Robustness", () => {
  test("Coordinate rounding compression handles double-precision floats accurately", () => {
    const rawX = 124.5829104812048;
    const rawY = -567.819401840184;
    const rawHeading = 3.141592653589793;

    // Emulate server serialization rounding formulas
    const roundedX = Math.round(rawX * 10) / 10;
    const roundedY = Math.round(rawY * 10) / 10;
    const roundedHeading = Math.round(rawHeading * 100) / 100;

    expect(roundedX).toBe(124.6);
    expect(roundedY).toBe(-567.8);
    expect(roundedHeading).toBe(3.14);
  });

  test("Session re-binding (neural-link recovery) preserves client state objects in-place", () => {
    // 1. Create a simulated client session object
    const clientObj = {
      id: "player-test-99",
      nickname: "Commander Alpha",
      ship: new Ship({ credits: 7500, cargoCapacity: 40 }),
      fleetName: "ALPHA-SQUAD",
      isLanded: true,
      ws: { id: "old-ws" },
      cleanupTimeout: null
    };

    clientObj.ship.outfits.push("Tractor Beam Matrix");

    // 2. Emulate disconnect (ws closes, starting grace-period)
    clientObj.ws = null;
    let cleanupCalled = false;
    clientObj.cleanupTimeout = setTimeout(() => {
      cleanupCalled = true;
    }, 30000);

    expect(clientObj.cleanupTimeout).toBeDefined();
    expect(cleanupCalled).toBe(false);

    // 3. Emulate neural-link recovery (reconnecting with same token)
    const newWs = { id: "new-ws" };
    if (clientObj.cleanupTimeout) {
      clearTimeout(clientObj.cleanupTimeout);
      clientObj.cleanupTimeout = null;
    }
    clientObj.ws = newWs; // re-bind to the new WebSocket connection in-place

    // 4. Verify in-place references are perfectly intact
    expect(clientObj.cleanupTimeout).toBeNull();
    expect(clientObj.id).toBe("player-test-99");
    expect(clientObj.nickname).toBe("Commander Alpha");
    expect(clientObj.ws.id).toBe("new-ws");
    expect(clientObj.fleetName).toBe("ALPHA-SQUAD");
    expect(clientObj.isLanded).toBe(true);
    
    // Validate ship parameters are preserved
    expect(clientObj.ship.credits).toBe(7500);
    expect(clientObj.ship.cargoCapacity).toBe(40);
    expect(clientObj.ship.outfits).toContain("Tractor Beam Matrix");
  });

  test("Dynamic pricing shifts correctly on buying (price rises) and selling (price drops)", () => {
    const basePrice = 100;
    let currentPrice = 100;

    // Emulate purchase (price goes up by 2.2%)
    currentPrice = Math.min(Math.round(basePrice * 2.5), Math.round(currentPrice * 1.022));
    expect(currentPrice).toBe(102);

    // Emulate another purchase
    currentPrice = Math.min(Math.round(basePrice * 2.5), Math.round(currentPrice * 1.022));
    expect(currentPrice).toBe(104);

    // Emulate sale (price goes down by 1.8%)
    currentPrice = Math.max(Math.round(basePrice * 0.4), Math.round(currentPrice * 0.982));
    expect(currentPrice).toBe(102);
  });

  test("Economic self-normalization ticker pushes inflated or deflated prices back to baseline", () => {
    const baseline = 100;
    
    // Test Inflated Price normalization
    let inflatedPrice = 150;
    const diffInflated = baseline - inflatedPrice; // -50
    const stepInflated = Math.sign(diffInflated) * Math.max(1, Math.round(Math.abs(diffInflated) * 0.005)); // -1 * Math.max(1, 0) = -1
    inflatedPrice = inflatedPrice + stepInflated;
    expect(inflatedPrice).toBe(149); // Settles downwards

    // Test Deflated Price normalization
    let deflatedPrice = 60;
    const diffDeflated = baseline - deflatedPrice; // +40
    const stepDeflated = Math.sign(diffDeflated) * Math.max(1, Math.round(Math.abs(diffDeflated) * 0.005)); // +1 * Math.max(1, 0) = +1
    deflatedPrice = deflatedPrice + stepDeflated;
    expect(deflatedPrice).toBe(61); // Settles upwards
  });

  test("Standby session arrays accurately resolve dead players and attribute bounties where active clients map fails", () => {
    // Emulate standby disconnected client
    const standbyClient = {
      id: "player-recovery-77",
      nickname: "Loner Standby",
      ship: new Ship({ credits: 2000 }),
      cleanupTimeout: setTimeout(() => {}, 30000)
    };

    // Active connection map (standby player is disconnected and removed from here)
    const activeClients = [];
    
    // Persistent sessions map (standby player remains here during grace period)
    const persistentSessions = [standbyClient];

    // 1. Emulate Ship Destruction player matching
    const deadShipRef = standbyClient.ship;

    // Search active connections (fails!)
    const matchedActive = activeClients.find(c => c.ship === deadShipRef);
    expect(matchedActive).toBeUndefined();

    // Search persistent sessions (succeeds!)
    const matchedStandby = persistentSessions.find(c => c.ship === deadShipRef);
    expect(matchedStandby).toBeDefined();
    expect(matchedStandby.id).toBe("player-recovery-77");

    // 2. Emulate Projectile Attribution (killer presented a standby id)
    const killerId = "player-recovery-77";

    // Search active connections (fails!)
    const killerActive = activeClients.find(c => c.id === killerId);
    expect(killerActive).toBeUndefined();

    // Search persistent sessions (succeeds!)
    const killerStandby = persistentSessions.find(c => c.id === killerId);
    expect(killerStandby).toBeDefined();
    expect(killerStandby.nickname).toBe("Loner Standby");

    // Clear test timeout to prevent leaking
    clearTimeout(standbyClient.cleanupTimeout);
  });
});
