# SPEC-065 — Procedural Mission Completions, Trade Standing Merits, & Reputation Decay

## Description
This specification connects the procedural generated mission completion and faction consequence pipelines to the live authoritative server, wires standing merits on successful commodity trades, and hooks the background reputation decay heartbeat to slowly heal standings toward neutral over time.

1. **Procedural Mission Completions:**
   - Map generated `delivery` missions in `checkArrivalCompletions` to complete on landing, deducting cargo and awarding credits.
   - Map generated `hunt` missions in `checkBountyCompletion` to complete when the named target ship is destroyed in orbit, awarding credits.
   - Enforce that both methods invoke `applyMissionConsequences(mission, room)` on the server to dynamically mutate the local planet's commodity stock/prices and adjust the player's FactionRegistry standings.

2. **Trade Faction Standings:**
   - In `server.js` (or the underlying trade handler), reward successful player commodity purchases and sales at a port with a mild reputation standing merit boost (`+0.5` standing merits per commodity trade) with the port's controlling faction.

3. **Reputation Decay Heartbeat:**
   - Hook `decayAll` inside the periodic `server.js` galaxy heartbeat loop so that active player standings with all factions slowly heal/decay toward neutral (0) over time (e.g. by `0.02` per 8-second tick).

## Definition of Done (DoD)
- [ ] Extend `checkArrivalCompletions` in `MissionManager.js` to match and complete dynamic `delivery` missions on landing, executing `applyMissionConsequences`.
- [ ] Extend `checkBountyCompletion` in `MissionManager.js` to match and complete dynamic `hunt` missions on target destruction, executing `applyMissionConsequences`.
- [ ] Wire successful player commodity transactions in `server.js` (trade handler) to increment the player's faction standing merits by `+0.5` per trade transaction.
- [ ] Wire a periodic standing decay call in `server.js` galaxy ticker heartbeat (or room tick) that calls `room.decayReputations()` to heal standings slowly.
- [ ] Write integration tests verifying that dynamic delivery and hunt missions successfully trigger FactionRegistry standing modifications on completion.
- [ ] Write integration tests verifying that standings heal towards neutral over consecutive heartbeat decay intervals.

## Implementation Approach
- Update `checkArrivalCompletions` and `checkBountyCompletion` inside `src/engine/MissionManager.js` to match the generated `"delivery"` and `"hunt"` mission types.
- Ensure `applyMissionConsequences` is invoked with the live `room` context in all completion paths.
- Update the transaction handler in `src/server.js` (or `src/engine/Trading.js`) to apply reputation boosts.
- Call `room.decayReputations()` in the periodic server ticker loop.

## Test Strategy
- Integration tests inside `src/engine/faction.integration.test.js` validating:
  - Landing on a target planet with a generated delivery mission completes the mission, modifies price markets, and grants faction standing.
  - Destroying a generated hunt target completes the mission and decreases standing with the target's faction (consequence delta).
  - Standing decays towards 0 over heartbeat pulses.
