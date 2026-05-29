# 016 — Faction runtime wiring (P3)

- **Phase:** 2 · **Priority:** P2 (GOAL P3) · **Blocked by:** none (synergizes with 009)

## Description & Expected Impact
`FactionRegistry` is a complete, tested model (standings, pairwise relations, `priceModifier`,
`dockingPermitted`, `factionPolicy`) but is **not wired into the live game** — NPC spawns, prices, and
hostility don't yet consult it. **Impact:** delivers the GOAL P3 DoD ("a sequence of player actions
moves a standing value that demonstrably changes NPC behaviour and prices") — the "it remembers" showcase.

## Definition of Done & Acceptance Criteria
- [ ] Each `GameInstance` owns a `FactionRegistry`; it is persisted/restored (the serializers already
      capture `factionRegistry.serialize()` when present — verify the round-trip end-to-end).
- [ ] Spawned NPCs carry a `faction`; guards/pirates receive a `factionPolicy()` and target by disposition
      (builds on `009`).
- [ ] `EconomyManager.getPrice` (or the trade handler) applies the player's `priceModifier` for the
      planet's faction; a friendly dock shows discounted buys / better sells.
- [ ] Player actions (kills, missions, trades) adjust standings via `adjustStanding`, propagating to
      allies/enemies; docking can be refused when hostile.
- [ ] A scripted test moves a standing and asserts a resulting price + targeting change; `npm run
      agent:check` green; `node src/server.js` boots.

## Implementation Approach
- Construct/attach a `FactionRegistry` in `GameInstance`; thread `factionPolicy()` into `AIController`
  spawns (server/GameInstance) and `planetFactions` into price calc.
- Hook `MissionManager.completeGeneratedMission` consequences (already compute `factionChanges`) and kill
  events into `adjustStanding`.
- Keep all standing math in `FactionRegistry` (pure); the server only invokes it.

## Test Strategy
- **Unit/integration:** a deterministic sequence — wrong a faction → its `priceModifier` worsens and a
  guard now targets the player's faction; help a faction → ally standing rises. Assert on the pure
  registry + a `GameInstance`-level wiring test (no Math.random in assertions).
- **Manual:** boot; verify discounted/raised prices at a friendly vs. hostile dock.
