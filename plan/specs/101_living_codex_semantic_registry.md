# SPEC-101 — Architecture: Self-Synchronizing Codebase "Living Codex" & Semantic Registry

- **Status:** Todo
- **Wave:** v23 — Phase 0
- **Priority:** High
- **Product Pillar:** P7 — Netcode & Scale / Maintenance / Observability

## Problem

Under autonomous execution loops, agents need highly accurate, structured architectural context to prevent "embedding rot" and "amnesia." While we have progress logs, we lack a dynamic, self-synchronizing **codebase ontology and knowledge graph** ("Living Codex") that maps classes, exported symbols, associated tests, and specification alignment. Having this index dynamically maintained ensures that all downstream agents have a high-compression, completely up-to-date representation of repository topology.

## Scope

### In

- **Codex Generator Script (`scripts/agent/generate-codex.js`):**
  - Implement a pure, robust Node.js script that recursively scans `src/engine/`, `src/physics/`, `src/net/`, `src/persistence/`, and `src/server/` to extract codebase symbols (classes, functions, JSDoc summaries, exports).
  - Scan test files (e.g. `src/engine/LoadoutManager.test.js`) to map unit/integration test suites to their corresponding implementation files.
  - Scan `plan/specs/*.md` to build an alignment graph (mapping which specs modified which files).
  - Extract and identify **"Epistemic Debt"** (e.g. exported functions lacking JSDoc, files listed in specs that are missing, or modules missing test coverage).
  - Output `/plan/codex.json` (structured machine schema) and `/plan/CODEX.md` (beautiful human-readable ontology).
- **Gate Integration:**
  - Wire `npm run codex:generate` or similar into the standard gate workflow `npm run agent:check` so that the codex is regenerated and validated as part of every commit cycle.

### Out

- **Dynamic runtime injection:** The codex system generates compile-time/development files on disk and does not intercept active multiplayer client socket traffic.

## Acceptance Criteria

- [ ] `scripts/agent/generate-codex.js` successfully executes, mapping the repository structure, specs, and tests without throwing errors.
- [ ] `/plan/codex.json` and `/plan/CODEX.md` are correctly populated with up-to-date maps.
- [ ] Incorporating `generate-codex.js` check into the `agent:check` command.
- [ ] Robust unit tests in `scripts/agent/generate-codex.test.js` confirming parsing rules.

## Verification Commands

```bash
npm test -- scripts/agent/generate-codex.test.js
```
