# SPEC-120: Dynamic Sandbox Egress Firewall & Sentry

## Summary
Implement a high-performance outbound connection packet-filtering firewall (`src/net/SandboxFirewall.js`) that wraps the API Rate Limiter and Outbound Sentry layers, preventing any Sandboxed guest threads or socket connections from initiating unauthorized egress requests to host networks or local IP ranges.

## Motivation
- AI agents executing dynamic scripts or unverified dependencies must be strictly constrained from accessing the hosting server's private network ranges (e.g., AWS metadata IPs, local router IPs, or intranet portals), avoiding credentials leak or lateral movement risks.
- Enforces P0 Security (Denial of Service & Egress Protection) boundaries.

## Scope
**In:**
- Coded `src/net/SandboxFirewall.js` providing static and dynamic IP range allowlists (e.g. permit localhost and specific allowlisted LLM API domains; completely block private ranges like `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, and `169.254.169.254`).
- Intercept and reject any DNS or raw IP connection upgrades that attempt to bypass domain-based whitelisting.
- Raise detailed Sandbox Firewall Blocked event alerts on the developer telemetry panel on violation attempts.
- Author robust unit tests in `src/net/SandboxFirewall.test.js` validating the network containment boundaries.

**Out:**
- Do not restrict standard local mock connection ranges (e.g., `127.0.0.1` and local loopbacks) required for sharded multi-worker testing.

## Acceptance Criteria
- [ ] SandboxFirewall successfully blocks connection attempts to private IP ranges.
- [ ] Domain whitelist allowlist is preserved and resolved safely.
- [ ] Telemetry registers block occurrences dynamically.
- [ ] `npm run agent:check` green.
