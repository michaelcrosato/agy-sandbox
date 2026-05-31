# SPEC-102 — Observability: Interactive Visual Codex Dashboard & Ontological Tree UI

- **Status:** Todo
- **Wave:** v23 — Phase 2
- **Priority:** High
- **Product Pillar:** P8 — Presentation & Game Feel / Observability / Living Codex

## Problem

While we have machine-readable `plan/codex.json` and human-readable `plan/CODEX.md`, developers and agents lack a high-fidelity visual interface to explore repository topology, JSDoc compliance, test correlations, and spec progress. We need an interactive, local, zero-dependency HTML dashboard `dashboard-codex.html` that reads the ontological graph dynamically and renders a stunning futuristic canvas/SVG visualization of the sandbox structure.

## Scope

### In

- **Interactive Codex Dashboard (`dashboard-codex.html`):**
  - Design a neon-cyan glassmorphic HUD dashboard rendering dynamic statistics from `plan/codex.json` (such as total LOC, test counts, JSDoc coverage percentage, and active/archived specs).
  - Build an **Ontological SVG Folder Tree Map** showing directories, color-coded by test coverage and JSDoc presence (e.g. green for covered/commented, amber for missing JSDocs, crimson for untested).
  - Include an interactive filter/search bar to instantly isolate modules by symbol exports or spec referrers.
  - Implement a dedicated **Epistemic Debt Panel** dynamically listing outstanding files or methods requiring type signatures.
- **Server Integration:**
  - Expose `GET /codex` HTTP JSON endpoint to serve `/plan/codex.json` to the client.
  - Expose `/dashboard-codex` serving the interactive dashboard.
- **Tests:**
  - Integration tests in `src/server/codexDashboard.integration.test.js` validating the server endpoints and HTML deliveries.

### Out

- **Dynamic server-side file edits:** The dashboard remains strictly read-only for codebase analysis and does not write source code modifications.

## Acceptance Criteria

- [ ] `GET /codex` and `GET /dashboard-codex` successfully serve valid JSON and HTML payloads.
- [ ] `dashboard-codex.html` loads, parses codex data, and visualizes the repository map cleanly without console errors.
- [ ] Integration tests verify response headers, status codes, and structural elements of the visual codex.

## Verification Commands

```bash
npm test -- src/server/codexDashboard.integration.test.js
```
