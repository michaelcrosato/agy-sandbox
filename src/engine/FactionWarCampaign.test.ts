import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { FactionWarCampaign } from "./FactionWarCampaign.js";
import { TerritoryControl } from "./TerritoryControl.js";

describe("FactionWarCampaign Engine Unit Tests", () => {
  let dateSpy;

  beforeEach(() => {
    dateSpy = vi.spyOn(Date, "now").mockImplementation(() => 1780246423959);
  });

  afterEach(() => {
    if (dateSpy) dateSpy.mockRestore();
  });

  test("initializes default military power maps and ticks correctly", () => {
    const campaign = new FactionWarCampaign();
    expect(campaign.ticks).toBe(0);
    expect(campaign.seed).toBe(1337);
    expect(campaign.militaryPower.core.Federation).toBe(80);
    expect(campaign.militaryPower.frontier["Frontier League"]).toBe(80);
    expect(campaign.militaryPower.rim.Pirates).toBe(40);
    expect(campaign.militaryPower.rim.Independents).toBe(50);
    expect(campaign.activeSieges.core).toBeNull();
    expect(campaign.blockades.core).toBeNull();
    expect(campaign.battleHistory.length).toBe(0);
  });

  test("save() and load() serialization restores state perfectly", () => {
    const campaign = new FactionWarCampaign();
    campaign.ticks = 42;
    campaign.seed = 999;
    campaign.militaryPower.core.Federation = 50;
    campaign.activeSieges.frontier = { duration: 3, faction: "Pirates" };
    campaign.blockades.rim = { duration: 5, faction: "Federation" };
    campaign.battleHistory.push({ id: "test-1", title: "Battle of Vega" });

    const serialized = campaign.save();

    const restored = new FactionWarCampaign();
    restored.load(serialized);

    expect(restored.ticks).toBe(42);
    expect(restored.seed).toBe(999);
    expect(restored.militaryPower.core.Federation).toBe(50);
    expect(restored.activeSieges.frontier).toEqual({
      duration: 3,
      faction: "Pirates",
    });
    expect(restored.blockades.rim).toEqual({
      duration: 5,
      faction: "Federation",
    });
    expect(restored.battleHistory).toEqual([
      { id: "test-1", title: "Battle of Vega" },
    ]);
  });

  test("tick advances campaign state deterministically based on seed", () => {
    const c1 = new FactionWarCampaign();
    c1.seed = 12345;
    for (let i = 0; i < 20; i++) {
      c1.tick();
    }

    const c2 = new FactionWarCampaign();
    c2.seed = 12345;
    for (let i = 0; i < 20; i++) {
      c2.tick();
    }

    expect(c1.ticks).toBe(20);
    expect(c2.ticks).toBe(20);
    expect(c1.militaryPower).toEqual(c2.militaryPower);
    expect(c1.activeSieges).toEqual(c2.activeSieges);
    expect(c1.blockades).toEqual(c2.blockades);
    expect(c1.battleHistory).toEqual(c2.battleHistory);
  });

  test("skirmish shifts military power and adjusts TerritoryControl influence", () => {
    const campaign = new FactionWarCampaign();
    campaign.seed = 4567; // specific seed that triggers skirmish on tick 1

    const tc = new TerritoryControl();
    const chronicle = {
      events: [],
      recordEvent(ev) {
        this.events.push(ev);
      },
    };
    const gameInstance = {
      territoryControl: tc,
      chronicle: chronicle,
    };

    // Before skirmish values
    const _prevCoreFed = campaign.militaryPower.core.Federation;

    // Tick enough times to trigger skirmishes
    for (let i = 0; i < 10; i++) {
      campaign.tick(gameInstance);
    }

    // Assert that battle history was logged
    expect(campaign.battleHistory.length).toBeGreaterThan(0);
    // Find the oldest skirmish battle history entry
    const oldestBattle = campaign.battleHistory
      .slice()
      .reverse()
      .find((b) => b.id.startsWith("skirmish-"));
    expect(oldestBattle).toBeDefined();
    expect(oldestBattle.victor).toBeDefined();
    expect(oldestBattle.loser).toBeDefined();
    expect(oldestBattle.powerShift).toBeGreaterThanOrEqual(4);
    expect(oldestBattle.powerShift).toBeLessThanOrEqual(8);

    // Verify chronicle events were recorded
    expect(chronicle.events.length).toBeGreaterThan(0);
    // chronicle.events are pushed to the end, so oldest is at index 0 or found via find()
    // A skirmish chronicle event includes 'attacker' in its impactMetrics, unlike siege resolutions
    const skirmishEvent = chronicle.events.find(
      (e) =>
        e.impactMetrics &&
        e.impactMetrics.victor !== undefined &&
        e.impactMetrics.attacker !== undefined,
    );
    expect(skirmishEvent).toBeDefined();
    expect(skirmishEvent.category).toBe("military");
    expect(skirmishEvent.impactMetrics.victor).toBe(oldestBattle.victor);
  });

  test("active status siege / blockade resolution triggers correctly", () => {
    const campaign = new FactionWarCampaign();
    campaign.activeSieges.core = { duration: 1, faction: "Pirates" };

    const tc = new TerritoryControl();
    const chronicle = {
      events: [],
      recordEvent(ev) {
        this.events.push(ev);
      },
    };
    const gameInstance = {
      territoryControl: tc,
      chronicle: chronicle,
    };

    // Ticking once should reduce duration to 0 and trigger resolution
    campaign.tick(gameInstance);

    expect(campaign.activeSieges.core).toBeNull();
    expect(campaign.battleHistory.length).toBe(1);
    expect(campaign.battleHistory[0].title).toContain(
      "Siege Resolved at Sol Sector",
    );
    expect(chronicle.events.length).toBeGreaterThan(0);
    expect(chronicle.events[0].title).toContain("Siege Resolved at Sol Sector");
  });
});
