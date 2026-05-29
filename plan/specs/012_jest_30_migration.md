# 012 — Jest 29 → 30 migration

- **Phase:** 1 · **Priority:** P1 (toolchain) · **Blocked by:** none

## Description & Expected Impact
Jest 29.7 → 30.x (major). Jest 30 drops older Node support, tightens some matchers/config, and changes a
few defaults. The suite runs under `node --experimental-vm-modules` (ESM). **Impact:** supported test
runner, faster runs, and confidence the 569-test suite still passes on the new major.

## Definition of Done & Acceptance Criteria
- [ ] `jest` upgraded to `^30` in `devDependencies`; lockfile updated.
- [ ] `npm test` runs green (569+ tests / 33+ suites) under Jest 30 with the existing ESM invocation.
- [ ] Any config (`package.json` jest field, if added) and the `--experimental-vm-modules` flag are
      adjusted as Jest 30 requires; no open-handle regressions.
- [ ] CI passes on Node 20; `npm run agent:check` green.

## Implementation Approach
- Read the Jest 30 migration guide (breaking changes: minimum Node, removed/renamed config, matcher
  tightening, `jest-environment` defaults). `npm install --save-dev jest@^30`.
- Run the suite; fix any breakages (likely minor — the tests avoid fake timers due to the ESM `jest`
  global limitation noted in the LOG, so timer-API changes should not bite).
- Keep determinism; do not weaken assertions to pass.

## Test Strategy
- **Regression:** `npm test` (full suite green), then `npm run agent:check`. Run twice to confirm no new
  flakiness/open handles under the new runner.

## Notes
Independent of `011`. If Jest 30 requires Node ≥ a version above CI's Node 20, coordinate with `005`
(`engines`) and the CI matrix before merging.
