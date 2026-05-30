# SPEC-054 — Faction Conflict Battlegrounds (Emergent Sector Wars)

## Description
To enhance the living galaxy simulation, this spec introduces **dynamic sector conflict zones** where rival factions (e.g., the Federation Navy and Pirate/Outlaw Syndicates) clash in active space battles. 

1. Sectors can enter a "Conflict Zone" state driven by periodic economy/story events or reputation imbalances.
2. In a Conflict Zone, dynamic fleets of faction-aligned combatants (destroyers, interceptors) are spawned in battle formation.
3. NPCs engage each other using active weapons.
4. Players entering the sector are queried for faction standings; they can pick a side (e.g., target one faction to aid the other), dynamically shifting the battle tide.
5. Neutralizing enemy combatants in conflict zones yields high reputation boosts and specialized combat merits.

## Definition of Done (DoD)
- [ ] Implement `isConflictZone` flag and sector-war initialization in `src/engine/GameInstance.js`.
- [ ] Spawn opposing faction ships with pre-configured faction alignments and hostile AI targets in active room instances.
- [ ] Adjust standing adjustments so combat kills within conflict zones apply specialized standing boosts (+2.0 to friendly faction, -2.5 to enemy faction).
- [ ] Write unit/integration tests verifying that conflict NPCs correctly target only opposing faction units and hostile players, and that kills correctly adjust reputation.
- [ ] Ensure `npm run agent:check` remains 100% green.

## Implementation Approach
- In `src/engine/GameInstance.js`, add `triggerConflictZone(room, factionA, factionB)` which seeds opposing AI combatants (e.g., `role="guard"` with `faction="Federation"`, and `role="pirate"` with `faction="Outlaws"`).
- In `src/engine/ai/AIController.js` and `buildPerception.js`, ensure the NPC's perceived threats include all ships belonging to the opposing faction, overriding standard neutral/standby behavior.
- Ensure standard collision and projectile logic supports concurrent NPC-vs-NPC damage tracking.

## Test Strategy
- Write integration tests in `src/engine/faction.integration.test.js` or a new test suite verifying:
  - NPC ships of opposing factions successfully target and damage each other in conflict zones.
  - Player kills of a conflict combatant adjust standings on both sides correctly.
  - Conflict zones teardown/cleanup works correctly without leaving orphaned entities or memory leaks.
