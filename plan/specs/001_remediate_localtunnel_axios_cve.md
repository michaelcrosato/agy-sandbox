# 001 — Remediate localtunnel / axios CVEs

- **Phase:** 0 (Quick Wins & Safety) · **Priority:** P0 (security) · **Blocked by:** none

## Description & Expected Impact
`localtunnel@2.0.2` (a runtime `dependency`) pulls **`axios@0.21.4`**, which carries 14 advisories
(SSRF, prototype pollution, DoS, header injection) — 2 flagged **high** by `npm audit`, unfixed in
localtunnel for ~2 years. (Context: a March-2026 axios npm supply-chain attack poisoned versions
1.14.1/0.30.4 with a RAT — a clean lockfile + pinning is the standing mitigation.) localtunnel is only
used for the optional "share a public URL with friends" convenience and only when
`NODE_ENV` is not `production`/`test`. **Impact:** removes 2 high advisories from the dependency tree
and shrinks the runtime attack surface.

## Definition of Done & Acceptance Criteria
- [ ] `npm audit` reports **0 high/critical** advisories (or each remaining one is explained + accepted in this spec).
- [ ] The game server still boots and runs without localtunnel installed (the tunnel feature degrades gracefully).
- [ ] No vulnerable `axios` remains in the production dependency tree (`npm ls axios` empty, or pinned to a safe line).
- [ ] README's "play with friends" section documents the supported sharing method.
- [ ] `npm run agent:check` green; `node src/server.js` boots.

## Implementation Approach
**Preferred (A): make localtunnel optional and remove it from runtime deps.**
- Move localtunnel out of `dependencies`; load it via a guarded dynamic `import("localtunnel")` inside a
  try/catch in `src/server.js` (the tunnel block already gates on `NODE_ENV`). If the import fails, log a
  one-line hint ("install localtunnel or use `cloudflared`/`ngrok` to share") and continue — local play
  is unaffected.
- Update `README.md` "Play with friends" to recommend `cloudflared tunnel --url http://localhost:8080`
  (free, no axios) as the primary path; localtunnel as an optional extra.
- Patterns: keep the change confined to `src/server.js` tunnel section + `package.json` + `README.md`.

**Fallback (B) if the tunnel must stay first-class:** add a `package.json` `overrides` block pinning
`axios` to a patched line and verify localtunnel still functions; document residual risk.

## Test Strategy
- No unit test (network/dep change). **Regression:** `npm ci && npm audit` (0 highs), `npm run agent:check`
  (569+ green), and two boot smokes: default `node src/server.js` (tunnel attempt) and
  `NODE_ENV=test node src/server.js` (tunnel skipped) — both must listen without crashing.
- Confirm `git grep localtunnel` shows only guarded/optional usage.
