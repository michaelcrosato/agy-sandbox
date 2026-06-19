# Project: PubSub Subscriptions Refactoring Verification

## Architecture
- `src/server.js`: Main server entry point. Responsible for initializing connections, registering pubsub subscriptions, and starting the server.
- `src/server/pubsubSubscriptions.js`: Extracted module containing pubsub subscription registration logic (`registerPubSubSubscriptions`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Exploration & Structural Audit | Verify `setupPubSubSubscriptions` is removed, `registerPubSubSubscriptions` is imported and called correctly in `src/server.js`, and there are no duplicate code blocks. | none | DONE |
| 2 | Dead Code Scan | Search for and verify zero unused/dead imports or variables in `src/server.js` and `src/server/pubsubSubscriptions.js`. | M1 | DONE |
| 3 | Automated Verification | Run `npm run agent:check` and verify all tests, lint checks, formatting, and type checks pass. | M2 | DONE |
| 4 | Challenger & Forensic Audit | Run adversarial verification and Forensic Auditor checks to ensure refactoring integrity and correctness. | M3 | DONE |

## Interface Contracts
### `src/server/pubsubSubscriptions.js` ↔ `src/server.js`
- Function: `registerPubSubSubscriptions(options)`
  - Registers the WebSocket PubSub subscriptions.
  - Options object contains:
    - `pubsub`: PubSub instance (InMemoryPubSub or RedisPubSub)
    - `instances`: Map of room IDs to `GameInstance` instances
    - `wss`: WebSocket server instance
    - `squadManager`: `SquadManager` instance

