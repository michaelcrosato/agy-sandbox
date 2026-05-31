# SPEC-091 — Authoritative Game Invariant Verifier & Self-Healing Loop

- **Status:** Done
- **Wave:** v20 — Phase 1
- **Priority:** Medium
- **Product Pillar:** P1 — Persistent Living Universe (Data Integrity & Self-Healing Core)

## Problem

In persistent simulated worlds, runtime bugs, race conditions, or edge cases can cause entities to slide into invalid states (e.g., ships carrying negative cargo amounts, infinite coordinate velocities, negative player balances, or ships exceeding their outfitting slot caps). We need a central, self-contained `InvariantVerifier` running on the authoritative server heartbeat to audit structural state integrity, self-heal minor anomalies silently, and quarantine or reset severe anomalies to protect database/memory parity.

## Scope

### In

- **Game Invariant Verifier (`src/engine/InvariantVerifier.js`):** Implement a pure, robust utility that checks key system invariants across a `GameInstance`:
  - **Credit Integrity:** Ensure credits are finite and non-negative (heals negative credits to 0).
  - **Cargo Constraints:** Ensure total cargo items are non-negative and do not exceed the ship's cargo bay limit (heals over-capacity cargo by pruning excess).
  - **Physics Boundaries:** Ensure coordinates and speed magnitude are finite numbers (heals infinite/NaN coordinates by resetting coordinates to the sector's center).
  - **Fittings Caps:** Ensure equipped outfits do not exceed their slot classifications (Weapons <= 2, Shields <= 1, Utilities <= 1) (heals slot overflow by un-equipping excess items).
- **Heartbeat hook:** Wire the verifier to execute periodically during the server slow-heartbeat routine inside `galaxyTicker.js`.
- **Alert logging:** Log any healed anomalies using the structured JSON logger.
- **Testing:** Exhaustive unit tests asserting all invariant checks, corrective behaviors, and healing cycles.

### Out

- **Client-side physics rollback:** The client-side reconciler handles packet smoothing; this verifier is strictly server-side authoritative.

## Acceptance Criteria

- [ ] `src/engine/InvariantVerifier.js` implements comprehensive checks for credits, cargo limits, coordinates, and outfitting slots.
- [ ] Correctly self-heals corrupted properties (e.g. clamp negative balance to 0, reset NaN positions, prune overflowing cargo).
- [ ] Integrates into the slow-heartbeat loops safely without interrupting the main simulation tick.
- [ ] Full Jest test coverage for all invariant and correction cases.

## Verification Commands

```bash
npm test -- src/engine/InvariantVerifier.test.js
npm run agent:check
```
