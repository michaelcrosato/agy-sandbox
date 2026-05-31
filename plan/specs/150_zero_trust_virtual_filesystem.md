# SPEC-150: Absolute Zero-Trust Copy-On-Write In-Memory Virtual Filesystem Sentry

## Summary

Implement a secure, state-of-the-art virtual copy-on-write (COW) filesystem overlay in the `ProcessSentinel.js` filesystem boundary jail. Instead of throwing permission errors or jailing mutations to temporary disk folders when a guest script executes writes or appends, redirect all guest filesystem mutations into an in-memory virtual copy-on-write overlay file dictionary. When the guest process attempts to read a file, intercept the read to return the modified virtual overlay content if it exists, otherwise fall back to reading the pristine disk file. This guarantees absolute sandbox guest write capabilities with ZERO physical disk footprint, 100% immune to write leak exploits or disk exhaustions.

## Motivation

- Smart AI agents or sandboxed guest scripts may attempt to write persistent backdoors, delete essential game files, or write massive trash files to fill disk space.
- Standard jailing relies on copy-on-write temporary directories which still consume physical disk space and require cleanup.
- A virtual in-memory COW filesystem guarantees absolute physical disk protection, providing the guest script with a fully simulated writable directory structure that vanishes instantly on run completion.

## Scope

**In:**

- Enhance `ProcessSentinel.js` to support an optional, in-memory virtual filesystem overlay map: `virtualFiles` (relative path -> string/Buffer).
- Intercept all fs operations (`writeFileSync`, `mkdirSync`, `readFileSync`, etc.) when in guest-execution virtual COW mode.
- If a guest writes to a jailed path, write the contents to the `virtualFiles` in-memory map rather than disk.
- If a guest reads from a jailed path, return the virtual map content if populated, otherwise delegate to the pristine read-only disk boundaries.
- Support basic simulated directory lookups via `existsSync` and `readdirSync` by parsing virtual keys.
- Write robust Jest tests in `src/net/WorkspaceDriftSentry.test.js` and `src/net/ProcessSentinel.test.js` validating mock virtual writes, subsequent virtual reads, and zero physical disk mutations.

**Out:**

- Do not virtualize node_modules or standard package imports that are already safely jailed for read-only access.

## Acceptance Criteria

- [ ] Sandbox guest writes are transparently intercepted and directed to an in-memory overlay map.
- [ ] Subsequent guest read operations accurately retrieve virtual overlay contents.
- [ ] No physical file is created, modified, or deleted on disk during virtual execution runs.
- [ ] Intercepts cover both synchronous and asynchronous promise-based fs methods seamlessly.
- [ ] Comprehensive Jest unit tests verify virtual filesystem isolation and zero disk footprint.
