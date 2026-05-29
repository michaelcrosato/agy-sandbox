import { Planet } from "./Planet.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("Planet construction", () => {
  test("is a static high-mass entity with sensible defaults", () => {
    const p = new Planet({ name: "Sol" });
    expect(p.type).toBe("planet");
    expect(p.name).toBe("Sol");
    expect(p.mass).toBe(1e12);
    expect(p.radius).toBe(60);
    expect(p.color).toBe("#4d6fff");
    expect(p.description).toContain("frontier");
    expect(p.landingRadius).toBe(100); // radius + 40
  });

  test("fills the full six-commodity market with defaults", () => {
    const p = new Planet({ name: "X" });
    expect(p.market).toEqual({
      food: 100,
      electronics: 300,
      minerals: 150,
      luxuries: 500,
      contraband: 250,
      machinery: 200,
    });
  });

  test("merges a partial market over the defaults", () => {
    const p = new Planet({ name: "X", market: { food: 80, luxuries: 600 } });
    expect(p.market.food).toBe(80);
    expect(p.market.luxuries).toBe(600);
    expect(p.market.electronics).toBe(300); // untouched default
  });
});

describe("Planet catalogues", () => {
  test("ships with a default outfitter catalogue", () => {
    const p = new Planet({ name: "X" });
    expect(p.outfitter.length).toBeGreaterThan(0);
    expect(p.outfitter.find((o) => o.name === "Plasma Cannon")).toBeDefined();
    expect(p.outfitter.find((o) => o.type === "shield")).toBeDefined();
  });

  test("every default outfit carries a positive mass (P6 handling tradeoff)", () => {
    const p = new Planet({ name: "X" });
    for (const outfit of p.outfitter) {
      expect(typeof outfit.mass).toBe("number");
      expect(outfit.mass).toBeGreaterThan(0);
    }
  });

  test("shields and bulk cargo holds are markedly heavier than engines", () => {
    const p = new Planet({ name: "X" });
    const findMass = (name) => p.outfitter.find((o) => o.name === name).mass;
    // Per the spec: heavy shields and big cargo holds are heavy; engines light.
    expect(findMass("Heavy Shields")).toBeGreaterThan(
      findMass("Overcharged Engines"),
    );
    expect(findMass("Aegis Shield Matrix")).toBeGreaterThan(
      findMass("Hyper-Drive Thrusters"),
    );
    expect(findMass("Sub-space Cargo Compressor")).toBeGreaterThan(
      findMass("Overcharged Engines"),
    );
  });

  test("uses a provided outfitter catalogue verbatim", () => {
    const custom = [{ name: "Test Outfit", cost: 1, type: "x", value: 1 }];
    const p = new Planet({ name: "X", outfitter: custom });
    expect(p.outfitter).toBe(custom);
  });

  test("ships with a default shipyard catalogue", () => {
    const p = new Planet({ name: "X" });
    expect(p.shipyard.length).toBe(6);
    expect(p.shipyard.find((s) => s.name === "Cargo Hauler")).toBeDefined();
  });

  test("uses a provided shipyard catalogue verbatim", () => {
    const custom = [{ name: "Test Ship", cost: 1 }];
    const p = new Planet({ name: "X", shipyard: custom });
    expect(p.shipyard).toBe(custom);
  });
});

describe("Planet landing radius", () => {
  test("derives the default landing radius from the planet radius", () => {
    const p = new Planet({ name: "X", radius: 100 });
    expect(p.landingRadius).toBe(140);
  });

  test("respects an explicit landing radius", () => {
    const p = new Planet({ name: "X", landingRadius: 250 });
    expect(p.landingRadius).toBe(250);
  });
});

describe("Planet.canLand", () => {
  const planet = () =>
    new Planet({ name: "X", position: new Vector2D(0, 0), radius: 60 }); // landingRadius 100

  test("permits a close, slow ship", () => {
    const ship = new Ship({
      position: new Vector2D(50, 0),
      velocity: new Vector2D(0, 0),
    });
    expect(planet().canLand(ship)).toBe(true);
  });

  test("rejects a ship outside the landing radius", () => {
    const ship = new Ship({
      position: new Vector2D(200, 0),
      velocity: new Vector2D(0, 0),
    });
    expect(planet().canLand(ship)).toBe(false);
  });

  test("rejects a ship that is close but moving too fast", () => {
    const ship = new Ship({
      position: new Vector2D(50, 0),
      velocity: new Vector2D(100, 0),
    });
    expect(planet().canLand(ship)).toBe(false);
  });

  test("permits a ship exactly at the radius and speed limits", () => {
    const ship = new Ship({
      position: new Vector2D(100, 0),
      velocity: new Vector2D(80, 0),
    });
    expect(planet().canLand(ship)).toBe(true); // both bounds are inclusive
  });
});
