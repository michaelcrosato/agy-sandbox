# SPEC-163: Golden Visual E2E Playwright Automation & UI Telemetry Regression Guard

## Summary

Build an automated end-to-end visual regression test suite using Playwright or Vitest Browser Mode inside `src/client/__tests/CanvasRenderer.browser.test.js` or `src/server/PlaywrightVisual.integration.test.js`. Verify that all golden-glassmorphic HUD cards, terminal consoles, and SVG progress meters align perfectly and render correctly across desktop, tablet, and responsive grid layouts, auto-archiving screenshots to `browser_recordings/` on validation sweeps.

## Motivation

- Protects the visual aesthetics and premium cockpit presentation (P8) from silent CSS regressions, misaligned telemetry meters, or broken responsive layouts.
- Harden the UI layer with reproducible visual automation runs to prove client-side visual compliance before code lands on the main branch.

## Scope

**In:**

- Create or expand automated visual regression test suites under Vitest Browser Mode or dedicated Playwright test profiles.
- Capture full viewport screenshots of the cockpit and telemetry dashboards under 3 responsive sizes: Mobile (375x667), Tablet (768x1024), and Desktop (1280x800).
- Mock or freeze animations, blinking stars, event-loop telemetry deltas, and timers during the captures to ensure 100% stable, deterministic screenshot comparisons across parallel runs.
- Automatically save generated baseline and run screenshots inside `browser_recordings/` and configure Vitest visual regression bounds to allow zero technical layout shifts.

**Out:**

- Do not modify actual game renderer dynamics or styling assets; only author verification tests and baseline visual records.

## Acceptance Criteria

- [ ] Viewport screenshots captured under Mobile, Tablet, and Desktop responsive grid limits.
- [ ] Mocks guarantee 100% stable and deterministic visual comparison runs.
- [ ] Viewport layouts are verified and saved inside `browser_recordings/`.
- [ ] Automated regression check is fully integrated into the test pipeline.
