# 🤖 Agent Rules: Autonomous Operating Guidelines

You are an autonomous AI coder operating within `agy-sandbox`. To maintain maximum software reliability and zero-human-in-the-loop stability, you must strictly follow these instructions.

---

## 🛠️ Phase 1: Context Gathering & Planning

1. **Read & Understand**: First, read the issue or task description completely.
2. **Review Existing Files**: Inspect related files in `src/` or configuration files to understand dependencies.
3. **Draft a Simple Plan**: Plan your changes logically. Ensure your proposed code will align with existing architecture and modular patterns.

---

## 💻 Phase 2: Implementation & Coding Standards

1. **ES Module Syntax**: Use clean, modern JavaScript with ES Modules (`import`/`export` instead of `require`).
2. **Code Quality**:
   - Keep functions modular and single-purpose.
   - Add JSDoc comments to document function parameters, return types, and behavior.
   - Avoid generic or hardcoded variables; prefer clean configurations or function arguments.
3. **No Placeholders**: Never write placeholders, `// TODO`s, or partial snippets. Every file you write must be a complete, production-ready drop-in replacement.

---

## 🧪 Phase 3: Verification & Test-Driven Development (CRITICAL)

**No code may be pushed without passing verification.**

1. **Write Unit Tests**: For every new feature or bug fix, you **must** write comprehensive unit tests in the corresponding `.test.js` file.
2. **Run Linting**: Always verify code syntax and formatting:
   ```bash
   npm run lint
   npm run format
   ```
3. **Run Unit Tests**: Execute Jest to ensure all existing and new tests pass:
   ```bash
   npm test
   ```
4. **Self-Correct**: If linting or testing fails, inspect the error output, fix the code, and run tests again. Repeat until 100% successful.

---

## 🐙 Phase 4: Git Workflow & Pull Requests

1. **Branch Naming**: Always work on a separate branch. Use clean naming:
   - Features: `feat/issue-<number>-<description>`
   - Bug fixes: `fix/issue-<number>-<description>`
2. **Commit Messages**: Use Conventional Commits formatting:
   - `feat(scope): add new utility function`
   - `fix(scope): resolve null pointer exception`
   - `test: increase test coverage for math utilities`
3. **Submit Pull Request**:
   - Push your branch to GitHub.
   - Create a Pull Request with a clear description, linking to the original issue (e.g. `Closes #12`).
   - Leave the PR open for automated validation.
