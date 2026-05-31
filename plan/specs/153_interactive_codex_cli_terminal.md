# SPEC-153: Interactive Codex CLI Terminal Dashboard HUD Card

## Summary

Design a highly premium, gold-glassmorphic, interactive visual CLI terminal console inside `dashboard-codex.html`. This panel allows developers and engineers to dynamically dispatch authenticated command lines directly into the active Guest execution isolation layer, displaying stdout/stderr stream outputs in real-time, displaying interactive V8 RSS allocation indicators, and featuring live process-tree termination triggers.

## Motivation

- Developers need real-time visualization and diagnostic execution interfaces for sandboxed runs.
- Premium interactive dashboard capabilities elevate standard static gauges into state-of-the-art developer consoles.

## Scope

**In:**

- Create an interactive, glassmorphic terminal panel inside `dashboard-codex.html`.
- Wire frontend input submission to backend execution APIs to run sandboxed commands.
- Render SVG circular resource indicators and standard stream logs dynamically inside the terminal body.

**Out:**

- Restrict shell triggers strictly to validated allowlisted binaries under `ProcessSentinel` controls.

## Acceptance Criteria

- [ ] Interactive terminal panel is beautifully rendered on the Codex HUD dashboard.
- [ ] Command line dispatching communicates dynamically with backend execution endpoints.
- [ ] Integration tests verify visual components markup presence.
