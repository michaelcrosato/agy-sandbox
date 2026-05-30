# 021 — Client test harness (Vitest Browser Mode / Playwright)

- **Wave:** A · **Priority:** P1 (largest untested surface) · **Blocked by:** none

## Description & Expected Impact
`src/client/*` (CanvasRenderer, InputHandler, NetworkHandler, SpaceportUI, UIController) and
`src/main.js` have **zero automated tests** — now the single biggest coverage gap (the engine is fully
covered). **Impact:** real confidence on the rendering/input/networking layer, catching regressions the
engine suite can't (e.g. the dead-code findings ESLint 10 surfaced lived in client files).

## Definition of Done & Acceptance Criteria
- [ ] A browser-capable test runner is configured (2026 standard: **Vitest Browser Mode** with the
      Playwright provider, or **Playwright** component/E2E) as a **separate** `test:client` script — it
      must NOT disturb the existing Jest engine suite or `npm run agent:check`.
- [ ] At least the **pure/decision-heavy** client units are covered first: `NetworkHandler` snapshot/delta
      application and `UIController` combat-feedback/HUD state transitions (these are logic, not pixels).
- [ ] Optionally a canvas **visual-regression** smoke for `CanvasRenderer` (snapshot a known scene).
- [ ] CI runs the client suite (allowed to be a separate job); `npm run agent:check` stays green.

## Implementation Approach
- Add devDeps: `vitest` + `@vitest/browser` + `playwright` (or `@playwright/test`). Add
  `vitest.config.js` with `browser: { enabled: true, provider: "playwright", instances: [chromium] }`.
- Extract any pure client logic that's currently entangled with the DOM into testable functions where
  cheap (mirror the spec-007 pattern), then test those directly; use the browser runner only where real
  DOM/canvas is needed.
- Keep Jest for `src/**` engine tests; the client runner targets `src/client/**` + `src/main.js`.

## Test Strategy
- **Unit (browser/jsdom):** `NetworkHandler` reconstructs the right entity set from snapshot+delta
  sequences; `UIController` toggles the correct HUD classes/timers for boost/lockout/low-resource/hit.
- **Visual (optional):** a `CanvasRenderer` scene snapshot compared against a stored oracle.
- **Gate:** `npm run agent:check` (engine) + `npm run test:client` both green; CI green.

## Risks
- Browser test infra is heavier (downloads a browser); keep it a separate job so the core gate stays fast.
- Don't try to unit-test pixels everything — prioritize logic; visual regression is a thin smoke.
