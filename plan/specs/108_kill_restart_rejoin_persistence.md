# SPEC-108: Kill-Restart-Rejoin Persistence Integration Test

## Summary
Implements TICKET016: an automated integration test proving the P1 North Star — "kill server, restart, rejoin, verify player + heartbeat-aged world state restored." This test verifies the complete persistence lifecycle end-to-end using worker threads and disk-backed storage.

## Motivation
- P1 DoD: "Kill server, restart, rejoin, and verify player plus heartbeat-aged world state restored"
- Individual persistence components are unit-tested, but no test covers the full cycle
- A session reconnect bug was already discovered during SPEC-105 (closure-captured ws in send()) — this proves the fix works end-to-end

## Scope
**In:**
- Spawn a server worker with disk-backed persistence directory
- Connect a client, join a room, earn credits (trade or bounty)
- Trigger a galaxy heartbeat so market prices shift from baseline
- Hard-terminate the worker (simulating a crash)
- Spawn a NEW server worker loading the same persistence directory
- Connect a new client with the same session token
- Assert: credits, cargo, ship outfits, and modified market prices match post-crash values
- Assert: tutorialCompleted flag survives the restart

**Out:**
- Testing Redis persistence (disk-only for this test)
- Testing multi-worker Redis cluster sync
- Testing client-side state restoration

## Files
- `src/persistence/restart.integration.test.js` (expand existing or create new comprehensive test)
- `src/persistence/serializers.js` (read-only — verify round-trip fidelity)

## Acceptance Criteria
- [ ] Integration test proves full kill→restart→rejoin lifecycle
- [ ] Credits, cargo, and market prices survive the restart
- [ ] `npm run agent:check` green
