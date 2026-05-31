# SPEC-147: Golden-Glassmorphic Guest RPC & Workspace Drift HUD Card

## Summary
Enhance the Living Codex Cockpit Dashboard (`dashboard-codex.html`) with an exquisite, golden-glassmorphic HUD cockpit card titled "Guest RPC & Workspace Integrity Sentry". This card will visualize real-time Guest RPC request logs, parameter validation success counters, and sandbox directory drift statistics (added untracked file counts, modified file bytes, and self-healing restoration actions) polled dynamically from `/metrics` with offline simulation support.

## Motivation
- Observability is a core pillar of the laboratory. Visualizing inter-process communication transactions and automatic copy-on-write filesystem self-healing events makes sandbox security operations deeply transparent and immersive.
- Beautiful, real-time indicators showing exactly when an untrusted script attempted to modify workspace files or send malformed RPC payloads, and how the sandbox instantly self-healed, creates a premium, high-tech command center experience.

## Scope
**In:**
- Enhance `GET /metrics` inside `src/server.js` to expose guest RPC counters (total requests, blocked requests, categories) and workspace drift statistics (total self-heals, bytes restored, files purged).
- Extend `dashboard-codex.html` to add a new gold-glassmorphic card: "Guest RPC & Integrity Sentry".
- Render interactive diagnostic logs:
  - **RPC Transaction Feed**: Real-time ticker showing guest RPC actions and validation status (e.g. `GET_SECTOR_STATE [PASSED]`).
  - **Workspace Integrity Meters**: Visual neon progress bars displaying added file counts and modified drift bytes that glow red during active drift corrections.
- Integrate robust offline random simulations generating dynamic mock RPC requests and sandbox self-healing pulses.
- Write HTTP integration tests in `src/server/codexDashboard.integration.test.js` validating the presence of Guest RPC and Drift containers and meters.

**Out:**
- Avoid rendering large database contents or affecting host process telemetry.

## Acceptance Criteria
- [ ] Codex Dashboard displays premium guest RPC and workspace integrity sentry cards.
- [ ] RPC requests and self-healing events are dynamically listed on UI feeds.
- [ ] Active and offline simulation modes are fully supported.
- [ ] Integration tests verify the presence of RPC and Drift DOM elements.
