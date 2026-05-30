# SPEC-085 — Underworld Smuggling Contracts & Standing Propagation

## Description
With Outlaw Spaceports now offering Black Market services (SPEC-081), this specification expands smuggling (P3/P4) by adding high-paying "Underworld Contraband Smuggling" contracts to the procedural boards at Rogue's Hollow. Completing these smuggling contracts increases player standing with the Pirate/Underworld faction but propagates negative standing deltas with law-enforcement factions (like the Federation).

1. **Underworld Smuggling Generation:**
   - In `src/engine/MissionManager.js`, generate specialized black-market smuggling missions when the player docks at Rogue's Hollow.
   - Reward massive credit payouts but attach negative major faction standings delta consequences to the mission pipeline (`consequences.factionDeltas`).

2. **Verification & Tests:**
   - Write integration tests verifying that completing underworld smuggling missions correctly propagates standings gains to Pirates and losses to major law factions.

## Definition of Done (DoD)
- [ ] Implement procedural smuggling boards at Rogue's Hollow inside `MissionManager.js`.
- [ ] Connect negative law faction standings consequences to underworld smuggling completions.
- [ ] Add integration tests checking standing mutations on completing underworld smuggling contracts.
- [ ] Gate check `npm run agent:check` passes completely green.
