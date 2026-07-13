import { describe, test, expect, beforeEach } from "vitest";
import { InMemoryStore } from "./Store.js";
import { GalacticChronicle } from "./GalacticChronicle.js";

describe("GalacticChronicle", () => {
  let store;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  test("constructor throws if store is not provided", () => {
    expect(() => new GalacticChronicle()).toThrow(TypeError);
    expect(() => new GalacticChronicle({ store: null })).toThrow(TypeError);
  });

  test("loads empty events list on empty store", async () => {
    const chronicle = new GalacticChronicle({ store });
    const events = await chronicle.load();
    expect(events).toEqual([]);
    expect(chronicle.getEvents()).toEqual([]);
  });

  test("records and prunes events beyond max capacity", async () => {
    const chronicle = new GalacticChronicle({ store, maxEvents: 3 });
    await chronicle.load();

    const e1 = await chronicle.recordEvent({
      sector: "Sector 1",
      category: "economy",
      title: "Ore Shortage",
      description: "Severe lack of ores.",
      impactMetrics: { priceFactor: 2.0 },
    });

    const e2 = await chronicle.recordEvent({
      sector: "Sector 2",
      category: "combat",
      title: "Faction Skirmish",
      description: "Federation clashed with pirates.",
    });

    const e3 = await chronicle.recordEvent({
      sector: "Sector 3",
      category: "stargate",
      title: "Interdiction Field Active",
      description: "Stargate J-29 is interdicted.",
    });

    expect(chronicle.getEvents()).toHaveLength(3);
    // Newest first order
    expect(chronicle.getEvents()[0]).toEqual(e3);
    expect(chronicle.getEvents()[1]).toEqual(e2);
    expect(chronicle.getEvents()[2]).toEqual(e1);

    // Record a 4th event, which should prune the oldest (e1)
    const e4 = await chronicle.recordEvent({
      sector: "Sector 4",
      category: "economy",
      title: "Surplus Food",
      description: "Huge harvest on Agri-world.",
    });

    expect(chronicle.getEvents()).toHaveLength(3);
    expect(chronicle.getEvents()[0]).toEqual(e4);
    expect(chronicle.getEvents()[1]).toEqual(e3);
    expect(chronicle.getEvents()[2]).toEqual(e2);

    // Verify it actually round-trips via the store
    const loadedData = await store.load("chronicle");
    expect(loadedData).toEqual(chronicle.getEvents());
  });

  test("loads persisted chronicle correctly", async () => {
    const chronicle1 = new GalacticChronicle({ store });
    await chronicle1.recordEvent({
      category: "economy",
      title: "Shortage",
      description: "Shortage of food.",
    });

    const chronicle2 = new GalacticChronicle({ store });
    const loaded = await chronicle2.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("Shortage");
  });

  test("concurrent save calls execute sequentially without clobbering", async () => {
    const chronicle = new GalacticChronicle({ store });
    const p1 = chronicle.recordEvent({ title: "Event A" });
    const p2 = chronicle.recordEvent({ title: "Event B" });
    const p3 = chronicle.recordEvent({ title: "Event C" });

    await Promise.all([p1, p2, p3]);

    const finalEvents = chronicle.getEvents();
    expect(finalEvents).toHaveLength(3);
    expect(finalEvents[0].title).toBe("Event C");
    expect(finalEvents[1].title).toBe("Event B");
    expect(finalEvents[2].title).toBe("Event A");

    const storeData = await store.load("chronicle");
    expect(storeData).toEqual(finalEvents);
  });

  test("clear clears memory and store", async () => {
    const chronicle = new GalacticChronicle({ store });
    await chronicle.recordEvent({ title: "Test Event" });
    expect(chronicle.getEvents()).toHaveLength(1);

    await chronicle.clear();
    expect(chronicle.getEvents()).toHaveLength(0);

    const storeData = await store.load("chronicle");
    expect(storeData).toEqual([]);
  });
});
