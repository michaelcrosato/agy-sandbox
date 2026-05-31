# SPEC-131: Centralized Security Audit Registry & Observability Ledger

## Summary
Develop a centralized sandboxed security registry (`src/net/SandboxSecurityRegistry.js`) that dynamically logs all filesystem escape attempts, egress firewall blocks, and unauthorized binary execution attempts into a persistent, append-only JSON audit ledger (`plan/security_audit.json`), exposing telemetry metrics via the `/metrics` API.

## Motivation
- Unattended, multi-day AI execution runs require structured, transparent, and tamper-proof auditing logs of security containment breaches. 
- Having all blocked attempts consolidated in a JSON ledger helps operators analyze AI behavior, adjust allowlists, and discover malicious exploit vectors dynamically without checking distributed stdout logs.
- Enhances the P3 Security and P2 Observability & Telemetry pillars.

## Scope
**In:**
- Create `src/net/SandboxSecurityRegistry.js` capturing deep audit logs.
- Track violations including: Filesystem Path Escapes, Egress Firewall blocks, Outbound API Rate Limiting blocks, and Process Sentinel binary blocks.
- Persist blocked events to `plan/security_audit.json` including millisecond timestamps, category, action/payload, resolved IP/domain, and calling callstack.
- Expose security violation counts and recent logs under `/metrics` JSON data.
- Author unit tests verifying log persistence, structure validation, and metrics exports.

**Out:**
- Do not block or interfere with legitimate same-origin developer operations or Jest test runs.

## Acceptance Criteria
- [ ] SandboxSecurityRegistry records filesystem path escapes, egress firewall blocks, rate limiting blocks, and whitelisting failures.
- [ ] Blocked events are appended to `plan/security_audit.json` with secure timestamps, categories, and parameters.
- [ ] Telemetry metrics `/metrics` dynamically include `security_violations_total` and an array of recent blocks.
- [ ] Core game systems degrade gracefully and run offline without active disk locks during ledger writes.
- [ ] Jest unit tests confirm correct registration, logging structure, and file persistence.
