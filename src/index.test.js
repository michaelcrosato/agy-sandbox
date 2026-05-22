import { add, subtract, greet } from "./index.js";

describe("Core Utility Tests", () => {
  test("add function correctly adds numbers", () => {
    expect(add(1, 2)).toBe(3);
    expect(add(-1, 5)).toBe(4);
  });

  test("subtract function correctly subtracts numbers", () => {
    expect(subtract(5, 3)).toBe(2);
    expect(subtract(2, 5)).toBe(-3);
  });

  test("greet function greets correctly with custom and default names", () => {
    expect(greet("AGY")).toBe(
      "Hello, AGY! Welcome to the autonomous agy-sandbox.",
    );
    expect(greet()).toBe(
      "Hello, Agent! Welcome to the autonomous agy-sandbox.",
    );
  });
});
