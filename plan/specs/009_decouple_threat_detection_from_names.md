# 009 — Decouple threat detection from ship names; wire seeded names

- **Phase:** 1 · **Priority:** P1 · **Blocked by:** none

## Description & Expected Impact
Hostility/threat classification keys on literal **name substrings** (`name.includes("Pirate")` /
`"Raider"` in `AIController` and `GameInstance.handleEntityDestroyed`'s pirate-loot branch). This is
fragile (a nameless ship once crashed the server; renaming spawns would silently break loot/threat) and
blocks wiring the EW8 `NameGenerator` into NPC spawns. **Impact:** robust role/faction-based
classification + unlocks procedurally-named NPCs (immersion) without breaking combat logic.

## Definition of Done & Acceptance Criteria
- [ ] A single source of truth classifies a ship as pirate/hostile by `role` (and/or `faction`), not by
      name — exposed as a pure predicate (extend/centralize `AIController.isPirateShip`).
- [ ] All name-substring threat/loot checks route through it; nameless ships are safe.
- [ ] `GameInstance` NPC spawns assign procedurally-generated names via `NameGenerator` while keeping a
      correct `role`/`faction`; pirate loot + bounty matching still work.
- [ ] Existing AIController/GameInstance tests stay green; new tests cover role-based classification and a
      named-but-roled pirate still being treated as hostile.
- [ ] `npm run agent:check` green; `node src/server.js` boots.

## Implementation Approach
- Centralize classification in `src/engine/ai/AIController.js` (static `isPirateShip(ent)` already exists)
  to prefer `ent.role === "pirate"` / faction, falling back to the name heuristic only when role/faction
  are absent (backward compatible).
- Update `GameInstance.handleEntityDestroyed` pirate-loot branch and any `AIController` scan to use it.
- In NPC spawn factories (`server.js` / `GameInstance`), set `name = pilotName/shipName(createSeededRng(seed))`
  AND `role`/`faction`; seed deterministically (e.g. from room id + spawn index) so tests are stable.
- Bounty matching (`MissionManager.checkBountyCompletion`) keys on `targetName`; ensure spawned bounty
  targets still carry their assigned `targetName`.

## Test Strategy
- **Unit:** `isPirateShip` returns true for `{role:"pirate"}` regardless of name, false for a roled
  merchant, and falls back to the name heuristic when role is absent; nameless ship is safe (no throw).
- **Unit:** a seeded spawn helper produces a deterministic name + correct role.
- **Regression:** AIController + GameInstance suites; boot smoke.
