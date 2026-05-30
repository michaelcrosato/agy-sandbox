# 027 — Pin/document the `ws` CVE-2026-45736 security floor

- **Phase:** 0 · **Priority:** P0 (security surface) · **Blocked by:** none

## Description & Expected Impact
**CVE-2026-45736** is an uninitialized-memory disclosure in `ws` `websocket.close()` when a TypedArray is
passed as the `reason` — leaking process memory to the peer. It is **fixed in ws 8.20.1**. The repo already
depends on `ws ^8.21.0` (resolved above the floor; `npm audit` clean), so this is **not** an active
exposure — but nothing documents or guards the floor, so a careless downgrade could silently regress it.
**Impact:** a durable, test-enforced lower bound + an auditable security note.

## Definition of Done & Acceptance Criteria
- [ ] `package.json` keeps `ws` at a range whose floor is **≥ 8.20.1** (`^8.21.0` qualifies); a short
      `SECURITY`/README note (or a comment in the spec/AGENTS) cites CVE-2026-45736 + the 8.20.1 fix.
- [ ] A small regression test asserts the **installed** `ws` version is ≥ 8.20.1 (read
      `node_modules/ws/package.json` `version` and compare), so a future downgrade fails the gate.
- [ ] `npm ls ws` shows a resolved version ≥ 8.20.1; `npm audit` → 0.

## Implementation Approach
- New `src/net/wsVersion.test.js` (or extend an existing net test): import `ws`'s `package.json` version,
  parse `major.minor.patch`, assert ≥ 8.20.1.
- Add the CVE note where security controls are documented (README "Security" or `plan/AGENTS.md`).

## Test Strategy
- **Unit:** the version-floor assertion (fails if `ws` is downgraded below 8.20.1).
- **Regression:** `npm audit` 0; `npm run agent:check` green.
