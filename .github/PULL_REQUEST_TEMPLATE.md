<!-- Keep PRs small and focused. See CONTRIBUTING.md and AGENTS.md. -->

## What & why

<!-- One or two sentences: what this changes and why. Link any issue. -->

## Checklist

- [ ] `npm run agent:check` passes locally (format + lint + typecheck + build + Vitest: node/jsdom/browser)
- [ ] New/changed behavior has tests
- [ ] No substrate files changed (see `AGENTS.md` §0)
- [ ] `engine`/`physics`/`net`/`persistence` stayed pure (no DOM, sockets, timers, unseeded `Math.random`)
- [ ] Docs updated if behavior, setup, or architecture changed
