# TICKET005 — Extract testable units from src/server.js

- **Status:** DONE (2026-05-29) — completed via `plan/specs/007`
- **Priority:** P3 (do after higher-leverage product slices)

## Goal
Reduce the untested-orchestration risk by extracting pure, testable helpers out of the ~1900-line
`src/server.js` — without changing runtime behavior.

## Context
`src/server.js` is the single biggest file and has **no unit tests**; it wires sockets, rooms,
persistence, broadcast framing, and game handlers together. It is the highest-regression-risk surface
in the repo. Much of its logic (payload shaping, validation, room lifecycle decisions) is pure and
could live in tested modules, leaving `server.js` a thin I/O orchestrator.

## Scope
- **In:** Identify 1–3 self-contained pure functions (start small, e.g. a join/validation helper or a
  payload builder), move them into a tested module under `src/net/` or `src/server/`, import back.
- **Out:** Rewriting the server, changing the wire protocol, behavior changes. One extraction per session.

## Likely files
- `src/server.js` (shrinks)
- `src/net/` or new `src/server/*.js` + `*.test.js`

## Steps
1. Read `server.js` by its lettered sections; pick ONE pure-ish unit with clear inputs/outputs.
2. Move it to a new module with JSDoc; keep the engine purity rules.
3. Import it back into `server.js`; behavior must be byte-identical.
4. Add deterministic tests for the extracted unit.
5. Smoke-boot the server (`PORT=18182 NODE_ENV=test node src/server.js`) to confirm no regression.

## Acceptance criteria
- [ ] At least one pure unit is extracted and unit-tested.
- [ ] `server.js` imports it; no behavior change (server still boots and serves).
- [ ] `npm run agent:check` green; new tests are deterministic.

## Commands
```bash
npm run agent:check
PORT=18182 PERSISTENCE_DIR=./data-tmp NODE_ENV=test node src/server.js   # boot smoke; Ctrl-C; rm -rf data-tmp
```

## Risks
- Behavior drift during extraction — keep moves mechanical; diff carefully; the server is not covered by
  the suite, so verify by booting.

## Notes
Prefer many small extractions over one big refactor. This is a phase-5 task; product-pillar slices in
`docs/GOAL.md` usually outrank it.
