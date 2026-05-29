# TICKET001 — Bootstrap & dependency hygiene

- **Status:** DONE (2026-05-28) — completed via `plan/specs/005`
- **Priority:** P2 (medium)

## Goal
Make a fresh checkout install and run deterministically, with every tool the scripts invoke actually
declared and the supported Node version pinned.

## Context
`npm run dev` runs `npx http-server .`, but `http-server` is **not** a declared dependency — it works
only because `npx` fetches it on the fly (slow, offline-fragile, version-unpinned). There is also no
`engines` field or `.nvmrc`, so Node version drift is silent. CI uses Node 20; local dev here is Node 24.

## Scope
- **In:** `package.json` (`devDependencies`, `engines`), optional `.nvmrc`; verify `npm ci` from clean.
- **Out:** Changing the dev server tech, touching substrate, adding runtime deps to the game itself.

## Likely files
- `package.json`
- `.nvmrc` (new, optional)
- `README.md` (only if the install steps change)

## Steps
1. `npm install --save-dev http-server` (pin the version it resolves to).
2. Add `"engines": { "node": ">=20" }` to `package.json`.
3. Optionally add `.nvmrc` with `20`.
4. `rm -rf node_modules && npm ci` to confirm a clean, lockfile-driven install.
5. Confirm `npm run dev` starts without an on-the-fly download.

## Acceptance criteria
- [ ] `http-server` appears in `devDependencies` and `package-lock.json`.
- [ ] `package.json` declares `engines.node`.
- [ ] `npm ci` succeeds from a clean tree; `npm run agent:check` stays green.
- [ ] `npm run dev` serves without fetching an undeclared package.

## Commands
```bash
npm install --save-dev http-server
npm ci
npm run agent:check
```

## Risks
- Low. `http-server` is dev-only. Keep it out of `dependencies` so it never ships to the game runtime.

## Notes
Cross-platform `rm -rf` alt on PowerShell: `Remove-Item -Recurse -Force node_modules`.
