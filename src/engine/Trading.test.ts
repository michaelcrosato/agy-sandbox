import { describe, test, expect } from "vitest";
import { tradeOne, applyHullPurchase, findBestTradeRoutes } from "./Trading.js";
import { Ship } from "./Ship.js";

describe("Trading.tradeOne (spec 025)", () => {
  test("buy: charges credits and loads one ton", () => {
    const s = new Ship({ credits: 1000, cargoCapacity: 10 });
    const r = tradeOne(s, "food", "buy", 120);
    expect(r).toEqual({ ok: true, reason: "bought" });
    expect(s.credits).toBe(880);
    expect(s.cargo.food).toBe(1);
  });

  test("buy: insufficient credits is a no-op", () => {
    const s = new Ship({ credits: 50, cargoCapacity: 10 });
    const r = tradeOne(s, "food", "buy", 120);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("insufficient_credits");
    expect(s.credits).toBe(50);
    expect(s.cargo.food).toBe(0);
  });

  test("buy: a full hold blocks the purchase (no charge)", () => {
    const s = new Ship({ credits: 1000, cargoCapacity: 2 });
    s.addCargo("minerals", 2);
    const r = tradeOne(s, "food", "buy", 120);
    expect(r.reason).toBe("cargo_full");
    expect(s.credits).toBe(1000);
  });

  test("sell: pays out and unloads one ton", () => {
    const s = new Ship({ credits: 100 });
    s.addCargo("luxuries", 3);
    const r = tradeOne(s, "luxuries", "sell", 500);
    expect(r).toEqual({ ok: true, reason: "sold" });
    expect(s.credits).toBe(600);
    expect(s.cargo.luxuries).toBe(2);
  });

  test("sell: nothing to sell is a no-op", () => {
    const s = new Ship({ credits: 100 });
    const r = tradeOne(s, "food", "sell", 500);
    expect(r.reason).toBe("no_cargo");
    expect(s.credits).toBe(100);
  });

  test("guards invalid ship/price/action", () => {
    expect(tradeOne(null, "food", "buy", 100).ok).toBe(false);
    expect(tradeOne(new Ship(), "food", "buy", NaN).ok).toBe(false);
    expect(tradeOne(new Ship(), "food", "trade", 100).reason).toBe(
      "unknown_action",
    );
  });
});

describe("Trading.applyHullPurchase (spec 025)", () => {
  const hull = {
    name: "Heavy Freighter",
    cost: 35000,
    maxShield: 500,
    maxArmor: 350,
    cargoCapacity: 200,
    thrustPower: 16000,
    turnRate: 1.2,
  };

  test("swaps hull stats, resets cargo, charges credits", () => {
    const s = new Ship({ credits: 40000 });
    s.addCargo("food", 5);
    const r = applyHullPurchase(s, hull);
    expect(r).toEqual({ ok: true, reason: "purchased" });
    expect(s.credits).toBe(5000);
    expect(s.name).toBe("Heavy Freighter");
    expect(s.maxShield).toBe(500);
    expect(s.shield).toBe(500);
    expect(s.maxArmor).toBe(350);
    expect(s.cargoCapacity).toBe(200);
    expect(s.cargo.food).toBe(0);
  });

  test("insufficient credits is a no-op", () => {
    const s = new Ship({ credits: 100, name: "Shuttle" });
    const r = applyHullPurchase(s, hull);
    expect(r.reason).toBe("insufficient_credits");
    expect(s.credits).toBe(100);
    expect(s.name).toBe("Shuttle");
  });

  test("null-safe", () => {
    expect(applyHullPurchase(null, hull).ok).toBe(false);
    expect(applyHullPurchase(new Ship(), null).ok).toBe(false);
  });
});

describe("Trading.findBestTradeRoutes", () => {
  test("finds and sorts top trade routes correctly", () => {
    const planets = [
      {
        name: "Sol",
        faction: "Federation",
        market: { food: 100, luxuries: 400 },
      },
      {
        name: "Valkyrie Depot",
        faction: "Federation",
        market: { food: 200, luxuries: 200 },
      },
    ];

    const routes = findBestTradeRoutes(planets, null, "p1");
    expect(routes.length).toBe(2);
    expect(routes[0].commodity).toBe("luxuries");
    expect(routes[0].netProfit).toBe(200);
    expect(routes[1].commodity).toBe("food");
    expect(routes[1].netProfit).toBe(100);
  });

  test("null-safe and guards empty inputs", () => {
    expect(findBestTradeRoutes(null, null, "p1")).toEqual([]);
    expect(findBestTradeRoutes([], null, "p1")).toEqual([]);
    expect(findBestTradeRoutes([{}], null, "p1")).toEqual([]);
  });
});
