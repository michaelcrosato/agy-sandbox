# 025 — Continue server.js extraction (message handlers)

- **Wave:** A · **Priority:** P2 · **Blocked by:** none (continues `007`)

## Description & Expected Impact
Spec 007 extracted three pure units, but `src/server.js` is still **2,086 LOC** and the large
message-dispatch `if/else if (msg.type === …)` chain (~20 handlers: trade, outfit_buy, ship_buy,
mission_accept, warp_jump, boarding_action, jettison, port_service, …) remains inline and untested.
**Impact:** continues shrinking the highest-risk untested file into tested pure units, lowering
regression risk for all future server work and enabling the scaling epic (`019`).

## Definition of Done & Acceptance Criteria
- [ ] At least **2–3 more** self-contained handlers (or their pure decision cores) are extracted into
      tested modules under `src/server/` or `src/engine/` (candidates: trade buy/sell price+cargo logic,
      ship_buy hull-swap, warp_jump gate/fuel decision, the join/reconnect resolution).
- [ ] `server.js` LOC drops meaningfully and the extracted units have deterministic tests.
- [ ] Behaviour is byte-identical; `node src/server.js` boots and serves; `npm run agent:check` green.

## Implementation Approach
- One handler per commit. Lift the pure part (validation + state math) into a function `handleX(state) →
  result`, leave the socket send/notify in `server.js`. Mirror `007` (frozen options, `*.test.js` beside).
- Prefer the `trade` handler first (clean inputs: ship, planet market, item, action) and `ship_buy`
  (hull stat swap) — both are pure given their inputs.

## Test Strategy
- **Unit:** each extracted handler-core gets a deterministic suite (valid/invalid, capacity/credit edges).
- **Regression:** full `agent:check` + a boot smoke after each extraction (server isn't headlessly tested).

## Notes
Pairs with `024` (typecheck makes extraction safer) and is a prerequisite for `019` (scaling). Keep moves
mechanical; product-pillar features usually outrank it unless they force a `server.js` change.
