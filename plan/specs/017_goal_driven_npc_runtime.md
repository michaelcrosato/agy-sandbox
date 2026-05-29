# 017 — Goal-driven NPC runtime (UtilityAI → AIController, P5)

- **Phase:** 2 · **Priority:** P2 (GOAL P5) · **Blocked by:** none (synergizes with 016)

## Description & Expected Impact
`UtilityAI` (pure goal scorer: ENGAGE/FLEE/TRADE/REGROUP/PATROL from a perception snapshot) is built and
tested but **not consulted** — NPCs are still role-FSMs. **Impact:** delivers the GOAL P5 DoD ("an agent
demonstrably changes its plan when the world changes") — merchants reroute around danger, pirates chase
wealth — the "they think" showcase.

## Definition of Done & Acceptance Criteria
- [ ] A `buildPerception(ship, entities, options)` helper produces the `UtilityAI` snapshot from live
      engine state (pure, tested).
- [ ] `AIController` consults `selectGoal(perception)` as an **advisory** layer (behind a flag/option,
      default-on for new spawns) to switch between its existing behaviours, without regressing the 36+
      existing AIController tests.
- [ ] A deterministic test shows an agent changing its selected goal when the world changes (a new threat
      → FLEE/reroute; a rich, safe opportunity → TRADE/ENGAGE).
- [ ] Decision logic stays pure; `npm run agent:check` green; `node src/server.js` boots and NPCs behave
      sanely.

## Implementation Approach
- New pure `src/engine/ai/buildPerception.js` (or method) mapping nearby entities → `{ self, threats,
  opportunities }` using existing distance/threat helpers.
- In `AIController`, when enabled, call `selectGoal(buildPerception(...))` each scan and map goals to the
  existing FSM actions (ENGAGE→attack, FLEE→evade, TRADE→route, REGROUP→retreat, PATROL→default). Keep the
  legacy path when the flag is off so existing tests/call sites are unaffected.
- Seed/inject any randomness; no `Math.random` in the decision path.

## Test Strategy
- **Unit:** `buildPerception` shape from a hand-built world; `AIController` (advisory on) selects FLEE
  when a strong threat appears and TRADE/ENGAGE when safe+opportunity — same agent, different world,
  different plan. Legacy-path tests remain green with the flag off.
- **Manual:** boot; observe a merchant breaking off near a pirate.
