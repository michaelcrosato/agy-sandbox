# Audit Plan — agy-sandbox

**Mode:** QUICK
**Generated:** 2026-06-19
**Working branch:** chore/agent-cleaner
**Baseline HEAD:** e895bee style(server): remove unused sanitizeNickname import in server.js

## Repo summary
- Files / dirs: 567 files / 13 directories (excluding node_modules)
- Total LOC: 109,955 LOC (68,216 LOC in src)
- Largest files:
  - package-lock.json: 8141 lines
  - plan/codex.json: 5300 lines
  - dashboard-codex.html: 4703 lines
  - src/main.js: 2543 lines
  - src/client/CanvasRenderer.js: 2104 lines
- Stack(s): Node.js (ESM, package.json, npm)
- Canonical commands (from package.json scripts):
  - install: `npm run agent:bootstrap` (or `npm ci`)
  - lint:    `npm run lint`
  - format:  `npm run format` (format check: `npm run format:check`)
  - types:   `npm run typecheck`
  - test:    `npm test` (backend) and `npm run test:client` / `npm run test:client:browser` (client)
  - full-gate: `npm run agent:check`

## Tooling (see TOOLBELT.md)

**Gates** — required; installed as **repo dev-deps**, pinned:
| Tool | Status | Notes |
|---|---|---|
| eslint | detected | eslint ^10.4.1 (flat config) |
| prettier | detected | prettier ^3.2.5 |
| typescript (tsc) | detected | typescript ^6.0.3 |
| jest | detected | jest ^30.4.2 |
| vitest | detected | vitest ^4.1.9 |

**Accelerants** — optional; **agent environment**, never committed:
| Tool | Available? | Action |
|---|---|---|
| ripgrep (rg) | yes | use |
| ast-grep | no | use fallback (rg + targeted edits) |
| tokei | no | use fallback (measure_repo.js script) |

## Tier / DAG plan
| Tier | Chunk ID | Scope (paths) | Depends on | Parallel group | Write-surface notes |
|---|---|---|---|---|---|
| 1 | core-config | package.json, eslint.config.js, tsconfig.json | — | — | core metadata and lint configs |
| 2 | format-all | (whole repo) | core-config | — | prettier mechanical formatting pass |
| 3 | src-engine | src/engine/*, src/physics/* | format-all | P1 | Game engine core math & physics |
| 3 | src-net-persistence | src/net/*, src/persistence/* | format-all | P1 | Network handlers, serializations, database adapters |
| 3 | src-server | src/server/*, src/server.js | format-all | P1 | HTTP/WS server routes and connection setup |
| 3 | src-client | src/client/*, html files | format-all | P1 | Canvas renderers, UI, dynamic dashboards |
| 3 | scripts | scripts/* | format-all | P1 | Build, verification, and Codex generation scripts |
| 4 | docs-verify | README.md, docs/* | mod-* | P2 | README quickstart, architecture doc validations |
| 5 | integration | (whole repo) | all | — | final global checks run + report compilation |

**Max parallel width:** 1 (Running in QUICK mode sequentially)

## Token estimate
- Rough total: 15,000 tokens
