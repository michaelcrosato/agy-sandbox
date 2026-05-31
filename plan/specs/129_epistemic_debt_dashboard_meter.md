# SPEC-129: Living Codex Epistemic Debt Cockpit Telemetry Meter

## Summary
Enhance the neon-cyan Living Codex Dashboard (`dashboard-codex.html`) with an interactive golden-amber codebase health panel: the "Epistemic Debt & Coverage Meter". This panel dynamically reads code-completion scores, JSDoc coverage ratios, and missing test map files from `plan/codex.json` to draw premium, real-time SVG circular health rings on the cockpit view.

## Motivation
- True engineering excellence requires perfect codebase visibility. Highlighting epistemic debt (missing documentation and test coverage) on the developer cockpit dashboard incentivizes absolute quality and zero developer drift.
- Enhances the P2 Observability & Telemetry and P8 Presentation pillars.

## Scope
**In:**
- Modify `dashboard-codex.html` to append a gorgeous, gold-glassmorphic "Epistemic Quality & Coverage Sentry" telemetry panel.
- Parse structured compilation stats (JSDoc coverage, total classes, untested methods, spec alignment ratios) dynamically from `plan/codex.json`.
- Render real-time SVG circular progress rings showing code documentation completeness and spec alignment.
- Support offline simulation fallback data when codex JSON loads fail.
- Verify element presence in the dashboard integration test suite.

**Out:**
- Maintain zero external framework/SVG script dependencies.

## Acceptance Criteria
- [ ] Codex Dashboard displays visual health rings mapping JSDoc coverage and spec alignment.
- [ ] Telemetry values update smoothly when `/codex` data is parsed.
- [ ] Integration tests verify the structural existence of the health indicators.
- [ ] Prettier and ESLint quality gates remain 100% green.
