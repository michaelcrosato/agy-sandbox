# 022 — CI Node LTS matrix + version alignment

- **Wave:** A · **Priority:** P1 · **Blocked by:** none

## Description & Expected Impact
CI (`.github/workflows/ci.yml`) runs the gate on **Node 20 only**, while the 2026 Active LTS is **Node
24** (22 is Maintenance) and local dev is Node 24. A single old version misses version-specific breakage
(ESM flags, `--experimental-vm-modules`, native API changes). **Impact:** the gate runs on the versions
real users/CI deploy on, catching regressions before they ship.

## Definition of Done & Acceptance Criteria
- [ ] `ci.yml` uses a `strategy.matrix.node-version: [20, 22, 24]` and runs prettier+eslint+jest on each.
- [ ] The suite passes on all three (fix any version-specific issue or document/exclude with a reason).
- [ ] `package.json` `engines.node` and `.nvmrc` track a supported LTS (keep `>=20` floor; set `.nvmrc`
      to an Active/Maintenance LTS, e.g. `22`).
- [ ] CI green on the matrix; `npm run agent:check` unaffected locally.

## Implementation Approach
- Edit `.github/workflows/ci.yml`: add `strategy: { matrix: { node-version: ["20", "22", "24"] } }` and
  `node-version: ${{ matrix.node-version }}` in the setup-node step. Keep `cache: npm`.
- Bump `.nvmrc` to `22` (Maintenance LTS, broadly available) or `24` (Active LTS) — pick one and note it.
- This is config-only; no source changes expected.

## Test Strategy
- **Regression:** the existing gate runs unchanged per matrix entry. Locally, optionally verify on the
  installed Node (24) via `npm run agent:check`. Confirm the workflow YAML is valid (it's prettier-checked
  under `.github/**/*.md`? no — YAML isn't prettier-scoped, so just keep it well-formed).

## Notes
`ci.yml` itself is NOT prettier/eslint-scoped, so editing it won't affect `agent:check`. Verify by reading
the rendered workflow on the next push (or `act`, if available). Do not weaken the existing steps.
