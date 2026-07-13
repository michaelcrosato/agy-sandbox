/**
 * NameGenerator (EW8) — pure, deterministic pilot and ship name generation.
 *
 * Names make NPCs, bounty targets (EW1), and encounters legible. Generation is
 * driven by an injected RNG (`() => [0,1)`), so output is fully reproducible for
 * tests — no `Math.random`. Reuses `createSeededRng` (mulberry32) so callers can
 * seed by any integer.
 */

import { createSeededRng } from "./GenerativeMissions.js";

export { createSeededRng };

const PILOT_FIRST = Object.freeze([
  "Kael",
  "Mara",
  "Soren",
  "Vex",
  "Dax",
  "Iyla",
  "Ronan",
  "Sable",
  "Cor",
  "Nyx",
  "Thane",
  "Bria",
  "Jaxon",
  "Lira",
  "Orin",
  "Zara",
]);

const PILOT_LAST = Object.freeze([
  "Vance",
  "Korr",
  "Maddox",
  "Quill",
  "Reyes",
  "Stark",
  "Vossan",
  "Drael",
  "Mercer",
  "Halloran",
  "Cinder",
  "Voss",
  "Renn",
  "Tahl",
  "Okafor",
  "Bane",
]);

const SHIP_ADJ = Object.freeze([
  "Iron",
  "Silent",
  "Crimson",
  "Wandering",
  "Eternal",
  "Broken",
  "Gilded",
  "Restless",
  "Vesper",
  "Obsidian",
  "Radiant",
  "Hollow",
]);

const SHIP_NOUN = Object.freeze([
  "Vow",
  "Nomad",
  "Comet",
  "Sparrow",
  "Lance",
  "Mirage",
  "Verdict",
  "Drift",
  "Ember",
  "Harbinger",
  "Reverie",
  "Talon",
]);

/**
 * Picks an element from `arr` using one draw from `rng`, with a clamped index so
 * a degenerate rng can never index out of bounds.
 * @param {() => number} rng - Returns a number in [0, 1).
 * @param {ReadonlyArray<*>} arr - Non-empty source array.
 * @returns {*}
 */
function pick(rng, arr) {
  const i = Math.floor(rng() * arr.length);
  return arr[Math.max(0, Math.min(arr.length - 1, i))];
}

/**
 * Generates a pilot name ("First Last"). Consumes two draws from `rng`.
 * @param {() => number} rng - Injected RNG (e.g. from {@link createSeededRng}).
 * @returns {string}
 */
export function pilotName(rng) {
  return `${pick(rng, PILOT_FIRST)} ${pick(rng, PILOT_LAST)}`;
}

/**
 * Generates a ship name ("Adjective Noun"). Consumes two draws from `rng`.
 * @param {() => number} rng - Injected RNG (e.g. from {@link createSeededRng}).
 * @returns {string}
 */
export function shipName(rng) {
  return `${pick(rng, SHIP_ADJ)} ${pick(rng, SHIP_NOUN)}`;
}
