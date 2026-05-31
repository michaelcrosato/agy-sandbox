# SPEC-071 — Client-Side Input Prediction & Server Reconciliation Harness

## Description
This specification introduces a robust network simulation harness to validate client-side input prediction and authoritative server reconciliation logic. It ensures that starship movement feels smooth and instant on the client despite network latency, without losing server-side authority or desynchronizing during packet drops.

1. **Client-Side Local Prediction:**
   - The client immediately simulates and renders local ship movements (position, velocity, heading) from key inputs (thrust, steer) without waiting for server responses.
   - Maintain a local buffer of unacknowledged inputs (with sequence numbers) on the client.

2. **Authoritative Server Reconciliation:**
   - When the server broadcasts its authoritative state, the client receives the older position matching a past input sequence.
   - The client discards enqueued inputs up to the server's acknowledged sequence and re-applies any remaining unacknowledged inputs on top of the server baseline to reconcile position cleanly, preventing jitter.

## Definition of Done (DoD)
- [ ] Implement a pure deterministic `Reconciler` class or library inside `src/client/Reconciler.js` containing prediction buffers and input-reapplication loops.
- [ ] Add rigorous unit tests in `src/client/__tests/Reconciler.test.js` validating that prediction matches server frames exactly, and that input reapplication reconciles position offsets perfectly.
- [ ] Ensure that existing client network handshakes remain unaffected and fully compatible.
- [ ] Gate check (`npm run agent:check`) is 100% green.

## Implementation Approach
- Use local input sequence counters incremented each client tick.
- Store input vectors `{ thrust, steer, dt }` in a FIFO list.
- Re-simulate physics equations on top of authoritative server snapshot baselines.

## Test Strategy
- Assert that enqueued input sequence numbers match.
- Assert that position snaps accurately to reconciled predictions under simulated packet delays.
