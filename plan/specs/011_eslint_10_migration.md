# 011 — ESLint 9 → 10 migration

- **Phase:** 1 · **Priority:** P1 (toolchain) · **Blocked by:** none

## Description & Expected Impact
ESLint 9.39 → 10.x (major). The repo already uses flat config (`eslint.config.js`), so the migration is
mostly the version bump + addressing any removed/renamed rules or new defaults. **Impact:** stays on a
supported linter line; picks up newer correctness rules.

## Definition of Done & Acceptance Criteria
- [ ] `eslint` upgraded to `^10` in `devDependencies`; lockfile updated.
- [ ] `eslint.config.js` updated for any v10 breaking changes (config schema, default rule set, Node
      target); `npm run lint` exits 0 over `src scripts`.
- [ ] Any new legitimate findings are fixed (not suppressed); intentional suppressions are justified.
- [ ] CI (`.github/workflows/ci.yml`) still passes on Node 20; `npm run agent:check` green.

## Implementation Approach
- Review the ESLint 10 migration guide for breaking changes (removed formatters/rules, flat-config
  schema tweaks, minimum Node). `npm install --save-dev eslint@^10` + `@eslint/js@^10` if applicable.
- Re-run `npm run lint`; fix real issues; keep `no-unused-vars: warn` and the node+jest+browser globals
  unless v10 requires changes.
- Verify the `format`/`format:check` Prettier pipeline is unaffected.

## Test Strategy
- **Regression:** `npm run lint` (0 errors), `npm run agent:check` (569+ green), and confirm the CI
  workflow's lint step matches local. No app code behavior change expected.

## Notes
Independent of `012`. If a v10 rule surfaces many findings, land the config bump first, then fix
findings in a follow-up spec rather than ballooning this one.
