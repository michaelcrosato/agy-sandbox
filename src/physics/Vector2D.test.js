import { Vector2D } from "./Vector2D.js";

describe("Vector2D mathematical operations", () => {
  test("Constructor initializes coordinates correctly", () => {
    const v = new Vector2D(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);

    const defaultV = new Vector2D();
    expect(defaultV.x).toBe(0);
    expect(defaultV.y).toBe(0);
  });

  test("clone returns a separate copy of the vector", () => {
    const v1 = new Vector2D(5, -2);
    const v2 = v1.clone();
    expect(v2.x).toBe(5);
    expect(v2.y).toBe(-2);
    expect(v2).not.toBe(v1); // separate instance
  });

  test("add correctly calculates vector sum", () => {
    const v1 = new Vector2D(2, 3);
    const v2 = new Vector2D(-1, 5);
    const res = v1.add(v2);
    expect(res.x).toBe(1);
    expect(res.y).toBe(8);
  });

  test("subtract correctly calculates vector difference", () => {
    const v1 = new Vector2D(10, 2);
    const v2 = new Vector2D(4, -3);
    const res = v1.subtract(v2);
    expect(res.x).toBe(6);
    expect(res.y).toBe(5);
  });

  test("multiply correctly scales vector coordinates", () => {
    const v = new Vector2D(2, -4);
    const res = v.multiply(3);
    expect(res.x).toBe(6);
    expect(res.y).toBe(-12);
  });

  test("dot product returns correct scalar value", () => {
    const v1 = new Vector2D(1, 3);
    const v2 = new Vector2D(4, -2);
    expect(v1.dot(v2)).toBe(-2); // 1*4 + 3*-2 = 4 - 6 = -2
  });

  test("magnitude returns correct vector length", () => {
    const v = new Vector2D(3, 4);
    expect(v.magnitude()).toBe(5);
  });

  test("normalize returns unit vector correctly", () => {
    const v = new Vector2D(0, 10);
    const unit = v.normalize();
    expect(unit.x).toBe(0);
    expect(unit.y).toBe(1);

    const zero = new Vector2D(0, 0);
    const normalizedZero = zero.normalize();
    expect(normalizedZero.x).toBe(0);
    expect(normalizedZero.y).toBe(0);
  });

  test("distance returns exact space distance between two vectors", () => {
    const v1 = new Vector2D(0, 0);
    const v2 = new Vector2D(3, 4);
    expect(v1.distance(v2)).toBe(5);
  });
});
