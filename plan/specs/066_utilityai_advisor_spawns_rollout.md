# SPEC-066 — UtilityAI Advisor Spawns Rollout & Hardening

## Description
This specification rolls out the Goal-Driven `UtilityAI` advisor to the remaining NPC spawning paths (raiders, storyline bosses, escorts, and offline mock players) and hardens perception building to be completely null-safe and robust across all entity types in the simulation loop.

1. **Wider Advisor Rollout:**
   - Enable `useUtilityAdvisor: true` on raiders, final storyline bosses, escort wings, and offline mock players spawned inside `GameInstance.js` so that they utilize utility-based goal selection (FLEE, ENGAGE, TRADE, REGROUP, PATROL) in the physics loop.
   - Enforce that all AIControllers have access to `factionPolicy` and `standingPolicy` hooks for pairwise relation checks.

2. **Perception Hardening:**
   - Review and harden `isThreat` and threat level evaluation in `src/engine/ai/buildPerception.js` so they cleanly handle non-ship entities (such as cosmic storms, cargo pods, and warp gates) without throwing type/attribute exceptions.

## Definition of Done (DoD)
- [ ] Enable `useUtilityAdvisor: true` inside all remaining NPC spawn constructors in `src/engine/GameInstance.js` (including raiders, boss fleets, escorts, and mock player ships).
- [ ] Ensure all spawned NPCs have access to `factionPolicy` and `standingPolicy` in their `AIController` configs.
- [ ] Harden `defaultIsThreat` in `src/engine/ai/buildPerception.js` to immediately return `false` if the entity is not a ship or is undefined/null.
- [ ] Verify 100% green Jest coverage on the UtilityAI, perception, and AIController advisor suites.

## Implementation Approach
- Modify the AIController instantiation points in `src/engine/GameInstance.js`:
  - `spawnNPCPirate` (boss and raider variants)
  - `spawnAmbushRaider` (escort ambush)
  - `spawnDiplomaticTransport` / escort wings
  - Offline/mock player bot spawns
- Ensure `defaultIsThreat` in `src/engine/ai/buildPerception.js` has a clean `if (ent.type !== "ship") return false;` guard.

## Test Strategy
- Unit tests in `src/engine/ai/AIController.advisor.test.js` validating:
  - Wounded boss or escort successfully activates `FLEE` or `REGROUP` goal decisions.
  - Threat detection handles random null/empty/non-ship entities gracefully.
