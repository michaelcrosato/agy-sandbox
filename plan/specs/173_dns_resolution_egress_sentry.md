# SPEC-173: DNS Egress Firewall & Tunneling Sentry

## Summary

Design and build a secure DNS resolution egress firewall sentry (`DnsEgressSentry.js`) that intercepts all guest DNS lookups. It prevents data exfiltration via DNS tunneling (e.g., querying subdomains like `exfiltratedkey.evil.com`) by analyzing query lengths, entropy, and subdomain depth, while strictly enforcing domain-level resolution allowlists.

## Motivation

- Closes a critical sandbox escape vector where sensitive environment variables, tokens, or private host data can be exfiltrated via outbound DNS traffic.
- Restricts guest network access to absolute zero-trust domain allowlists, hardening the sandbox egress boundaries.
- Records all DNS exfiltration attempt blocks directly in `SandboxSecurityRegistry`.

## Scope

**In:**

- Create `src/net/DnsEgressSentry.js` to intercept Node's core `dns.lookup`, `dns.resolve*`, and `dns.promises` methods inside guest worker contexts.
- Analyze query strings to detect DNS tunneling patterns:
  - Block queries containing highly-random base64/hex sequences (high entropy).
  - Block queries where total subdomain length exceeds 64 characters or subdomain depth exceeds 3 levels.
- Enforce strict domain-level whitelists (e.g., blocking any non-allowlisted target domains).
- Log violations under `"firewall"` inside the centralized `SandboxSecurityRegistry`.
- Write robust integration and unit tests in `src/net/DnsEgressSentry.test.js` validating blocked exfiltrations and clean socket closures.

**Out:**

- Do not intercept or block legitimate, whitelisted loopback resolves or local cluster communication paths.

## Approach

1. **Entropy & Length Analyzers:**
   - Implement Shannon entropy scoring on queried hostname subdomains.
   - Match domains against the active dynamic whitelist parsed from `plan/config.json`.

2. **Core DNS Interception Monkey-patch:**
   - Integrate the `DnsEgressSentry` checks inside the worker activation script so all resolving calls undergo real-time inspections.
   - Immediately raise security access errors on violations, blocking socket establishment.

## Acceptance Criteria

- [ ] Hostname queries containing DNS tunneling sequences or unapproved domains are successfully blocked.
- [ ] Block events are appended correctly with diagnostic stacks into the security ledger.
- [ ] Legitimate allowlisted lookups proceed with zero overhead.
- [ ] Verification tests demonstrate correct blocking and flawless teardown.
