# SPEC-118: Zero-Trust WebSocket Injection Sentinel & Hardening

## Summary
Implement strict input injection sanitization and pattern boundaries across all WebSocket text payloads (`src/net/SchemaValidator.js`), hardens all profile loading, custom room IDs, nicknames, and database serialization against prototype pollution, path traversal, or command injection strings.

## Motivation
- AI agents running recursive scripts or untrusted external clients might pass malicious string payloads containing parent folder references (e.g., `../../`) or command sequences to bypass sandbox isolation boundaries and access host files.
- Enhances the P0 Security (Sandbox Containment) and P1 Core Determinism pillars.

## Scope
**In:**
- Build regex-based validation guards inside `src/net/SchemaValidator.js` rejecting path traversal characters (`..`, `/`, `\`), shell injection characters (`&`, `|`, `;`, `$`, `>`, `<`), and SQL/JSON injection symbols.
- Apply these injection sanitizers strictly to connection payloads (nicknames, session tokens, room IDs) and outfitting fittingpreset names.
- Raise appropriate security warning exceptions when malicious patterns are detected, dropping processing of the frame.
- Author robust unit tests inside `src/net/SchemaValidator.test.js` validating the boundary pattern blocks.

**Out:**
- Do not restrict legitimate alphanumeric sector naming or standard player dialogue characters in chat payloads.

## Acceptance Criteria
- [ ] SchemaValidator successfully intercepts and rejects path traversal strings.
- [ ] WebSocket connection handlers drop processing of payloads containing shell characters.
- [ ] All 105 test suites and validation gates remain 100% green.
