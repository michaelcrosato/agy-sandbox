# Contributing

Thanks for your interest in Starfall: Living Galaxy.

**Read [`AGENTS.md`](AGENTS.md) first** — it is the canonical operating manual for
both human and AI contributors (commands, code style, architecture boundaries,
git workflow, and the write-protected substrate files you must not modify).

## Quick loop

```bash
npm ci
# ...make a small, focused change with tests...
npm run agent:check   # format + lint + typecheck + Jest + Vitest client — must be green
```

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`,
  `test`, `docs`, `chore`, `perf`, `refactor`).
- Keep `src/engine`, `src/physics`, `src/net`, and `src/persistence` pure — no DOM,
  sockets, timers, or unseeded `Math.random` in test-reachable paths.
- Add or update tests for every behavior change; never weaken a test to pass a gate.
- Open a pull request against `develop`; the PR template's checklist mirrors the gate.

## Reporting problems

- Bugs / features: open a GitHub issue.
- Security vulnerabilities: **do not** open a public issue — follow
  [`SECURITY.md`](SECURITY.md).
