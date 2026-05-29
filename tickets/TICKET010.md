# TICKET010 — EW8: Seeded NPC/ship name generator

- **Status:** DONE (2026-05-28)
- **Priority:** P3

## Goal
A pure, deterministic generator of pilot and ship names so NPCs, bounties (EW1), and encounters read
as named characters rather than "Pirate Raider".

## Context
NPCs use fixed names. A seeded generator (mirroring `createSeededRng` in `GenerativeMissions.js`) keeps
output deterministic for tests while giving runtime variety.

## Scope
- **In:** pure `engine/NameGenerator.js` (`pilotName(rng)`, `shipName(rng)`, re-exported `createSeededRng`).
- **Out:** Wiring into NPC spawns — deferred, because the current pirate detection keys on the literal
  name substring "Pirate"/"Raider"; that must move to role/faction first (separate ticket).

## Likely files
- `src/engine/NameGenerator.js` (+ `.test.js`) — new

## Steps
1. Define syllable/word tables; `pick(rng, arr)` with a clamped index.
2. `pilotName(rng)` = first + last; `shipName(rng)` = adjective + noun. Inject the rng (no Math.random).
3. Re-export `createSeededRng` for convenience.

## Acceptance criteria
- [x] Same seed ⇒ identical name; different seeds ⇒ divergent names across a sample.
- [x] Names are non-empty two-part strings.
- [x] A single rng drives a varied sequence (no constant output).
- [x] No `Math.random`; `npm run agent:check` green (30 suites / 539 tests).

## Notes (resolution)
Also fixed a latent flaky assertion in `Gameplay.test.js` that whitelisted mission types
`[courier, smuggle, bounty, storyline]` — it now accepts `passenger` (from EW4) and asserts `bunks`
for that type. Confirmed stable across 5 repeated runs.

## Commands
```bash
npm test -- src/engine/NameGenerator.test.js
npm run agent:check
```

## Risks
- None; pure additive module. Wiring (and decoupling pirate detection from names) is a separate ticket.

## Notes
Reuses `createSeededRng` from `GenerativeMissions.js` to avoid a second RNG implementation.
