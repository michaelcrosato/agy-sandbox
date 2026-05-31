# SPEC-122: Multi-Process Cluster Live-Dashboard Stream

## Summary
Enhance the Living Codex Dashboard (`dashboard-codex.html`) to poll performance metrics from all sharded cluster workers concurrently, rendering aggregate connection loads, combined event-loop delays, and worker-specific memory utilization charts.

## Motivation
- Sharded multi-process execution makes single-node telemetry insufficient to monitor the overall health of the galaxy. Aggregate cluster visualization ensures no worker operates blindly or gets overloaded.
- Enhances the P2 Observability & Telemetry and P7 Scale pillars.

## Scope
**In:**
- Update `dashboard-codex.html` connection routines to retrieve active worker presence registry lists dynamically from `/metrics`.
- Concurrently poll the `/metrics` endpoint of all registered shards using asynchronous fetch sweeps.
- Render combined real-time SVG charting representing aggregate network egress, peak heap MB sum, and independent worker sparklines.
- Ensure strict error tolerance, falling back gracefully if one worker goes offline during process drains or worker scaling.

**Out:**
- Avoid using heavy client libraries or dynamic charting engines; maintain 100% pure vanilla JS, HTML, and SVG rendering.

## Acceptance Criteria
- [ ] Codex Dashboard successfully polls and aggregates metrics across multiple ports.
- [ ] Real-time SVG charting updates accurately with combined values.
- [ ] Offline nodes are handled gracefully without breaking the dashboard loop.
- [ ] Linter, prettier, and CI validation remain green.
