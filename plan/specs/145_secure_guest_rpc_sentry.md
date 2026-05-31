# SPEC-145: Secure Sandboxed Guest RPC Channel Sentry

## Summary
Implement a secure, typed, and schema-validated RPC channel between untrusted guest workers spawned by `GuestRunner.js` and the parent host process. Instead of passing unvalidated objects over process IPC, establish a strict Sandboxed RPC Sentry that validates every guest request against strict action allowlists and parameter schemas, sanitizing responses and blocking prototype-pollution attacks or information leakage.

## Motivation
- Untrusted guest scripts executing in sandboxed V8 environments need controlled access to specific game telemetry or standings databases (e.g. querying sector maps or standing profiles).
- Exposing generic database access or permitting unvalidated JSON IPC messages presents a severe sandbox escape vector (e.g. prototype pollution via `__proto__` or remote method invocation).
- A schema-validated RPC dispatcher ensures absolute type-safety, preventing unauthorized data exfiltration or state tampering.

## Scope
**In:**
- Develop a modular `src/net/GuestRpcSentry.js` to dispatch, validate, and respond to RPC actions.
- Allowlist of authorized guest RPC actions:
  - `GET_SECTOR_STATE`: Returns non-private coordinates of public sector entities.
  - `GET_FACTION_STANDINGS`: Returns standings profiles for faction relationships.
- Enforce strict parameter validation checking for type bounds and regex pattern matches.
- Strip or reject any properties containing keys like `__proto__`, `constructor`, or `prototype` to prevent prototype tampering.
- Update `GuestRunner.js` to register `GuestRpcSentry` message handlers, routing actions safely.
- Write robust unit tests in `src/net/GuestRpcSentry.test.js` validating permitted RPC queries, schema-failure blocks, and blocked prototype injections.

**Out:**
- Do not expose direct write access to persistent databases or allow arbitrary method execution.

## Acceptance Criteria
- [ ] Guest scripts can query allowed game state safely via a secure RPC IPC protocol.
- [ ] RPC requests are strictly validated against action allowlists and parameter schemas.
- [ ] Dangerous key sequences (`__proto__`, etc.) are intercepted and blocked instantly.
- [ ] Unit and integration tests verify secure RPC routing and containment blocks.
