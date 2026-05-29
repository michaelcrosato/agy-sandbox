# Operational Log & System Ledger

## Page 1: Rules of the Log (Specification v1.0)

### 1. Conformance Tier Matrix
- **MUST / REQUIRED**: Mandatory. Failing this item makes the file non-compliant.
- **SHOULD / RECOMMENDED**: Strong recommendation. Valid exceptions can exist, but implications must be understood and noted.
- **MAY / OPTIONAL**: Permissive. Truly optional fields or sections.
- **MUST NOT / SHALL NOT**: Absolute prohibition. Doing this breaks compliance or forensic safety.

### 2. File and Ordering Constraints
- This file (`docs/LOG.md`) **MUST** be the single source of truth for repository history.
- Root-level log files or duplicate files (like `LOOP_LOG.md`) **MUST NOT** exist in the workspace.
- Entries **MUST** be written in **newest-first (reverse-chronological)** order. 
- New entries **MUST** be programmatically prepended immediately below the `== LOG-ANCHOR ==

## 2026-05-29T06:01 · iter-0036 · GREEN · spec-013-google-genai-sdk-migration

- **Baseline:** `c3baf9203b9b9c45dadbe17937369ddbe25328f9`; 614 tests / 42 suites green. Executing `plan/specs/013`.
- **Move:** Migrate the GitHub Actions autonomous developer agent script `scripts/run-agent.js` from the legacy EOL `@google/generative-ai` SDK to the unified modern `@google/genai` SDK.
- **Changed:** `package.json` and `package-lock.json` (replaced `@google/generative-ai` with devDependency `@google/genai` v2.7.0), `plan/PROGRESS.md` (marked task 013 as complete), `scripts/run-agent.js` (refactored initialization, imports, config schemas, model parameters, and generation calls to support `@google/genai` unified API, and bumped default model to `gemini-2.5-pro`).
- **Decisions:** Confined the Unified SDK dependency entirely to development automation as a non-breaking EOL migration. Standardized on `gemini-2.5-pro` as the next-generation developer assistant. Kept the fallback logic intact to gracefully exit with an error code and console diagnostics if `GEMINI_API_KEY` is not configured, guaranteeing that local and CI offline checks run smoothly without crashing.
- **Validation:** `npm run agent:check` passes cleanly (Prettier formatting, ESLint compliance, and all 614 Jest tests pass in under 2 seconds). Dry-run execution with missing key exits gracefully with a clear console message and no stack trace.
- **Next:** `plan/specs/011` (ESLint 10 migration) or `plan/specs/012` (Jest 30 migration).

` line.
- Agents and humans **MUST NOT** free-hand rewrite or hand-edit older historical entries.

### 3. Entry Content & Structure Rules
- An entry **MUST** be generated only when product code changes, gate status transitions, or a material architecture decision is made.
- Relational or no-op loop triggers that result in no codebase modification **MUST NOT** log an entry.
- Every entry **MUST** use this strict multiline markdown schema:
  `## YYYY-MM-DDThh:mm · iter-NNNN · STATUS · lowercase-kebab-slug`
  * `- **Baseline:**` (Git SHA and starting state)
  * `- **Move:**` (One sentence defining the loop iteration objective)
  * `- **Changed:**` (Bulleted changes list)
  * `- **Decisions:**` (tradeoffs made, or "none")
  * `- **Validation:**` (Command executed and its precise exit/response text)
  * `- **Notes:**` (**OPTIONAL / MAY** — Sandbox area for agent/human thoughts, commentary, or context)
  * `- **Next:**` (1-3 subsequent engineering paths)

### 4. Status Vocabulary
The `STATUS` token in the header line **MUST** be exactly one of: 
`GREEN` (Passed) | `AMBER` (Caveats) | `RED` (Failed) | `BLOCKED` (Waiting) | `INCIDENT` (System Error) | `ROLLBACK` (Reset).

### 5. Size Hard Boundaries
- Individual text lines **MUST NOT** exceed 2,000 characters (guards against single-line data dumps).
- Lines **SHOULD** wrap at or under 120 characters for clean terminal and diff presentation where practical.
- Entries **SHOULD** target 150–350 words, and **MUST NOT** exceed 500 words unless labeled an `INCIDENT` or `ROLLBACK`.
- This file **MUST** be rotated into monthly archives (`docs/log/YYYY-MM.md`) once it crosses 1,000 lines or 250 KB.

---
