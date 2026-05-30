# 035 — Client visual layer (Vitest Browser Mode + Playwright)

- **Phase:** 1 · **Priority:** P1 (largest untested surface; follow-up to `021`) · **Blocked by:** none

## Description & Expected Impact
Spec 021 covered client **logic** (NetworkHandler delta, UIController HUD) via Vitest + **jsdom**, but the
**canvas/visual** layer — `CanvasRenderer`, `InputHandler`, `SpaceportUI`, `main.js` — has **no** tests
(jsdom can't render canvas/WebGL/computed styles). 2026 web research: **Vitest Browser Mode** (real Chromium
via the Playwright provider, shared context, ~30% faster than classic Playwright E2E) is the standard for
exactly this. **Impact:** real confidence on rendering/input — catching regressions the engine + jsdom
suites can't.

## Definition of Done & Acceptance Criteria
- [ ] A **browser** test project is configured — Vitest Browser Mode with `@vitest/browser` + `playwright`
      (provider `playwright`, `instances: [{ browser: "chromium" }]`, `headless: true`) — as a **separate**
      runner/config that does NOT disturb the jsdom `test:client` project or `agent:check`.
- [ ] At least: a `CanvasRenderer` **visual-regression smoke** (render a known scene to a canvas, compare
      against a stored screenshot oracle) **and** an `InputHandler` test (key/pointer events → the correct
      control flags).
- [ ] CI runs the browser suite as its **own job** (`npx playwright install --with-deps chromium`,
      `headless`, ~30s timeout, `maxWorkers: 4`); the core gate stays fast and green.

## Implementation Approach
- Add devDeps `@vitest/browser` + `playwright`; a `vitest.browser.config.js` (or a `projects` entry) scoped
  to `src/client/**/*.browser.test.js`; a `test:client:browser` script.
- Extract any remaining pure logic from the entangled client files where cheap (mirror `007`/`021`), and use
  the browser runner only where real DOM/canvas is required.

## Test Strategy
- **Visual (browser):** `CanvasRenderer` scene snapshot vs oracle; tolerate sub-pixel diffs via a threshold.
- **Unit (browser/jsdom):** `InputHandler` event→control mapping; `SpaceportUI` panel state.
- **Risk/Gate:** browser infra is heavy and may not run in every sandbox — keep it a separate job and
  document the fallback; `agent:check` + jsdom `test:client` remain the always-on gates.
