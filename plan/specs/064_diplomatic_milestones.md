# SPEC-064 — Faction Reputation Milestones & Bounty Hunters

## Description
This spec connects player faction standings to deep, high-stakes gameplay milestones: custom high-tier elite missions for allies, and persistent cross-sector hunter warships for hostiles.

1. **High-Tier Diplomatic Quests:**
   - In `MissionManager.js`, add a procedurally generated elite faction campaign mission unlock when standing with a faction is `> 60` (Allied tier).
   - Allied Mission: `"escort_ambassador"` requires the player to defend a fragile high-value passenger ship with specialized cargo from hostile ambush spawns during transit.
2. **Persistent Faction Hunters:**
   - If player standing with any major faction (e.g., Federation, Frontier League, Pirates) falls below `-60` (Nadir tier), trigger periodic hunter spawns.
   - An elite bounty hunter ship (e.g. `"Federation Hunter Elite"`) with premium armor/shield systems, fast engines, and interdictor matrix will spawn in open space to track and eliminate the hostile player.
   - The elite hunter will have its FSM target locked to the hostile player ship and follow them aggressively.
3. **Standing Milestones Persistence & Messaging:**
   - Broadcast warnings to players when elite hunters are spawned: `"HIGH THREAT WARNING: Federation Hunter Elite has entered the sector to terminate you!"`
   - Yield premium credit bounty vouchers upon hunter neutralization.

## Definition of Done (DoD)
- [ ] Extend `MissionManager.js` to offer standing-gated elite ambassadorial escort contracts at Spaceports.
- [ ] Implement elite hostile hunter spawning in `GameInstance.js` when player standing falls below `-60`.
- [ ] Configure the elite hunter AI to lock onto and aggressively pursue the hostile player.
- [ ] Add server-side broadcast warnings and high-reward bounty vouchers on hunter defeat.
- [ ] Write unit and integration tests verifying standing-locked contract generation, hunter spawning conditions, target locking, and rewards.

## Implementation Approach
- Keep elite hunter spawning bounded by a timer cooldown (e.g., once every 120 seconds max per hostile player) to prevent sector entity overloading.
- Re-use the existing `adjustStanding` and `adjustStanding` propagation triggers.

## Test Strategy
- Integration tests in `src/engine/faction.integration.test.js` verifying that a player at allied standing receives escort ambassador contracts, and a player at hostile standing below `-60` triggers an elite faction hunter spawn targeting them.
