# 026 — CI Node 22/24/26 matrix + engines floor bump

- **Phase:** 0 · **Priority:** P0 (safety/currency) · **Blocked by:** none · **Supersedes:** part of `022`

## Description & Expected Impact
CI runs on Node **20/22/24**, but per 2026 web research **Node 20 reaches EOL ≈ Apr 2026**, while **24 is
Active LTS, 22 Maintenance LTS, and 26 is Current** (enters LTS Oct 2026). Testing on an EOL runtime gives
false confidence and misses 26-only breakage. **Impact:** the gate tracks supported runtimes and catches
forward-compat issues before they ship.

## Definition of Done & Acceptance Criteria
- [ ] `.github/workflows/ci.yml` `strategy.matrix.node-version` is `['22', '24', '26']` (drop 20, add 26),
      `fail-fast: false` retained; the separate `client-tests` job runs on `24` (Active LTS).
- [ ] `package.json` `engines.node` bumped `>=20` → `>=22`; `.nvmrc` set to `24` (Active LTS) or kept `22`
      (document the choice).
- [ ] `npm run agent:check` green locally (Node 24); YAML is valid Actions syntax; `npm audit` still 0.

## Implementation Approach
- Edit the matrix array + the `client-tests` job's `node-version` in `ci.yml`.
- Edit `engines.node` in `package.json`; set `.nvmrc`.
- No source changes; the suite already passes on 24.

## Test Strategy
- **Regression:** `npm run agent:check` green on the local runtime; CI verifies 22/24/26 on push.
- **Manual:** confirm the YAML parses (no tab/indent errors) and the matrix renders 3 jobs.
