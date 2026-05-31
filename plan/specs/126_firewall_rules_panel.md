# SPEC-126: Egress Firewall Rules Cockpit Dashboard Card

## Summary
Extend the neon-cyan Living Codex Dashboard (`dashboard-codex.html`) with an elegant, gold-glassmorphic security status panel. This card reads allowlisted egress domains, sliding rate limit parameters, and blocked egress request counts dynamically from `/metrics` and renders a live, responsive visualization of sandbox network security boundaries.

## Motivation
- A premium, state-of-the-art laboratory environment should expose its defense matrices in a visually impressive manner. Visualizing blocks, rate constraints, and egress policies instills immediate developer trust and absolute sandbox clarity.
- Enhances the P2 Observability & Telemetry and P3 Security pillars.

## Scope
**In:**
- Modify `dashboard-codex.html` to introduce a gorgeous, modern cockpit telemetry status element: the "Sandbox Egress & Defense Sentry" card.
- Parse real-time `sandbox_firewall`, `api_limiter`, and `memory_leak_alerts` structures dynamically returned from `/metrics`.
- Draw neon-red block meters and amber rate telemetry status bars updating smoothly inside the dashboard polling loops.
- Support simulation parameters in offline fallback modes.
- Verify elements presence under existing visual dashboard integration tests.

**Out:**
- Maintain zero external framework dependencies; draw components using pure CSS, HTML, and SVG filters.

## Acceptance Criteria
- [ ] Codex Dashboard successfully exposes egress rules, firewall triggers, and rate indicators.
- [ ] Responsive neon UI updates properly on metric fetches.
- [ ] Integration tests verify the structural existence of the new status elements.
- [ ] Complete Prettier formatting and ESLint rules remain green.
