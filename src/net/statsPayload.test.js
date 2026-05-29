import { buildStatsPayload } from "./statsPayload.js";
import { Ship } from "../engine/Ship.js";
import { MissionManager } from "../engine/MissionManager.js";

describe("statsPayload.buildStatsPayload (spec 007)", () => {
  test("returns null when there is no ship", () => {
    expect(buildStatsPayload({})).toBeNull();
    expect(buildStatsPayload(null)).toBeNull();
  });

  test("emits a 'stats' message with combat + resource fields", () => {
    const ship = new Ship({ credits: 4242, name: "Vega" });
    ship.kills = 3;
    ship.combatRating = 42;
    const mm = new MissionManager();
    const payload = buildStatsPayload({ ship, missionManager: mm });
    expect(payload.type).toBe("stats");
    expect(payload.credits).toBe(4242);
    expect(payload.name).toBe("Vega");
    expect(payload.kills).toBe(3);
    expect(payload.combatRating).toBe(42);
    expect(payload.maxHyperFuel).toBe(100);
    expect(payload.activeMissions).toBe(mm.activeMissions);
  });

  test("tolerates a missing missionManager", () => {
    const payload = buildStatsPayload({ ship: new Ship() });
    expect(payload.activeMissions).toEqual([]);
  });
});
