# 024 — JSDoc typecheck gate (`tsc --noEmit` over checkJs)

- **Wave:** A · **Priority:** P2 · **Blocked by:** none

## Description & Expected Impact
The codebase is plain JS with thorough JSDoc, but **no type verification** runs — JSDoc types can rot
and type bugs (wrong arg shapes, missing fields) slip through. Adding a no-emit TypeScript check over
the JSDoc-typed JS adds a real `typecheck` stage without converting any file to `.ts`. **Impact:** a
static safety net catching a class of bugs the runtime tests miss, and a foundation for an eventual TS
migration.

## Definition of Done & Acceptance Criteria
- [ ] A `tsconfig.json` with `allowJs: true`, `checkJs: true`, `noEmit: true`, `strict`-ish settings
      (start lenient: `checkJs` + `noImplicitAny: false`) scoped to `src/**` (exclude tests initially if noisy).
- [ ] `typescript` added as a devDependency; a `typecheck` npm script (`tsc --noEmit`) and a
      `scripts/agent/typecheck.*` that runs it (replacing today's "no tsconfig" skip).
- [ ] `npm run typecheck` passes (fix real JSDoc/type errors, or `// @ts-expect-error` with a reason for
      genuinely-dynamic spots) — **start with the pure engine modules** to keep the surface small.
- [ ] Optionally add `typecheck` to `agent:check`/CI once it's green and stable.

## Implementation Approach
- `npm install --save-dev typescript`. Add `tsconfig.json` (lenient checkJs). Run `tsc --noEmit`; triage
  findings — fix obvious JSDoc mismatches; suppress truly-dynamic ones with justified `@ts-expect-error`.
- Roll out incrementally: scope to `src/engine`, `src/net`, `src/persistence`, `src/physics` first
  (pure + well-typed); add `server.js`/client later (they're looser).

## Test Strategy
- **Static:** `npm run typecheck` exits 0 over the in-scope dirs. No runtime behaviour change.
- **Regression:** `npm run agent:check` (jest/lint/prettier) stays green; typecheck is additive.

## Risks
- `checkJs` over a large JS codebase can surface many findings — keep the initial scope small and
  ratchet up; do not weaken JSDoc to silence the checker.
