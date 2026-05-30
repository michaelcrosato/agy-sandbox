# 032 — Mission + trade faction standings

- **Phase:** 1 · **Priority:** P1 (sim depth; BACKLOG from spec 016) · **Blocked by:** none (synergizes with 016)

## Description & Expected Impact
Spec 016 wired standing changes on **kills** only. The GOAL P3 DoD also lists **missions** and **trades**
moving standings. `MissionManager.completeGeneratedMission` already computes a `factionChanges` array, but
**nothing in `server.js` calls it** — the generated-mission consequence pipeline isn't connected to the
live server. **Impact:** completes the reputation loop so peaceful play (contracts, commerce) — not just
combat — shifts standings.

## Definition of Done & Acceptance Criteria
- [ ] The generated-mission completion path is connected server-side and feeds `factionChanges` into
      `room.factionRegistry.adjustStanding(playerId, faction, delta)` (propagating to allies/enemies).
- [ ] Trading at a faction-controlled port nudges the player's standing with that faction by a small
      amount (config), so commerce builds reputation.
- [ ] A deterministic test moves a standing via a completed mission's `factionChanges` **and** via a trade,
      asserting the registry reflects both; `npm run agent:check` green; server boots.

## Implementation Approach
- Wire the server `land`/mission-completion path to call `completeGeneratedMission` (or surface its
  `factionChanges` from the existing arrival-completion path) and apply each change via the registry.
- In the `trade` handler, after a successful `tradeOne`, apply a small `adjustStanding` for `p.faction`.
- Keep the standing math in `FactionRegistry` (pure); the server only invokes it. Log any pipeline gaps
  found to `BACKLOG.md`.

## Test Strategy
- **Integration:** a mission whose consequences include a `factionChanges` entry moves the registry standing
  (+ propagation); a buy/sell at a faction port nudges standing in the expected direction. Deterministic.
- **Regression:** spec-016 `faction.integration.test.js` + mission tests stay green.
