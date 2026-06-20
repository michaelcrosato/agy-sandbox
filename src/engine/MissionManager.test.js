import { MissionManager } from "./MissionManager.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

// Lightweight planet stand-ins: generateMissionsForPlanet only reads
// `.name` and `.position.distance(...)`, so a name + Vector2D suffices.
function planet(name, x, y) {
  return { name, position: new Vector2D(x, y) };
}
const THREE = [
  planet("Sol", 0, 0),
  planet("New Polaris", 2000, -1200),
  planet("Sigma Draconis", -2200, 1600),
];

function newPlayer() {
  return new Ship({ credits: 5000, cargoCapacity: 20 });
}

describe("MissionManager.generateMissionsForPlanet edge cases", () => {
  test("generates 3 procedural missions plus one storyline for a fresh manager", () => {
    const mm = new MissionManager();
    mm.generateMissionsForPlanet("Sol", THREE);
    const list = mm.availableMissions["Sol"];
    expect(list.length).toBe(4);
    expect(list.filter((m) => m.type === "storyline").length).toBe(1);
    for (const m of list) {
      expect(m.destination).not.toBe("Sol");
      expect(m.reward).toBeGreaterThan(0);
    }
  });

  test("omits the storyline once the campaign is completed", () => {
    const mm = new MissionManager();
    mm.storylineCompleted = true;
    mm.generateMissionsForPlanet("Sol", THREE);
    const list = mm.availableMissions["Sol"];
    expect(list.length).toBe(3);
    expect(list.some((m) => m.type === "storyline")).toBe(false);
  });

  test("omits a new storyline while one is already active", () => {
    const mm = new MissionManager();
    mm.activeMissions = [{ type: "storyline", stage: 1 }];
    mm.generateMissionsForPlanet("Sol", THREE);
    const list = mm.availableMissions["Sol"];
    expect(list.length).toBe(3);
    expect(list.some((m) => m.type === "storyline")).toBe(false);
  });

  test("does nothing when the only planet is the origin", () => {
    const mm = new MissionManager();
    mm.generateMissionsForPlanet("Solo", [planet("Solo", 0, 0)]);
    expect(mm.availableMissions["Solo"]).toBeUndefined();
  });

  test("skips the storyline when fewer than two destinations exist", () => {
    const mm = new MissionManager();
    mm.generateMissionsForPlanet("Sol", [
      planet("Sol", 0, 0),
      planet("New Polaris", 1000, 0),
    ]);
    const list = mm.availableMissions["Sol"];
    expect(list.length).toBe(3); // storyline needs 2 distinct destinations
    expect(list.some((m) => m.type === "storyline")).toBe(false);
  });
});

describe("MissionManager.acceptMission", () => {
  test("returns a not-found result for an unknown mission id", () => {
    const mm = new MissionManager();
    const res = mm.acceptMission("Sol", "ghost", newPlayer());
    expect(res.success).toBe(false);
    expect(res.message).toBe("Mission not found.");
    expect(res.mission).toBeNull();
  });

  test("accepts a cargo-free bounty and fires the onBountyAccepted hook", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    let hooked = null;
    mm.onBountyAccepted = (m) => (hooked = m);
    mm.availableMissions["Sol"] = [
      {
        id: "b1",
        type: "bounty",
        title: "Wanted: Karr 50",
        reward: 3000,
        destination: "New Polaris",
        targetName: "Karr 50",
      },
    ];

    const res = mm.acceptMission("Sol", "b1", player);
    expect(res.success).toBe(true);
    expect(player.getCargoWeight()).toBe(0); // bounties carry no cargo
    expect(mm.activeMissions.length).toBe(1);
    expect(hooked).not.toBeNull();
    expect(hooked.id).toBe("b1");
  });

  test("cannot re-accept a mission that was already taken (removed from available)", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    mm.availableMissions["Sol"] = [
      {
        id: "b1",
        type: "bounty",
        title: "Wanted",
        reward: 3000,
        destination: "New Polaris",
        targetName: "X 1",
      },
    ];
    expect(mm.acceptMission("Sol", "b1", player).success).toBe(true);
    const again = mm.acceptMission("Sol", "b1", player);
    expect(again.success).toBe(false);
    expect(again.message).toBe("Mission not found.");
    expect(mm.activeMissions.length).toBe(1);
  });

  test("rejects a courier mission that will not fit in the cargo hold", () => {
    const mm = new MissionManager();
    const player = new Ship({ cargoCapacity: 5 });
    mm.availableMissions["Sol"] = [
      {
        id: "c1",
        type: "courier",
        title: "Big load",
        reward: 1000,
        destination: "New Polaris",
        cargoItem: "food",
        cargoAmount: 10,
      },
    ];
    const res = mm.acceptMission("Sol", "c1", player);
    expect(res.success).toBe(false);
    expect(res.message).toContain("Insufficient cargo capacity");
    expect(player.cargo.food).toBe(0);
    expect(mm.activeMissions.length).toBe(0);
  });
});

describe("MissionManager.checkArrivalCompletions", () => {
  test("leaves a mission active when arriving at the wrong destination", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    player.addCargo("food", 3);
    mm.activeMissions = [
      {
        id: "c1",
        type: "courier",
        destination: "Sigma Draconis",
        reward: 1000,
        cargoItem: "food",
        cargoAmount: 3,
      },
    ];
    const completed = mm.checkArrivalCompletions("New Polaris", player);
    expect(completed.length).toBe(0);
    expect(mm.activeMissions.length).toBe(1);
    expect(player.credits).toBe(5000);
    expect(player.cargo.food).toBe(3);
  });

  test("completes a smuggling run on arrival, paying out and unloading cargo", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    player.addCargo("contraband", 4);
    mm.activeMissions = [
      {
        id: "s1",
        type: "smuggle",
        destination: "Rogue's Hollow",
        reward: 2000,
        cargoItem: "contraband",
        cargoAmount: 4,
      },
    ];
    const completed = mm.checkArrivalCompletions("Rogue's Hollow", player);
    expect(completed.length).toBe(1);
    expect(completed[0].isCompleted).toBe(true);
    expect(player.credits).toBe(7000);
    expect(player.cargo.contraband).toBe(0);
    expect(mm.activeMissions.length).toBe(0);
  });

  test("only completes the missions whose destination matches", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    player.addCargo("food", 2);
    mm.activeMissions = [
      {
        id: "a",
        type: "courier",
        destination: "Alpha",
        reward: 100,
        cargoItem: "food",
        cargoAmount: 1,
      },
      {
        id: "b",
        type: "courier",
        destination: "Beta",
        reward: 200,
        cargoItem: "food",
        cargoAmount: 1,
      },
    ];
    const completed = mm.checkArrivalCompletions("Alpha", player);
    expect(completed.map((m) => m.id)).toEqual(["a"]);
    expect(mm.activeMissions.map((m) => m.id)).toEqual(["b"]);
    expect(player.credits).toBe(5100);
  });

  test("leaves a delivery/courier mission active if player lacks the cargo", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    // Do not add cargo to the player
    mm.activeMissions = [
      {
        id: "c2",
        type: "courier",
        destination: "New Polaris",
        reward: 1000,
        cargoItem: "food",
        cargoAmount: 3,
      },
    ];
    const completed = mm.checkArrivalCompletions("New Polaris", player);
    expect(completed.length).toBe(0);
    expect(mm.activeMissions.length).toBe(1);
    expect(player.credits).toBe(5000);
  });
});

describe("MissionManager.checkBountyCompletion", () => {
  test("returns null and changes nothing for an unmatched target", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    mm.activeMissions = [
      { id: "bnt", type: "bounty", targetName: "Real Target 7", reward: 4000 },
    ];
    const res = mm.checkBountyCompletion("Some Random Pirate", player);
    expect(res).toBeNull();
    expect(player.credits).toBe(5000);
    expect(mm.activeMissions.length).toBe(1);
  });

  test("advances a stage-2 storyline to stage 3 and fires the stage-advance hook", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    let advanced = null;
    mm.onStorylineStageAdvanced = (m) => (advanced = m);
    mm.activeMissions = [
      {
        id: "st",
        type: "storyline",
        campaignName: "Void Cipher",
        stage: 2,
        targetName: "Rival Agent 50",
        planets: ["Sol", "New Polaris", "Sigma Draconis"],
        reward: 15000,
      },
    ];
    const res = mm.checkBountyCompletion("Rival Agent 50", player);
    expect(res.stageAdvanced).toBe(true);
    expect(advanced).not.toBeNull();
    const m = mm.activeMissions[0];
    expect(m.stage).toBe(3);
    expect(m.targetName).toBe("Nebula Dreadnought");
    expect(m.destination).toBe("Sol"); // planets[0] for the climax
    expect(player.credits).toBe(5000); // no payout until stage 3 completes
  });
});

describe("MissionManager.abandonMission", () => {
  test("removes an active mission and returns its cargo to the hold", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    player.addCargo("food", 3);
    mm.activeMissions = [
      { id: "c1", type: "courier", cargoItem: "food", cargoAmount: 3 },
    ];
    mm.abandonMission("c1", player);
    expect(mm.activeMissions.length).toBe(0);
    expect(player.cargo.food).toBe(0);
  });

  test("is a no-op for an unknown mission id", () => {
    const mm = new MissionManager();
    const player = newPlayer();
    mm.activeMissions = [{ id: "keep", type: "bounty" }];
    mm.abandonMission("ghost", player);
    expect(mm.activeMissions.length).toBe(1);
  });
});

describe("MissionManager passenger charters (EW4)", () => {
  function passengerMission(id, dest, bunks, reward = 1000) {
    return {
      id,
      type: "passenger",
      title: `Charter to ${dest}`,
      reward,
      origin: "Sol",
      destination: dest,
      bunks,
    };
  }

  test("accepting a charter reserves bunks and adds no cargo", () => {
    const mm = new MissionManager();
    const player = new Ship({ passengerCapacity: 4 });
    mm.availableMissions["Sol"] = [passengerMission("p1", "New Polaris", 3)];
    const res = mm.acceptMission("Sol", "p1", player);
    expect(res.success).toBe(true);
    expect(player.getCargoWeight()).toBe(0);
    expect(mm.activeMissions.length).toBe(1);
  });

  test("refuses a charter that exceeds free bunks", () => {
    const mm = new MissionManager();
    const player = new Ship({ passengerCapacity: 4 });
    mm.availableMissions["Sol"] = [
      passengerMission("p1", "New Polaris", 3),
      passengerMission("p2", "Sigma Draconis", 2),
    ];
    expect(mm.acceptMission("Sol", "p1", player).success).toBe(true); // 3 bunks
    const res = mm.acceptMission("Sol", "p2", player); // +2 > 4
    expect(res.success).toBe(false);
    expect(res.message).toContain("berth");
    expect(mm.activeMissions.length).toBe(1);
  });

  test("arrival pays the reward, carries no cargo, and frees the bunks", () => {
    const mm = new MissionManager();
    const player = new Ship({ credits: 5000, passengerCapacity: 4 });
    mm.availableMissions["Sol"] = [
      passengerMission("p1", "New Polaris", 3, 1500),
    ];
    mm.acceptMission("Sol", "p1", player);

    // Wrong destination: stays active.
    expect(mm.checkArrivalCompletions("Sigma Draconis", player).length).toBe(0);
    expect(mm.activeMissions.length).toBe(1);

    // Correct destination: completes + pays, no cargo touched.
    const done = mm.checkArrivalCompletions("New Polaris", player);
    expect(done.length).toBe(1);
    expect(done[0].isCompleted).toBe(true);
    expect(player.credits).toBe(6500);
    expect(player.getCargoWeight()).toBe(0);
    expect(mm.activeMissions.length).toBe(0);

    // Bunks freed: a fresh 4-bunk charter now fits.
    mm.availableMissions["Sol"] = [passengerMission("p2", "Sigma Draconis", 4)];
    expect(mm.acceptMission("Sol", "p2", player).success).toBe(true);
  });
});
