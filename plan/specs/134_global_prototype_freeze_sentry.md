# SPEC-134: Global Prototype Tamper-Proofing & Object Integrity Guard

## Summary
Implement a high-security global prototype tamper-proofing and integrity sentry (`src/net/IntegrityGuard.js`) that freezes core JavaScript global prototypes (`Object.prototype`, `Function.prototype`, `Array.prototype`, `String.prototype`, `Promise.prototype`, etc.) and monitors global scope variable pollution at sandbox startup. Any attempts by guest scripts to modify global prototypes or pollute global scope are intercepted, blocked, and logged to SandboxSecurityRegistry.

## Motivation
- Untrusted AI guest scripts can attempt prototype pollution or monkey-patch core prototypes (e.g. overriding `Array.prototype.push` or `Object.prototype.toString`) to bypass path checkers, whitelists, or sandbox security boundaries.
- Freezing standard prototypes and monitoring global pollution completely shuts down prototype-based security escapes, ensuring absolute execution integrity.
- Supports the P3 Security and P7 Scale and Netcode pillars.

## Scope
**In:**
- Create `src/net/IntegrityGuard.js` providing a lock and seal startup command.
- Freeze all core JavaScript built-in constructors and their prototypes recursively using `Object.freeze`.
- Snapshot the global `globalThis` properties list and poll or define getters to block and log global variable pollution attempts.
- Log integrity and prototype mutation attempts immediately to `SandboxSecurityRegistry`.
- Author robust unit tests in Jest confirming that attempts to modify prototypes throw errors or fail silently, while registering violations.

## Out:**
- Do not restrict core Node runtime libraries or legitimate modules from operating normally.

## Acceptance Criteria
- [ ] Core JS prototypes (Object, Array, Function, String, etc.) are frozen at sandbox start.
- [ ] Prototype mutation attempts are blocked and logged to SandboxSecurityRegistry.
- [ ] Global variable pollution is detected and restricted.
- [ ] Extensive unit tests confirm that prototype pollution exploits are blocked and recorded cleanly.
