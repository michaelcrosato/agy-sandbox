# SPEC-171: Static Analysis AST Security Sentry

## Summary

Design and build an advanced static analysis AST (Abstract Syntax Tree) Security Sentry that pre-scans all untrusted guest scripts before execution. This sentry will parse or lexically scan the guest code to identify and immediately block dangerous language constructs, such as `eval()`, `Function()`, `globalThis` manipulation, prototype-pollution patterns, or dynamic require/import attempts on unauthorized namespaces.

## Motivation

- Hardens the agent execution laboratory (P0 Security) to a frontier grade.
- Prevents sandbox escape vectors before a single line of guest code is even executed, eliminating runtime bypass race conditions.
- Provides static-analysis audit logging directly to the centralized `SandboxSecurityRegistry`.

## Scope

**In:**

- Create `src/net/StaticSecuritySentry.js` providing static lexical scanning or parsing algorithms.
- Detect and block code utilizing:
  - `eval` or `Function` constructor.
  - Direct mutations on `Object.prototype`, `Array.prototype`, etc.
  - Dynamic constructor manipulation (e.g. `.constructor.constructor`).
  - Dynamic `import()` or `require()` strings targeting unauthorized native Node packages.
- Log syntax safety violations to `SandboxSecurityRegistry` under the `"static_analysis"` category.
- Integrate the pre-scan check inside `GuestRunner.runScript()` to immediately fail runs containing dangerous code.
- Write robust unit tests in `src/net/StaticSecuritySentry.test.js` validating that malicious scripts are blocked statically.

**Out:**

- Do not restrict standard mathematical expressions, string manipulation, or pure array/object operations.

## Approach

1. **Sentry Lexical Analyzer:**
   - Scan the script source code using secure AST parsing (via a lightweight acorn parser or a high-accuracy regular expression scanner).
   - Evaluate identifier tokens and property accessors to detect prototype-pollution and constructor-escape attempts.

2. **Integration into Guest Execution:**
   - Prior to launching the isolated worker process in `GuestRunner.js`, invoke the static pre-scan.
   - If a violation is found, short-circuit immediately with a descriptive rejection payload.

## Acceptance Criteria

- [ ] Malware/escape scripts are identified and blocked before process startup.
- [ ] Centralized security audits are logged for every static analysis rejection.
- [ ] Safe script execution runs proceed normally without false positives.
- [ ] Exhaustive unit tests cover all prohibited syntax patterns.
