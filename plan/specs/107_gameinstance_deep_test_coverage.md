# SPEC-107: GameInstance Deep Test Coverage Expansion

## Summary
`src/engine/GameInstance.js` is the authoritative game simulator at **1,784 LOC** with only **11 tests** — the single largest test coverage gap in the entire codebase. This spec adds comprehensive deterministic tests covering entity lifecycle, combat resolution, faction wiring, sector transitions, economic triggers, and NPC spawning/destruction flows.

## Motivation
- `GameInstance.js` is the central state container and game loop driver
- At 0.006 tests/LOC ratio, most branches (spawning, planet generation, faction registration, economic triggers, combat event handlers) are exercised only indirectly through integration tests
- Direct unit tests will catch regressions in the core simulation that integration tests miss

## Scope
**In:**
- Test `GameInstance` constructor and initialization with different planet/faction configurations
- Test entity lifecycle: `addEntity`, `removeEntity`, entity destruction callbacks, respawn logic
- Test `broadcastNotification`, `broadcastRosterUpdate`, `broadcast` with mock clients
- Test combat resolution event flows (ship destruction → bounty voucher generation, faction standing updates)
- Test NPC spawning hooks: pirate spawners, guard patrols, trader caravans, smuggler AI init
- Test economic integration: shortage/surplus triggers, production chain ticks, market sync broadcasts
- Test sector-specific configuration: warp gate creation, planet landing radius checks, security ratings
- Test territory control integration: influence scores, dynamic sector ownership updates
- Test `leaveCurrentFleet` and fleet lifecycle
- Test cosmic storm integration and entity damage application

**Out:**
- Changing GameInstance behavior
- Client-side rendering tests
- Integration tests requiring a live server

## Files
- `src/engine/GameInstance.js` (read only — no changes)
- `src/engine/GameInstance.test.js` (create or expand — new test file with 30+ tests)

## Acceptance Criteria
- [ ] Test file has ≥ 30 new deterministic test cases covering the above categories
- [ ] All tests are pure and headless (no DOM, no sockets, no timers)
- [ ] `npm run agent:check` green
