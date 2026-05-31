# SPEC-148: Secure Execution-Run Single-Use HMAC Cryptographic Key Sentry

## Summary

Implement a secure, single-use, cryptographically verified run token between the host and spawned guest child processes. Upon fork, the host generates a high-entropy cryptographically secure runtime token (using a SHA-256 HMAC signature or high-entropy crypto bytes) and passes it exclusively to the child process via secure environment masking. The child must attach this HMAC run token to the header of every Guest RPC payload. The host validates this token before processing any request; any missing, spoofed, or incorrect token triggers immediate child termination via SIGKILL, logging a severe intrusion breach to the SandboxSecurityRegistry.

## Motivation

- Rogue or spawned third-party guest processes could attempt to spoof IPC channels or send unauthenticated RPC requests, compromising parent resources.
- A cryptographic run token guarantees that only the authentic, sandboxed process spawned during the active run can issue RPC commands, establishing zero-trust cryptographic channel verification.

## Scope

**In:**

- Configure `GuestRunner.js` to generate a high-entropy cryptographic token using `crypto.randomBytes(32).toString("hex")` before each execution run.
- Inject this token exclusively into the sanitised environment variable `GUEST_RUN_TOKEN` for the child process.
- Configure `GuestRunnerWorker.js` to read this token and append it automatically to the metadata of all IPC message payloads dispatched via `globalThis.guestRpcQuery`.
- Enhance `GuestRpcSentry.js` to validate that the token in the incoming IPC message exactly matches the active run's generated token.
- If validation fails, immediately raise a rate-limit/intrusion violation under the action `guest_rpc_auth_failure` in the registry and forcefully SIGKILL the child process tree.
- Cover verification with robust Jest unit and integration tests.

**Out:**

- Do not persist cryptographic run tokens or share keys between concurrent guest executions.

## Acceptance Criteria

- [ ] Every guest script execution run is provisioned with a high-entropy cryptographic runtime token.
- [ ] Guest RPC requests must attach the exact run token or suffer immediate rejection.
- [ ] Any invalid or missing run token triggers immediate SIGKILL child process termination.
- [ ] Intrusion block violations are persistently logged to the central SandboxSecurityRegistry.
- [ ] 100% green Jest coverage verifies authenticated RPC and blocked intrusions.
