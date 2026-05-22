/**
 * Core utility functions for the agy-sandbox workspace.
 */

/**
 * Adds two numbers together.
 * @param {number} a
 * @param {number} b
 * @returns {number} The sum of a and b.
 */
export function add(a, b) {
  return a + b;
}

/**
 * Subtracts b from a.
 * @param {number} a
 * @param {number} b
 * @returns {number} The difference.
 */
export function subtract(a, b) {
  return a - b;
}

/**
 * Greets the user or agent.
 * @param {string} name
 * @returns {string} The greeting message.
 */
export function greet(name = "Agent") {
  return `Hello, ${name}! Welcome to the autonomous agy-sandbox.`;
}
