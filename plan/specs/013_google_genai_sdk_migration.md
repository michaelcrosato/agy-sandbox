# 013 — Migrate @google/generative-ai → @google/genai

- **Phase:** 1 · **Priority:** P1 (deprecation) · **Blocked by:** none

## Description & Expected Impact
`scripts/run-agent.js` (the GitHub-Actions issue-triggered coder) depends on `@google/generative-ai`
0.11.5 (latest 0.24.1), which Google has **superseded by the unified `@google/genai` SDK** (the legacy
package is in maintenance/EOL). **Impact:** keeps the automation on a supported, maintained SDK and
unlocks current Gemini models/features. Low blast radius — confined to one script, not the game runtime.

## Definition of Done & Acceptance Criteria
- [ ] `@google/genai` replaces `@google/generative-ai` in `devDependencies`; the old package removed.
- [ ] `scripts/run-agent.js` updated to the new SDK's client/init/`generateContent` API and a current
      model id; lint/prettier clean (the script is in the `eslint src scripts` + prettier `scripts/**/*.js`
      scope).
- [ ] A dry-run path (no real API key / `GEMINI_API_KEY` unset) fails gracefully with a clear message
      rather than crashing, so CI without secrets doesn't break.
- [ ] `.env.example` updated if the env var name/usage changes; `npm run agent:check` green.

## Implementation Approach
- Read the `@google/genai` quickstart; map the old `GoogleGenerativeAI(key).getGenerativeModel(...)` /
  `model.generateContent(...)` calls to the new `GoogleGenAI({apiKey}).models.generateContent({...})`
  shape; update model id to a current Gemini.
- Keep `run-agent.js`'s GitHub PR flow unchanged; only swap the LLM client.
- This script is not unit-tested; verify by `node scripts/run-agent.js` with no key (graceful exit) and a
  lint/prettier pass.

## Test Strategy
- **Static:** `npm run lint` + `npx prettier --check scripts/run-agent.js` pass.
- **Smoke:** `GEMINI_API_KEY= node scripts/run-agent.js` exits with a clear "missing key" message, no
  stack trace. (Live API calls are out of scope / require secrets.)

## Notes
If consuming this SDK ever moves into the game runtime, add it to `dependencies` and gate it behind an
env flag; for now it stays dev-only automation.
