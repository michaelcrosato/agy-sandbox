# SPEC-142: Golden-Glassmorphic Guest Sandbox Footprint HUD Gauge

## Summary
Enhance the Living Codex Cockpit Dashboard (`dashboard-codex.html`) with an exquisite, golden-glassmorphic HUD card titled "Guest Sandbox Footprint Gauge". This card will visualize the real-time V8 heap memory footprint (allocated vs. maximum limit) and cumulative CPU time consumption (utilized vs. total time-slice budget) of active guest sandbox workers. It will poll this telemetry dynamically from `/metrics` and render real-time SVG circular allocation meters and active CPU delay ticks.

## Motivation
- With the implementation of V8 memory capping (SPEC-139) and CPU time-slice budgeting (SPEC-140), it is vital to expose these hardware-level metrics visually to the user.
- A beautiful, real-time cockpit dashboard displaying active sandbox allocations, memory headrooms, and CPU exhaustion alarms makes the laboratory's security observability fully transparent and immersive.

## Scope
**In:**
- Enhance `GET /metrics` inside `src/server.js` to expose active guest sandbox resource utilization (including current RSS memory, V8 heap usage, maximum heap limits, accumulated CPU user-time, system-time, and cumulative CPU budgets).
- Extend `dashboard-codex.html` to add a new gold-glassmorphic card: "Guest Sentry Resources Monitor".
- Render two dynamic SVG circular progress rings:
  - **Memory Allocation Ring**: Visualizes active V8 heap usage as a percentage of the guest's memory limit (default 128MB).
  - **CPU Budget Ring**: Visualizes cumulative CPU time consumption as a percentage of the time-slice budget (default 2s).
- Add glowing neon status indicators and active CPU ticks that flash or turn red when guest processes are approaching thresholds or get forcefully reaped due to resource breaches.
- Write robust integration assertions inside `src/server/codexDashboard.integration.test.js` verifying the presence of guest resource containers and SVG rings in the rendered HTML.

**Out:**
- Do not affect parent process telemetry or introduce heavy visualization frameworks.

## Acceptance Criteria
- [ ] Codex Dashboard renders gold-glassmorphic guest resource sentry HUD cards.
- [ ] Memory and CPU limits are dynamically visualized via responsive SVG progress rings.
- [ ] Active and offline mock data modes are supported for dynamic telemetry polling.
- [ ] Integration tests verify the structural markup of resource rings and dashboard cards.
