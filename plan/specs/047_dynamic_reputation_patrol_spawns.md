# SPEC-047 — Dynamic Reputation & Patrol Spawns

## Description
Currently, sectors spawn a static roster of NPC ships and pirates, regardless of who is in the sector or what their standings are. This limits the feeling of a dynamic, reactive galaxy. One of our core Showcase Moments is "It remembers" — wrong a faction, return, and find that its patrols are now hostile in its territory.

This specification builds a dynamic **Reputation Patrol Spawn** system inside `src/engine/GameInstance.js`. If a player's standing with a sector's governing faction drops below the hostile threshold (`standing <= hostileThreshold`, default -30):
1. The sector has a periodic chance (or triggers a state check) to spawn active, aggressive Faction Patrol ships (e.g. "Federation Interceptor") close to the hostile player.
2. The spawned interceptors are pre-configured with the `guard` role and set to the sector's main faction, and their AI controllers automatically identify the player as hostile and hunt them.
3. If the player is friendly or neutral, no such security interceptors will spawn.

## Definition of Done (DoD)
- [ ] Implement a periodic check in `GameInstance.update` (or another appropriate tick update loop) to evaluate players' faction standings.
- [ ] If a player is hostile to the room's main faction, trigger the spawning of aggressive faction patrol interceptors.
- [ ] Ensure that patrol spawns occur at a reasonable distance (e.g., 800u–1200u away from the player) to prevent sudden, unfair instaspawns on top of the player.
- [ ] Limit the maximum number of active hostile patrols per sector to prevent infinite spawn floods.
- [ ] Add comprehensive unit and integration tests inside `src/engine/faction.integration.test.js` verifying that:
  - Hostile standing actively triggers patrol interceptor spawns.
  - Friendly or neutral standing maintains normal, peaceful spawning.
  - Spawned patrol interceptors are assigned correct roles, stats, and automatically target the player.
- [ ] Ensure `npm run agent:check` is completely green.

## Implementation Approach
- In `src/engine/GameInstance.js`, identify the sector's governing faction (e.g. Sol Prime is governed by "Federation", Valkyrie Depot by "Frontier League").
- In the `update` loop of `GameInstance`, add a periodic counter (e.g. every 10 seconds / 300 ticks) checking if any active player has hostile standing (`<= -30`) with the governing faction.
- If hostile and the room has fewer than 2 active patrols:
  - Spawn a faction interceptor `Ship` named `${governingFaction} Interceptor` with `role = "guard"`, `faction = governingFaction`, positioned 1000u away from the player.
  - Wire its `AIController` with the live faction standing policy so it scans and aggressively targets the player.
- Ensure the spawn chance and tick limits are configurable or mockable in tests for rapid verification.

## Test Strategy
- Create a test inside `src/engine/faction.integration.test.js` setting a mock player's faction standing to -50, calling `update` ticks on `GameInstance`, and asserting that a new guard ship belonging to the hostile faction is spawned and targets the player.
- Verify global verification:
  `npm run agent:check`
