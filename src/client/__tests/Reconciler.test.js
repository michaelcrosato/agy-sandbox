import { describe, test, expect, beforeEach } from "vitest";
import { Reconciler } from "../Reconciler.js";
import { Vector2D } from "../../physics/Vector2D.js";

describe("Client-Side Input Prediction & Server Reconciliation (spec 071)", () => {
  let reconciler;

  beforeEach(() => {
    reconciler = new Reconciler({
      mass: 2000,
      thrustPower: 8000,
      turnRate: 3.0,
      maxSpeed: 400,
    });
  });

  test("predicts state locally based on input commands", () => {
    const startState = {
      position: new Vector2D(0, 0),
      velocity: new Vector2D(0, 0),
      heading: 0,
    };

    // Apply thrust for 1 second
    const predicted = reconciler.predict(startState, { isThrusting: true }, 1.0);

    // F = 8000 N, m = 2000 kg => a = 4 m/s^2
    // v = 4 m/s
    // p = 4 m
    expect(predicted.velocity.x).toBeCloseTo(4.0);
    expect(predicted.position.x).toBeCloseTo(4.0);
    expect(predicted.heading).toBe(0);

    expect(reconciler.pendingInputs.length).toBe(1);
    expect(reconciler.pendingInputs[0].sequence).toBe(1);
  });

  test("reconciles state by replaying pending inputs on top of server authoritative baseline", () => {
    const startState = {
      position: new Vector2D(0, 0),
      velocity: new Vector2D(0, 0),
      heading: 0,
    };

    // Client makes two predictions (sequence 1 and 2)
    const predicted1 = reconciler.predict(startState, { isThrusting: true }, 0.5);
    const predicted2 = reconciler.predict(
      predicted1,
      { isThrusting: true, isTurningRight: true },
      0.5,
    );

    expect(reconciler.pendingInputs.length).toBe(2);

    // Server sends authoritative update acknowledging sequence 1, but with a slight position correction
    const serverState = {
      position: new Vector2D(1.1, 0), // server corrected position slightly (originally predicted 1.0)
      velocity: new Vector2D(2.0, 0),
      heading: 0,
      lastProcessedInputSequence: 1,
    };

    // Reconcile
    const reconciled = reconciler.reconcile(serverState);

    // Input 1 is discarded (sequence <= 1)
    expect(reconciler.pendingInputs.length).toBe(1);
    expect(reconciler.pendingInputs[0].sequence).toBe(2);

    // Input 2 should be replayed on top of the server state
    // For sequence 2: isThrusting = true, isTurningRight = true, dt = 0.5
    // Angular velocity turning right = 3.0 => heading += 3 * 0.5 = 1.5 radians
    expect(reconciled.heading).toBeCloseTo(1.5);
    // Position should be correctly recalculated starting from server x = 1.1
    expect(reconciled.position.x).toBeGreaterThan(1.1);
  });
});
