# 005 — Dependency hygiene & safe bumps

- **Phase:** 0 · **Priority:** P0 · **Blocked by:** none

## Description & Expected Impact
Small, low-risk dependency/runtime-pinning fixes (folds in the still-open `tickets/TICKET001`):
- `ws` 8.20.1 → 8.21.0 (patch, safe).
- `npm run dev` uses `npx http-server` but `http-server` is **not declared** (offline-fragile,
  unpinned).
- No `engines` field / `.nvmrc` → silent Node-version drift (CI Node 20 vs local Node 24).

**Impact:** reproducible installs, declared tooling, pinned runtime — removes a class of "works on my
machine" failures.

## Definition of Done & Acceptance Criteria
- [ ] `ws` upgraded to `^8.21.0`; lockfile updated; tests green.
- [ ] `http-server` added to `devDependencies` (pinned); `npm run dev` works without an ad-hoc fetch.
- [ ] `package.json` declares `"engines": { "node": ">=20" }`; `.nvmrc` added (`20`).
- [ ] `npm ci` succeeds from a clean tree; `npm run agent:check` green.

## Implementation Approach
- `npm install ws@^8.21.0`; `npm install --save-dev http-server`.
- Add `engines.node` to `package.json`; add `.nvmrc` containing `20`.
- Do not change any source; this is config + lockfile only.

## Test Strategy
- **Regression:** `rm -rf node_modules && npm ci` (clean install), `npm run agent:check` (569+ green),
  `npm run dev` starts a static server without downloading an undeclared package.
- No new unit tests (dependency/config change).

## Notes
Supersedes `tickets/TICKET001`; mark that ticket done when this lands. Keep `http-server` in
`devDependencies` only — never ship it to the game runtime.
