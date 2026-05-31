# SPEC-141: Guest Sandbox Environment Variable Sanitization Mask

## Summary
Harden `GuestRunner.js` to completely isolate the child execution process's environment variables. Implement a secure, zero-trust sanitization mask that filters out the host process's sensitive variables (like API keys, system paths, server secrets, or private database URIs) and exposes only a highly restricted, whitelisted subset (e.g. `NODE_ENV`, `PATH`, and execution-specific parameters) to the guest V8 process.

## Motivation
- By default, Node's `child_process.fork` passes the parent's full `process.env` dictionary to the child process.
- If a guest script attempts to execute malicious actions, it can simply read `process.env` to leak API keys, access secret tokens, or learn host environment details.
- Masking environment variables prevents dynamic data leakage and completes the zero-trust isolation of guest execution runs.

## Scope
**In:**
- Implement a secure environment variable mask dictionary in `GuestRunner.js`.
- Filter `process.env` during fork spawn configurations, allowing only:
  - `NODE_ENV` (e.g., `"test"` or `"production"`)
  - `PATH` (essential for Node binary discovery and runtime linking)
  - `GUEST_SCRIPT_PATH` (identifies active script context)
  - Any explicitly passed developer-provided guest parameters.
- Strip all other properties (including all security tokens, API keys, private home directories, and user details).
- Ensure this sanitizer handles cases case-insensitively on Windows (since Windows environment keys are case-insensitive).
- Wrote exhaustive unit tests in `src/net/GuestRunner.test.js` asserting that sensitive environment keys existing in the parent environment are absolutely absent (evaluating to `undefined`) in guest scripts.

## Acceptance Criteria
- [ ] GuestRunner constructs a secure environment variable whitelist mask during worker forks.
- [ ] Sensitive host credentials and directories are completely stripped from child scopes.
- [ ] Whitelisted parameters required for baseline V8 child processing are preserved.
- [ ] Integration tests verify complete variable absence inside active execution scripts.
