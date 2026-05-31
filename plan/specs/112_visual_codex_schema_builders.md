# SPEC-112: Visual Codex Ontology Enhancements & Automated Schema Generator

## Summary
Enhance the premium neon-cyan Living Codex Dashboard (`dashboard-codex.html`) with an interactive developmental feature: a dynamic WebSocket Command & Schema Generator. It will load `plan/codex.json`, display type-annotated client payloads for every WebSocket action, and provide a single-click "Copy Code Payload" builder for client integration.

## Motivation
- The dashboard is currently read-only. Adding interactive developer tooling raises the sandbox to a true frontier-quality local workstation environment.
- Prevents client/server WebSocket drift by generating fully-formed JS/JSON payloads directly from the unified registry ontology on the dashboard.

## Scope
**In:**
- Update `dashboard-codex.html` to add a new "Command payload generator" sidebar or tab
- Parse the registries and actions listed in `plan/codex.json` to extract type signatures and default fields
- Dynamically build code snippets for each message type (such as `trade`, `controls`, `squad_invite`, `preset_save`) showing type constraints and mock default structures
- Add a beautiful glowing, neon-cyan visual interface with micro-animations and single-click copy buttons
- Ensure zero external runtime dependencies are introduced

## Files
- `dashboard-codex.html` (modify)

## Acceptance Criteria
- [ ] Codex Dashboard shows real-time WebSocket client builders for all major action payloads
- [ ] No regression of the dashboard UI style or speed
- [ ] `npm run agent:check` green
