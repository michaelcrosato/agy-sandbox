# SPEC-048 — Contraband Space Patrol Scans & Hails

## Description
To enhance the smuggling career path and bridge P2 (smuggling), P3 (reputation), and P5 (intelligent NPC patrols) together, this specification implements dynamic **real-time space patrol security scans**. 

If a player is carrying `contraband` in space (outside of landing UI) in a sector governed by a major faction ("Federation", "Frontier League", "Pirates") and flies close to a faction guard patrol ship, the patrol ship will hail the player and initiate a remote scan. 

The player's jammer outfits (from SPEC-045) will dynamically influence the remote scan bypass rate. If bypassed, the patrol leaves the player in peace. If the scan succeeds in detecting the contraband, the player's standings with that faction will drop by 15 points, and the patrol ship (and potentially nearby guards) will turn hostile, locking targets and attacking immediately! A scan cooldown of 30 seconds per player is enforced to prevent scanning spam.

## Definition of Done (DoD)
- [ ] Implement a periodic check in `GameInstance.update(dt)` (running e.g. every 5 seconds / 150 ticks) to evaluate players carrying `contraband > 0` in space.
- [ ] Identify if a major faction guard patrol (e.g. `ent.role === "guard" && ent.faction !== "Independents"`) is within a scanning distance of 600 units.
- [ ] Ensure a scanning sweep respects a 30-second cooldown per player (`ship.lastSpaceScanTime`) to avoid scanning spam.
- [ ] If a scan is triggered:
  - Broadcast a sector-wide or player-targeted notification hailing: `"[Patrol] security sweep in progress! Stand by for scan."`
  - Determine bypass probability using the player ship's highest jammer efficiency rating (Shielded Cargo Holds = 60%, Decoy Jammer = 90%).
  - Respect a deterministic `rng` closure (e.g. `ship.rng` or injected PRNG) so assertions stay 100% reproducible.
- [ ] On a successful bypass, broadcast: `"[Patrol] 'Scan clear. Carry on, pilot.'"`
- [ ] On a failed scan (contraband detected):
  - Broadcast a hostile warning: `"[Patrol] 'Contraband detected! Faction standing reduced. Drop your cargo or prepare to be fired upon!'"`
  - Deduct 15 reputation points with that governing faction in `FactionRegistry`.
  - Force the guard ship's `AIController` to immediately lock target onto the player and initiate combat.
- [ ] Add comprehensive unit and integration tests inside `src/engine/faction.integration.test.js` validating both successful bypass and failed scan targeting flows.
- [ ] Ensure `npm run agent:check` passes 100% green.

## Implementation Approach
- In `src/engine/GameInstance.js` `update(dt)`, iterate through all active player ships.
- If `ship.cargo.contraband > 0` and `(!ship.lastSpaceScanTime || currentTime - ship.lastSpaceScanTime > 30)`:
  - Find a close guard ship `g` (`g.role === "guard" && g.faction === governingFaction`) within 600u.
  - If found, trigger the scan:
    - Set `ship.lastSpaceScanTime = currentTime`.
    - Retrieve `bestJammerValue` (0.6, 0.9, or 0) from `ship.outfits`.
    - Roll the check: `const rng = ship.rng || Math.random; if (rng() < bestJammerValue) { ... bypass ... } else { ... fail ... }`.
    - On fail, adjust standing via `this.factionRegistry.adjustStanding(ship.id, g.faction, -15)` and set the guard's AI controller `target = ship` and transition its state to pursue the player.
- Ensure the cooldown and range options are configurable or overridable for robust unit testing.

## Test Strategy
- Write integration tests inside `src/engine/faction.integration.test.js` to assert that:
  - Players with jammers can successfully bypass the remote scan under controlled seeds.
  - Players without jammers or failing the roll lose standing, trigger hostile alerts, and force active combat pursuits.
- Gate check:
  `npm run agent:check`
