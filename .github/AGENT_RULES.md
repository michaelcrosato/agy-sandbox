# Agent Rules

Root [`AGENTS.md`](../AGENTS.md) is the canonical operating manual. Read it first and treat this file only as the GitHub Actions issue-flow delta.

## Non-negotiables

- Never modify the substrate files listed in `AGENTS.md §0` / `docs/AGENT-LOOP.md`.
- Keep engine, physics, net, and persistence code pure and deterministic.
- Add tests for behavior changes.
- Run `npm run agent:check` before claiming success or committing.
- Never weaken, skip, or delete tests to make a gate pass.
- Never force-push, rewrite history, use `--no-verify`, or commit secrets.

## GitHub issue flow

When `.github/workflows/autonomous-coder.yml` launches `scripts/run-agent.js` for an issue labeled `autonomous`:

1. Create a task branch.
2. Implement the smallest correct slice.
3. Run `npm run agent:check`.
4. Commit only if the full gate is green.
5. Push the task branch and open a pull request that links the issue.

If a launch context injects a more specific git workflow, follow that explicit launch context as long as it does not violate the substrate boundary or gate requirements.
