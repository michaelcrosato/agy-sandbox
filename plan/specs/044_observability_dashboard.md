# SPEC-044 — Interactive Observability Dashboard

## Description
Spec `010` introduced structured JSON logging and a rich metrics registry exposed raw at `GET /metrics`. While programmatic tools can read this, human engineers and players have no visually engaging way to monitor the persistent living galaxy's health, tick performance, active rooms, or trade transaction volumes.

This specification builds a beautiful, interactive, browser-native **Observability Dashboard** (`/dashboard.html`) designed using modern glassmorphic elements, Sleek Dark Mode, vibrant tailored HSL colors, modern Outfit/Inter typography, and subtle micro-animations.

The dashboard will:
1. Periodically fetch `/metrics` from the authoritative server.
2. Render visual gauges for active client connections, active sectors/rooms, server tick durations (`tick_ms`), network broadcast volume (`broadcast_bytes`), slow client drop counts, and galaxy-wide trade transaction velocities.
3. Show live lists of active sector shards, room tags, and dynamic capacity levels.
4. Integrate a beautiful, interactive toggle to filter sectors by activity and mode.

## Definition of Done (DoD)
- [ ] Create `/dashboard.html` and its styles / logic in a premium, browser-native design system.
- [ ] Connect the dashboard to poll `GET /metrics` dynamically and update all charts, numbers, and lists smoothly without page reloads.
- [ ] Add a clean fallback/demo state if the server is offline or fails to provide metrics.
- [ ] Ensure proper routing in `src/server.js` to deliver `/dashboard.html` and any related assets correctly.
- [ ] Verify using browser-mode tests or manual verification scripts that the page loads correctly and handles raw metric fields gracefully.
- [ ] Global verification gate `npm run agent:check` is completely green.

## Implementation Approach
- Design system tokens in a style block:
  - Font: `Inter` or `Outfit` from Google Fonts.
  - Backdrop filter (glassmorphism), vibrant neon-teal/cyan accent colors, charcoal/slate dark background.
  - Interactive grid cards that grow/glow on hover.
- Write vanilla JS module inside `/dashboard.html` to execute `fetch('/metrics')` every 2 seconds, parsing the JSON gauges and formatting bytes/milliseconds.
- Update `src/server.js`'s HTTP static files server to permit serving `/dashboard.html` (which it already does generically under `ROOT_DIR`).

## Test Strategy
- Verify index and dashboard load without error under browser test.
- Verify global verification:
  `npm run agent:check`
