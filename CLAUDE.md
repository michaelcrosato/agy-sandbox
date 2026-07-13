# CLAUDE.md

@AGENTS.md

The canonical operating manual is imported above (Claude Code reads `CLAUDE.md`;
other agents read `AGENTS.md` directly, so both stay in sync from one source).

## Claude Code specifics

- **Gate of record:** run `npm run agent:check` (codex map + substrate verify +
  Prettier + ESLint + `tsc --noEmit` + `tsc` build + Vitest: node/jsdom/browser)
  before committing. Never weaken or skip a test to make it pass.
- **Substrate is off-limits:** never edit the files listed in `AGENTS.md` §0.
  `.claude/settings.json` also denies edits to them as a backstop.
- **Purity:** keep `src/engine`, `src/physics`, `src/net`, and `src/persistence`
  free of DOM, sockets, timers, and unseeded `Math.random` in test-reachable paths.
- **Where things live:** product intent is `docs/GOAL.md`; the generated code map
  is `docs/ai/REPO_MAP.md` (run `npm run codex:generate` to (re)produce it).
- **Commits:** Conventional Commits; small, focused, green. Don't push or merge
  unless explicitly asked.
