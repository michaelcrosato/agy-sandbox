# CLAUDE.md

Canonical agent instructions live in **[AGENTS.md](AGENTS.md)** — read it first.

Critical constraints (full detail in AGENTS.md):

- **Never modify substrate files** listed in `docs/AGENT-LOOP.md` / AGENTS.md §0.
- **Gate every change with `npm run agent:check`** (prettier + eslint + jest = CI) before committing.
- Keep `src/engine`, `src/physics`, `src/net`, `src/persistence` pure: no DOM, sockets, or `Math.random`.
- Product intent: `docs/GOAL.md`. Workflow loop, commands, and conventions: `AGENTS.md`.
