# SPEC-135: Golden-Glassmorphic CPU Watchdog & Tamper Cockpit Gauge

## Summary
Enhance the Living Codex cockpit dashboard (`dashboard-codex.html`) with a gorgeous, high-fidelity, and golden-glassmorphic "CPU Watchdog & Tamper Alert Sentry" telemetry card. This card will display real-time Event Loop latency gauges and visual alarm indicators for prototype tamper and global scope variable pollution attempts polled dynamically from the server `/metrics` endpoint.

## Motivation
- Visualizing security telemetry builds absolute trust and clarity in the execution integrity of the sandbox environment.
- Providing visual cues (like flashing crimson warning sentry icons and rolling loop latency gauges) gives human operators and autonomous supervisor systems immediate insight into active AI guest containment breaches and thread freezes.
- Fully aligns with the P3 Security and P8 Presentation pillars.

## Scope
**In:**
- Update `dashboard-codex.html` to design and render a premium "CPU Watchdog & Tamper Alert Sentry" status card.
- Integrate an SVG radial gauge depicting rolling Event Loop latency (green to red transition, with soft/hard thresholds indicated).
- Render visual red/amber alert indicators for prototype tamper attempts (`prototype_tamper`) and global scope pollution (`global_pollution`) derived from metrics logs.
- Dynamic data polling and updates integrated into the main dashboard update loop via `/metrics` endpoint.
- Support fully responsive layout integrations under the main cockpit grid.
- Expand integration tests in `codexDashboard.integration.test.js` to assert the structural and functional existence of the new status card and its dials.

**Out:**
- Do not introduce any third-party UI libraries, external charting toolkits, or tailwind utility overrides; rely completely on pure CSS/HTML/SVG as structured.

## Acceptance Criteria
- [ ] Gorgeous golden-glassmorphic visual telemetry cockpit card titled "CPU Watchdog & Tamper Sentry" is successfully rendered on the dashboard page.
- [ ] Displays event loop heartbeat latency as a dynamic percentage or radial dial gauge.
- [ ] Displays active visual alarm panels that light up crimson on prototype tamper attempts or global scope pollution alerts.
- [ ] Metrics update gracefully via active polling hooks.
- [ ] Unit/integration tests verify structural presence and visual element integrity in Jest.
