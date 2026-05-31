# SPEC-097 — Security: Advanced Guest Isolation & Sandboxed API Rate Limiter

- **Status:** Todo
- **Wave:** v22 — Phase 2
- **Priority:** High
- **Product Pillar:** P0 — Security & Teardown Lifecycle / Sandbox Containment

## Problem

Under unattended, multi-day autonomous agent execution, a major financial and stability risk is recursive runaway token usage (e.g. an agent loop entering an infinite recursion calling external AI endpoints, exhausting the developer's API budget in minutes). We need an active sandboxed API rate limiter and outbound network sentinel to intercept external outgoing connections, restrict API call frequencies, and block unauthorized domains to preserve strict sandbox containment.

## Scope

### In

- **API Rate Limiter (`src/net/ApiRateLimiter.js`):** Implement a pure, robust utility that:
  - Enforces sliding-window request limits (e.g. max 5 API calls per minute, max 100 per hour) across all active agent threads or workers.
  - Automatically mocks or blocks requests with an informative, developer-friendly rate-limit warning instead of crashing.
- **Outbound Network Sentinel:** Create pre-flight validation hooks inside network gateways to strictly restrict outgoing requests to authorized domains (e.g., blocking any non-allowlisted domains to defend against malware data exfiltration).
- **Dashboard Observability:** Display token expenditure rates and active block counts on the telemetry panel.

### Out

- **General browser firewalls:** Enforces boundaries strictly for Node.js backend processes and worker threads spawned in the execution workspace.

## Acceptance Criteria

- [ ] `src/net/ApiRateLimiter.js` successfully blocks or redirects mock external requests when sliding-window limits are breached.
- [ ] Pre-flight validation successfully blocks non-allowlisted HTTP/HTTPS outbound network attempts.
- [ ] Exhaustive Jest coverage validating limits, sliding windows, and warning formats.

## Verification Commands

```bash
npm test -- src/net/ApiRateLimiter.test.js
```
