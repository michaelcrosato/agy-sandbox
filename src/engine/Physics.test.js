import { Vector2D } from "../physics/Vector2D.js";
import { SpaceEntity } from "./SpaceEntity.js";
import { Ship } from "./Ship.js";
import { SpaceEngine } from "./SpaceEngine.js";

describe("Top-Down 2D Physics Engine Integration", () => {
  test("SpaceEntity basic linear and angular kinematic updates", () => {
    const entity = new SpaceEntity({
      position: new Vector2D(10, 20),
      velocity: new Vector2D(5, -2),
      mass: 100,
      heading: 0,
      angularVelocity: Math.PI / 4, // 45 deg/sec
    });

    // Tick forward by 2 seconds
    entity.update(2);

    // Expect r_new = r_old + v * dt => (10 + 5*2, 20 + -2*2) = (20, 16)
    expect(entity.position.x).toBe(20);
    expect(entity.position.y).toBe(16);

    // Expect heading = heading_old + omega * dt => 0 + PI/4 * 2 = PI/2 (90 deg)
    expect(entity.heading).toBeCloseTo(Math.PI / 2);
  });

  test("SpaceEntity force accumulation and integration", () => {
    const entity = new SpaceEntity({
      position: new Vector2D(0, 0),
      velocity: new Vector2D(0, 0),
      mass: 50, // 50 kg
    });

    // Apply linear force of 100N in X direction for 1 second
    // F = m * a => a = 100 / 50 = 2 m/s^2
    entity.applyForce(new Vector2D(100, 0));
    entity.update(1); // after 1 sec: v = 0 + 2*1 = 2 m/s, position = 0 + 2*1 = 2m
    expect(entity.velocity.x).toBe(2);
    expect(entity.position.x).toBe(2);

    // Force accumulator should be reset
    // Apply another force of 200N in Y direction for 0.5 seconds
    // a_y = 200 / 50 = 4 m/s^2
    entity.applyForce(new Vector2D(0, 200));
    entity.update(0.5); // after 0.5s: v_x = 2 (unchanged), v_y = 0 + 4*0.5 = 2 m/s
    // position_x = 2 + 2*0.5 = 3m
    // position_y = 0 + 2*0.5 = 1m
    expect(entity.velocity.x).toBe(2);
    expect(entity.velocity.y).toBe(2);
    expect(entity.position.x).toBe(3);
    expect(entity.position.y).toBe(1);
  });

  test("Ship controls and propulsion system", () => {
    const ship = new Ship({
      position: new Vector2D(0, 0),
      velocity: new Vector2D(0, 0),
      thrustPower: 1000,
      brakePower: 500,
      turnRate: 1, // 1 rad/s
      mass: 100, // 100 kg => a_thrust = 1000 / 100 = 10 m/s^2
    });

    // 1. Test rotation control
    ship.setControls({ isTurningRight: true });
    ship.update(1); // rotate 1 second => heading becomes 1 radian
    expect(ship.heading).toBeCloseTo(1);
    expect(ship.velocity.magnitude()).toBe(0); // didn't thrust

    // 2. Test forward thruster acceleration
    ship.clearControls();
    ship.setControls({ isThrusting: true });

    // Direction vector at heading = 1.0 rad: (cos(1), sin(1))
    // Acceleration: 10 m/s^2 along (cos(1), sin(1))
    ship.update(1); // thrust for 1 sec

    expect(ship.velocity.x).toBeCloseTo(10 * Math.cos(1));
    expect(ship.velocity.y).toBeCloseTo(10 * Math.sin(1));

    // 3. Test retro-braking system
    ship.clearControls();
    ship.setControls({ isBraking: true });

    // Velocity is pointing in direction (cos(1), sin(1)) with magnitude 10.
    // Brake power is 500N => deceleration a = 500 / 100 = 5 m/s^2
    ship.update(1); // brake for 1 sec => speed should drop to 10 - 5 = 5 m/s

    expect(ship.velocity.magnitude()).toBeCloseTo(5);
    expect(ship.velocity.normalize().x).toBeCloseTo(Math.cos(1));
    expect(ship.velocity.normalize().y).toBeCloseTo(Math.sin(1));
  });

  test("SpaceEngine handles elastic collisions and de-penetration", () => {
    const engine = new SpaceEngine({ restitution: 1.0 }); // Perfectly elastic

    // e1: moving right
    const e1 = new SpaceEntity({
      id: "shipA",
      position: new Vector2D(0, 0),
      velocity: new Vector2D(10, 0),
      mass: 100,
      radius: 10,
    });

    // e2: stationary, in the path of e1
    const e2 = new SpaceEntity({
      id: "shipB",
      position: new Vector2D(18, 0), // overlap is (radiusA + radiusB) - distance = 20 - 18 = 2 units
      velocity: new Vector2D(0, 0),
      mass: 100,
      radius: 10,
    });

    engine.addEntity(e1);
    engine.addEntity(e2);

    // Initial total momentum along X: m1*v1 + m2*v2 = 100*10 + 100*0 = 1000 kg*m/s
    const totalMomentumXBefore =
      e1.mass * e1.velocity.x + e2.mass * e2.velocity.x;
    expect(totalMomentumXBefore).toBe(1000);

    // Trigger physics engine update (with tiny dt so kinematic movement is negligible, or manually call collision resolution)
    engine.handleCollisions();

    // 1. Verify Positional Correction (De-penetration)
    // They had 2 units of overlap. Because masses are equal (100 each), they should push apart equally (1 unit each).
    // e1 position x should become 0 - 1 = -1
    // e2 position x should become 18 + 1 = 19
    expect(e1.position.x).toBe(-1);
    expect(e2.position.x).toBe(19);
    expect(e1.position.distance(e2.position)).toBe(20); // exactly Combined Radii (10 + 10)

    // 2. Verify Elastic Collision Velocity Transfer (for equal masses and e=1.0, they swap velocities!)
    // e1 velocity x should become 0
    // e2 velocity x should become 10
    expect(e1.velocity.x).toBe(0);
    expect(e2.velocity.x).toBe(10);

    // Verify conservation of momentum: total momentum should still be 1000 kg*m/s
    const totalMomentumXAfter =
      e1.mass * e1.velocity.x + e2.mass * e2.velocity.x;
    expect(totalMomentumXAfter).toBe(1000);
  });
});
