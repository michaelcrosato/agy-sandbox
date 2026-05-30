# 030 — Engine typecheck ratchet (`src/engine` + `src/persistence`)

- **Phase:** 1 · **Priority:** P1 (static safety; BACKLOG from spec 024) · **Blocked by:** none

## Description & Expected Impact
The `tsc --noEmit` checkJs gate (`024`) covers only the import-isolated `src/net|physics|server`. The
stateful engine (`src/engine`, `src/persistence`) is **unchecked** — a full-graph run surfaced ~70 JSDoc
findings. **Impact:** extends the type net to the largest, most logic-dense part of the codebase, catching
the class of stale-JSDoc bug `024` already found in `WeaponArchetypes.js`.

## Definition of Done & Acceptance Criteria
- [ ] `tsconfig.json` `include` is widened to add `src/engine/**` (and ideally `src/persistence/**`); all
      findings are **fixed in JSDoc**, never suppressed with `@ts-nocheck` / `@ts-ignore`.
- [ ] `npm run typecheck` → exit 0 over the widened scope; it stays in `agent:check` + `ci.yml`.
- [ ] No runtime/source behaviour change — JSDoc/type annotations only.

## Implementation Approach
Ratchet **dir-by-dir** (e.g. `engine/ai` first, then the rest) to keep diffs reviewable. Per the BACKLOG
triage: give `{...parentParams}` constructor configs a `@param {Object}` (or per-field `@typedef`);
reference cross-module types via `import("./X.js").X` instead of bare `{Ship}`; annotate `{}`-then-indexed
maps as `@type {Record<string, number>}`; fix `{}`-vs-required call sites in GenerativeMissions /
PersistenceManager. Widen `include` only once a directory is clean so the gate never goes red mid-ratchet.

## Test Strategy
- **Gate:** `npm run typecheck` exit 0; `npm run agent:check` green; the full Jest suite unchanged (no
  behaviour edits).
- **Regression:** spot-check that no `@ts-nocheck`/`@ts-ignore` was introduced (grep).
