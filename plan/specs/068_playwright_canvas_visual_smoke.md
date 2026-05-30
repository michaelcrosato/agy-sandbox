# SPEC-068 — Playwright Canvas Visual Smoke & Component Interactions

## Description
This specification expands the Vitest Browser Mode + Playwright visual testing infrastructure, implementing a comprehensive canvas visual-regression suite. It ensures that actual client-side render operations (drawing starfields, planets, ships with shields, projectile lines, wandering nebulae boundary danger circles, and Spaceport menus) are thoroughly validated headlessly.

1. **Enhanced Canvas Visual-Regression Suite:**
   - Extend `src/client/__tests/CanvasRenderer.browser.test.js` or create additional visual tests using Vitest's browser mode.
   - Draw mock space entities (ships, projectiles, nebulae, gravity wells) and UI components directly into the DOM canvas element.
   - Assert render layout correctness using standard page/locator snapshots with configured tolerances (`maxDiffPixelRatio` / `maxDiffPixels`) to ensure stable visual runs across various environments.

2. **Render State Mocks & Verification:**
   - Render a variety of composite states: a ship taking shield damage, combat HUD overlays, warp interdiction cyan ripples, and spaceport menus.
   - Add interaction visual smoke tests verifying menu click bounds and state changes under simulated input.

## Definition of Done (DoD)
- [ ] Implement enhanced visual tests in `src/client/__tests/CanvasRenderer.browser.test.js` or a sibling browser test file.
- [ ] Render a fully-populated mock game viewport (with a starfield, at least one ship with shield arcs, moving projectiles, and an overlapping radioactive storm cloud) onto the canvas.
- [ ] Assert visually using locator-based `.toHaveScreenshot()` screenshot comparisons with robust error/pixel tolerances to avoid cross-platform font/rendering flakiness.
- [ ] Ensure `npm run test:client:browser` runs completely green.

## Implementation Approach
- Use the existing Playwright browser context in `vitest.browser.config.js`.
- Construct a mock `ClientWorld` or raw canvas drawing context inside the test environment to render standard vector shapes matching `CanvasRenderer` procedures.
- Target the rendering canvas element specifically for visual matching.

## Test Strategy
- Assert exact component rendering shapes under isolated canvas states.
- Run `npm run test:client:browser` to confirm pixel-perfect visual-regression stability.
