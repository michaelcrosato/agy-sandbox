# TICKET016 — Kill-Restart-Rejoin Persistence Integration Test

- **Status:** OPEN
- **Priority:** P1 (high)

## Goal
Implement a robust, automated integration test verifying that a player's exact profile, cargo, credits, and global galaxy economy snapshots survive a hard server restart and can be cleanly rejoined.

## Context
One of our core North Star showcases is "The world moved" (killing the server, restarting, rejoining, and seeing that player and heartbeat-aged markets are fully restored). While individual components are tested, we do not have an automated integration test verifying this full end-to-end restart sequence inside the test suite.

## Scope
- **In:**
  - Create a new integration test inside `src/persistence/restart.integration.test.js` or a new integration test file.
  - Spawn an in-memory/disk store server, simulate player actions (earning credits, buying cargo, triggering outfitting changes).
  - Force a hard server shutdown, save persistence files to disk.
  - Re-bootstrap the server loading the saved state.
  - Connect a new client with the same player credentials, asserting that credits, ship state, outfitting purchases, and modified market rates are identical to post-shutdown values.
- **Out:**
  - Mocking networking calls in a way that bypasses real serialized message flows.
  - Setting up real external database instances.

## Likely files
- `src/persistence/restart.integration.test.js`
- `src/persistence/PersistenceManager.js`
- `src/server.js`

## Steps
1. Inspect the existing multinode integration tests or supervisor tests for details on how multiple server processes/threads are launched.
2. In `restart.integration.test.js`, write a test case simulating the full player connect, trade, earn credits, purchase outfit, and disconnect cycle.
3. Call `server.shutdown()` or mock a hard server crash, ensuring persistence files are written.
4. Restart the server with the exact same persistence configuration.
5. Reconnect the player, query their profile via Websocket payload sync, and assert state matches perfectly.
6. Verify the gate with `npm run agent:check`.

## Acceptance criteria
- [ ] Integration test executes a full connect-save-kill-restart-restore flow.
- [ ] Restored player credits, cargo, and outfitting match pre-restart state.
- [ ] Saved planetary market shifts survive restart and match pre-restart values.
- [ ] Test purges any temporary integration directories after execution completes.
- [ ] `npm run agent:check` passes cleanly.

## Commands
```bash
npm test -- src/persistence/restart.integration.test.js
npm run agent:check
```

## Risks
- File system locks or race conditions during rapid shutdown/restart cycles on Windows. Ensure proper timers and file purges are executed.

## Notes
A key showcase moment that proves persistent world simulation works headlessly.
