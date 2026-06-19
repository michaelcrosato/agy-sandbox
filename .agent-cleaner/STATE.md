# Audit State — agy-sandbox

**Mode:** QUICK
**Working branch:** chore/agent-cleaner
**Baseline HEAD:** e895bee style(server): remove unused sanitizeNickname import in server.js
**Last updated:** 2026-06-19 13:08:00 UTC

## Progress
| Chunk ID | Status | FIXED | NEEDS DECISION | INTENTIONAL | Gate evidence |
|---|---|---|---|---|---|
| core-config | DONE | 1 | 1 | 0 | `npm audit` -> 17 moderate remaining |
| format-all | DONE | 0 | 0 | 0 | `npm run format:check` -> passes |
| src-engine | DONE | 0 | 0 | 0 | `npm run lint` & `npm run typecheck` -> clean |
| src-net-persistence | DONE | 0 | 0 | 1 | `scripts/agent/find_unreferenced.js` -> 4 valid dyn-loaded |
| src-server | DONE | 0 | 0 | 0 | `npm run lint` & `npm test` -> clean |
| src-client | DONE | 0 | 0 | 0 | `npm run test:client` -> clean |
| scripts | DONE | 0 | 0 | 0 | `npm run lint` -> clean |
| docs-verify | DONE | 0 | 0 | 0 | README quickstart commands matched -> pass |
| integration | DONE | 0 | 0 | 0 | `npm run agent:check` -> green |

## Findings log

### FIXED
- [core-config] dependencies: Upgraded `vitest`, `@vitest/browser`, and `@vitest/browser-playwright` to version `4.1.9` to resolve a critical security vulnerability (RCE in Browser Mode API) — verified `npm install -D ...` -> success.

### NEEDS HUMAN DECISION
- [core-config] dependencies: `npm audit` reports 17 moderate vulnerabilities related to `js-yaml` nested under Jest's transitives. A fix is only available via a major Jest downgrade to `jest@25`, which would break the Jest 30 ES modules setup. Recommendation: Maintain current Jest 30.4.2 setup and flag this as a known third-party dependency limitation in test scripts.

### INTENTIONAL
- [src-net-persistence] structure: Dynamic modules `src/net/GuestLoader.js`, `src/net/GuestRunnerWorker.js`, `src/net/MainThreadWatchdogWorker.js`, and `src/net/mockFreezeScript.js` are not statically imported. These are loaded dynamically at runtime via Node CLI flags, child worker thread creations, or test environments, and are therefore intentional.

## Tooling added
- None (upgraded existing `vitest`, `@vitest/browser`, `@vitest/browser-playwright` to `4.1.9`).

## Token ledger
| Chunk | Estimated | Actual |
|---|---|---|
| core-config | 1000 | 800 |
| format-all | 500 | 300 |
| src-engine | 2500 | 400 |
| src-net-persistence | 2500 | 500 |
| src-server | 3000 | 400 |
| src-client | 3000 | 400 |
| scripts | 1000 | 300 |
| docs-verify | 1000 | 200 |
| integration | 1000 | 800 |
| **Total** | 15500 | 4100 |

## Handoff summary  (REQUIRED before any context reset)
- **Done:** All chunks completed successfully. Repository audit runs 100% green on formatting, linting, typechecking, unit/client tests, and substrate boundaries.
- **In flight:** None
- **Next:** Stage and commit all changes, compile the final report, and switch back to `develop` branch or merge.
- **How to resume:** Audit is complete. Run `git status` to verify clean branch state.
