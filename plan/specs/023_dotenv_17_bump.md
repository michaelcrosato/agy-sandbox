# 023 — dotenv 16 → 17 bump

- **Wave:** A · **Priority:** P2 · **Blocked by:** none

## Description & Expected Impact
`dotenv` 16.6 → 17.x (the only remaining `npm outdated` entry). It's a dev-only dependency used by
`scripts/run-agent.js` (`dotenv.config()`). **Impact:** stays on the supported line; trivial, low-risk.

## Definition of Done & Acceptance Criteria
- [ ] `dotenv` upgraded to `^17` in `devDependencies`; lockfile updated.
- [ ] `scripts/run-agent.js` still loads env vars (dotenv 17's default `config()` behaviour is verified;
      adjust if 17 changed defaults, e.g. quiet mode / `.env` precedence).
- [ ] `npm audit` 0; `npm run agent:check` green; `npm outdated` reports nothing actionable.

## Implementation Approach
- `npm install --save-dev dotenv@^17`. Check the dotenv 17 changelog for breaking changes (v17 added a
  startup log/quiet option and tweaked defaults). If the startup banner is noisy, pass `{ quiet: true }`
  to `dotenv.config()` in `run-agent.js`.
- No game-runtime impact (dev tooling only).

## Test Strategy
- **Smoke:** `GEMINI_API_KEY= node scripts/run-agent.js` still prints the clear missing-key message (env
  loading didn't break). `npm run agent:check` green. `npm audit` 0.
