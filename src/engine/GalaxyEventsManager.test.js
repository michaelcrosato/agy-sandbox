import { GalaxyEventsManager } from "./GalaxyEventsManager.js";

describe("GalaxyEventsManager core logic", () => {
  it("initializes with null active event", () => {
    const gem = new GalaxyEventsManager();
    expect(gem.activeEvent).toBeNull();
    expect(gem.getPriceModifier("food")).toBe(1.0);
  });

  it("triggers a forced event type successfully", () => {
    const gem = new GalaxyEventsManager();
    const event = gem.triggerEvent("famine");
    expect(gem.activeEvent).toBeDefined();
    expect(gem.activeEvent.type).toBe("famine");
    expect(gem.activeEvent.name).toBe("Famine");
    expect(gem.activeEvent.duration).toBe(120);

    // Modifier check
    expect(gem.getPriceModifier("food")).toBe(3.0);
    expect(gem.getPriceModifier("electronics")).toBe(0.8);
    expect(gem.getPriceModifier("minerals")).toBe(1.0);
  });

  it("triggers random event using custom RNG", () => {
    let rngVal = 0.5; // mid range
    const gem = new GalaxyEventsManager({ rng: () => rngVal });
    const event = gem.triggerEvent();
    expect(gem.activeEvent).not.toBeNull();
    expect(event.priceModifiers).toBeDefined();
  });

  it("ticks down and expires active event", () => {
    const gem = new GalaxyEventsManager();
    gem.triggerEvent("famine", 10);

    // Tick 5 secs, should not expire
    const expired1 = gem.tick(5);
    expect(expired1).toBe(false);
    expect(gem.activeEvent).not.toBeNull();
    expect(gem.activeEvent.duration).toBe(5);

    // Tick another 5 secs, should expire
    const expired2 = gem.tick(5);
    expect(expired2).toBe(true);
    expect(gem.activeEvent).toBeNull();
    expect(gem.getPriceModifier("food")).toBe(1.0);
  });

  it("serializes and deserializes cleanly", () => {
    const gem = new GalaxyEventsManager();
    gem.triggerEvent("harvest_boom", 45);

    const snapshot = gem.serialize();
    expect(snapshot.activeEvent).not.toBeNull();
    expect(snapshot.activeEvent.type).toBe("harvest_boom");
    expect(snapshot.activeEvent.duration).toBe(45);

    const otherGem = new GalaxyEventsManager();
    otherGem.deserialize(snapshot);
    expect(otherGem.activeEvent).not.toBeNull();
    expect(otherGem.activeEvent.type).toBe("harvest_boom");
    expect(otherGem.activeEvent.duration).toBe(45);
    expect(otherGem.getPriceModifier("ore")).toBe(0.4);

    otherGem.deserialize(null);
    expect(otherGem.activeEvent).toBeNull();
  });
});
