# SPEC-137: Dynamic Egress Firewall Admin & Visual Whitelisting Control

## Summary
Enhance the Living Codex dashboard (`dashboard-codex.html`) with an interactive, gold-glassmorphic "Egress Firewall Admin" control card. This allows developers and supervisor systems to dynamically inspect active firewall rules, and add or delete domain names from the whitelist in real-time. Any changes will dynamically hot-reload `plan/config.json` via the `ConfigWatcher` reloader without server restarts, proving zero-downtime firewall admin controls.

## Motivation
- Static egress whitelisting requires redeployment or configuration restarts, which degrades system availability.
- A dynamic, visual administrative panel allows live responses to containment breaches (e.g., blocking a newly-identified malicious egress domain instantly).
- Aligns with the P3 Security and P8 Presentation pillars.

## Scope
**In:**
- Update `dashboard-codex.html` to integrate an "Egress Sentry Admin" input field and control buttons within the Egress card.
- Provide interactive buttons to whitelists or block domains, posting rule changes to a new server endpoint `POST /api/firewall/rules`.
- Expose `POST /api/firewall/rules` in `src/server.js`, validating domain parameter schemas and safely editing `plan/config.json` via schema-safety wrappers.
- Dynamically propagate changes to `SandboxFirewall` in real-time via `ConfigWatcher` watcher hooks.
- Author robust unit/integration tests verifying the rule modification endpoint and live firewall enforcement updates without downtime.

**Out:**
- Do not bypass zero-trust validation checks when saving rule structures to the JSON config file.

## Acceptance Criteria
- [ ] Gold-glassmorphic "Egress Sentry Admin" card with whitelisting and blocking control buttons is rendered on the dashboard.
- [ ] Exposes a validated HTTP endpoint `POST /api/firewall/rules` on the server.
- [ ] Modifying firewall rules dynamically updates `plan/config.json` and hot-reloads the active whitelists in memory.
- [ ] Integration tests verify dynamic domain blocking and endpoint schema validation.
