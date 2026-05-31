# SPEC-078 — reputation decay heartbeat hook

## Description
This specification implements the global reputation decay heartbeat hook (P3). It wires `decayAll` calls inside the server's slow tick to slowly decay outstanding player standings towards zero over time, preventing permanent locked states and allowing slow reputation healing.

1. **Reputation Decay Heartbeat:**
   - In `src/server.js` or `src/server/galaxyTicker.js`, invoke the `FactionRegistry.decay` or `decayAll` methods periodically (e.g., every 60 seconds on the slow tick) to slowly drift active player standings towards neutral.
   
## Definition of Done (DoD)
- [ ] Wire faction standing decay heartbeats to execute on the server slow ticks.
- [ ] Add integration tests asserting that player standings decay periodically as the server runs.
- [ ] Gate check `npm run agent:check` passes completely green.
