# 034 — Continue `server.js` extraction (round 3)

- **Phase:** 1 · **Priority:** P1 (testability/maintainability) · **Blocked by:** none · **Continues:** `007`, `025`

## Description & Expected Impact
`server.js` is back to **~2,014 LOC** — the faction/AoI/binary wiring re-thickened the monolith, and several
message handlers still hold untested logic inline. **Impact:** more of the hot path becomes pure,
unit-tested units; the socket file shrinks toward pure orchestration (mirrors `007`/`025`).

## Definition of Done & Acceptance Criteria
- [ ] Extract **2–3** more handler cores into pure, tested modules (candidates: fleet create/join/leave
      math, `outfit_buy`, warp/jump (`canJump`/`consumeJump` already exist — extract the remaining handler
      glue), or the mining-pickup/cargo-pod award math in `handleEntityDestroyed`).
- [ ] Each extracted unit has its own `*.test.js`; `server.js` routes through them with **byte-identical**
      behaviour (same wire messages, same success/error paths); LOC measurably drops.
- [ ] `npm run agent:check` green; `node src/server.js` boots; a `ws`-client smoke still receives
      init + state frames.

## Implementation Approach
- Mirror the spec-007/025 pattern: lift the pure decision/mutation core into `src/engine/*` or
  `src/server/*`, keep side-effects (sockets, broadcasts, market mutation) in the handler, and delegate.
  Pick handlers whose logic is self-contained and currently untested.

## Test Strategy
- **Unit:** deterministic tests for each extracted core (success + each error branch).
- **Regression:** full Jest suite + a boot/`ws`-smoke confirming the handlers still behave identically.
