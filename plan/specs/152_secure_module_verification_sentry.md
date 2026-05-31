# SPEC-152: Cryptographically Signed Secure Module Verification Sentry

## Summary

Implement a secure, cryptographic integrity verification sentry inside `GuestLoader.js` ESM module loader. Before importing or executing any sub-module or third-party dependency inside the isolated guest process, calculate its SHA-256 integrity hash and verify it against a signed module registry. Any unverified, unsigned, or tampered module is blocked instantly, raising security violations and terminating the guest isolator to prevent dependency injection or supply chain exploits.

## Motivation

- Malicious actors or compromised dependencies could attempt to inject code into otherwise trusted modules.
- Enforcing cryptographic checksum signatures ensures absolute runtime supply-chain integrity inside the guest environment.

## Scope

**In:**

- Enhance `GuestLoader.js` to parse imports and check their files against a pre-defined signed checksum map.
- Compute SHA-256 hashes of module file contents on the fly.
- Reject import resolution if the SHA-256 mismatch is detected, logging `module_integrity_violation` to `SandboxSecurityRegistry`.

**Out:**

- Do not verify standard built-in Node modules (e.g. `path`, `fs`) that are already locked under native global locks.

## Acceptance Criteria

- [ ] ESM imports are cryptographically verified using SHA-256 hashes prior to dynamic loading.
- [ ] Module loading is blocked instantly if a checksum mismatch or untrusted signature is detected.
- [ ] Jest integration tests confirm loading blocks and registry validation limits.
