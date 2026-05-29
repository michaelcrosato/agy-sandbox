# 🤖 Agent Rules: Autonomous Operating Guidelines

You are an autonomous AI coder operating within `agy-sandbox`. To maintain maximum software reliability and zero-human-in-the-loop stability, you must strictly follow these instructions.

---

## 🚧 Phase 0: Substrate Boundary (READ FIRST)

The following control-plane files are **write-protected** and must **never** be modified, planned against, or deleted under any circumstances:

- `docs/AXIOMS.md`
- `docs/AGENT-LOOP.md`
- `scripts/assert-gate-integrity.ps1`
- `scripts/local-gate.ps1`
- `scripts/run-autonomous-loop.ps1`
- `scripts/validate-log-compliance.py`
- `scripts/manifest.txt`

Everything else in the repository is yours to evolve. Treat `docs/GOAL.md` as your high-level intent and `docs/LOG.md` as the ledger you append to.

---

## 🛠️ Phase 1: Context Gathering & Planning

1. **Read & Understand**: Read the task description completely.
2. **Review Existing Files**: Inspect related files in `src/` and tests to understand dependencies and conventions. Real repo state outranks stale documentation.
3. **Draft a Simple Plan**: Plan changes that align with the existing architecture and modular patterns. Prefer the smallest vertical slice that lands green.

---

## 💻 Phase 2: Implementation & Coding Standards

1. **ES Module Syntax**: Use clean, modern JavaScript with ES Modules (`import`/`export`, not `require`).
2. **Code Quality**:
   - Keep functions modular and single-purpose.
   - Add JSDoc comments documenting parameters, return types, and behavior.
   - Prefer clean configurations and function arguments over generic or hardcoded values.
3. **Headless Engine**: Keep simulation logic in `src/engine` / `src/physics` pure — no DOM, no sockets — so it stays unit-testable. The server orchestrates; the client renders; neither belongs in the engine.
4. **No Placeholders**: Never write placeholders, `// TODO`s, or partial snippets. Every file you write must be a complete, production-ready drop-in replacement.

---

## 🧪 Phase 3: Verification & Test-Driven Development (CRITICAL)

**No work is kept without passing verification.**

1. **Write Unit Tests**: For every new feature or bug fix you **must** add comprehensive Jest tests following the conventions in `src/**/*.test.js`.
2. **Determinism**: Tests must be reproducible. Never let `Math.random` leak into assertions — seed or inject randomness.
3. **Run the Gate**: Verify until 100% green:
   ```bash
   npm run lint
   npm test
   ```
   Markdown and source are also Prettier-checked in CI; run `npm run format` if you touch `README.md` or `.github/**/*.md`.
4. **Self-Correct**: If lint or tests fail, inspect the output, fix the root cause, and re-run. Never weaken or bypass the gate.

---

## 🐙 Phase 4: Git Workflow

The exact workflow depends on how you were launched. When the launching harness injects a "GIT WORKFLOW OVERRIDE," that override takes precedence over this section.

**Default (local autonomous loop / overnight runner):**

1. Work **only** on the current feature branch. Do **not** create branches, switch branches, push, merge, or open pull requests — everything stays local for human review.
2. **Commit only when both `npm run lint` and `npm test` pass.** A red gate means make no commit.
3. Create a **new** commit per change; never amend or rewrite history. Never use `--no-verify`.
4. Use Conventional Commits:
   - `feat(scope): add new capability`
   - `fix(scope): resolve specific bug`
   - `test: increase coverage for module`
   - `docs: update README`
5. After a green commit, append a compressed entry to `docs/LOG.md` per its schema.

**GitHub Actions issue flow (`scripts/run-agent.js`):** push the working branch and open a pull request linking the issue (e.g. `Closes #12`); leave it open for CI validation.
