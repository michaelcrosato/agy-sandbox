# SPEC-132: Golden-Glassmorphic Codex "Containment Breaches Log" Console

## Summary
Enhance the developer cockpit dashboard (`dashboard-codex.html`) with an interactive, gold-glassmorphic "Containment Breaches Log" terminal panel that visually prints all sandboxed filesystem path escapes, egress firewall blocks, and rate limit triggers in real-time, pulling dynamic entries from the `/metrics` API.

## Motivation
- True administrative engineering requires exceptional visibility. Consolidating all security blocks inside a premium cockpit terminal screen informs operators immediately of blocked exploits, presenting an advanced, state-of-the-art developer interface.
- Enhances the P2 Observability & Telemetry and P8 Presentation pillars.

## Scope
**In:**
- Modify `dashboard-codex.html` to append a gorgeous, gold-glassmorphic "Containment Breaches & Security Console" panel.
- Parse live security audit logs from the `/metrics` endpoint dynamically.
- Render dynamic list rows showing category badges, raw timestamps, and action details in neon-red and amber.
- Implement robust offline simulation baseline alerts when offline.
- Extend integration assertions in `codexDashboard.integration.test.js` to verify visual presence of the console container.

**Out:**
- Keep visual panels purely vanilla CSS/JS with zero external framework dependencies.

## Acceptance Criteria
- [ ] Codex Dashboard displays a dedicated Containment Breaches panel with neon badges.
- [ ] Telemetry logs update automatically every second from dynamic `/metrics` events.
- [ ] Badges utilize distinct, tailored color coding depending on the category of violation.
- [ ] Integration tests verify the visual presence of the containment log console in served pages.
- [ ] Project quality gates (eslint, prettier, jest) are kept 100% green.
