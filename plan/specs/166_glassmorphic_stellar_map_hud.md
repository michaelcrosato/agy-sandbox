# SPEC-166: Golden-Glassmorphic Interactive Faction War & Strategic Map HUD Card

## Summary

Design and build an exquisite, interactive, and responsive golden-glassmorphic Faction War Strategic Map HUD card inside the main client dashboard (and a dynamic tab on the Codex dashboard). This HUD card will render a real-time responsive SVG star system map showing active sector borders, neon-colored conflict zones, faction influence gradients, and active military supply lanes.

## Motivation

- Delivers a visually stunning and premium presentation layer (P8) that wows the user immediately.
- Provides players with actionable tactical telemetry, displaying where conflicts are peaking so they can align with factions for high-value combat and trading runs.
- Integrates comprehensive visual Playwright automated regressions to protect dynamic layouts across mobile, tablet, and wide viewports.

## Scope

**In:**

- Create an exquisite golden-glassmorphic cockpit HUD card `#faction-war-map` inside the client dashboard (served via `dashboard.html` / `dashboard-codex.html`).
- Render a dynamic, responsive SVG star map displaying sector nodes (Sol, Vega, Nebula), color-coded border influence paths, active siege alerts, and military caravan indicators.
- Hook into `/api/faction/campaign` REST queries and WebSocket broadcast channels to dynamically update SVG vectors, tooltip overlays, and glowing neon indicators.
- Author robust visual automation regressions in `src/server/PlaywrightVisual.integration.test.js` to capture and verify stellar map layouts across Mobile, Tablet, and Desktop viewport sizes.

**Out:**

- Do not alter core flight controls, ship engines, or physical collision dynamics; keep changes focused on presentation styling and visual E2E regressions.

## Approach

1. **Dashboard UI Component:**
   - Design highly polished, CSS-driven glassmorphism panels with amber/gold neon highlights, Outfit typography, and glowing animations.
   - Utilize native responsive SVG elements to scale sector circles, dashed trading route vectors, and faction boundary glows cleanly without image asset overhead.

2. **Dynamic telemetry wiring:**
   - Fetch real-time balances from the campaign REST endpoint on mount.
   - Parse live WebSocket sector updates to shift influence vectors and trigger crimson pulse animations at conflict zone locations.

3. **E2E Visual Regression:**
   - Expand the Playwright visual regression test suite to verify `#faction-war-map` elements.
   - Inject mocks to freeze neon-pulsing keyframe animations and caravan positions during capture sweeps, ensuring complete deterministic image matches.

## Acceptance Criteria

- [ ] Interactive golden-glassmorphic Faction War HUD map card rendered inside dashboard layouts.
- [ ] SVG dynamically renders sector nodes, faction borders, active conflict zones, and tooltips.
- [ ] UI polls and updates SVG states in real-time from REST and WebSocket streams.
- [ ] Playwright visual-regression automation successfully captures all new layout states across all 3 viewports.
