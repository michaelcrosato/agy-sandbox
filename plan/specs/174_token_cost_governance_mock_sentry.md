# SPEC-174: Automated LLM API Token Cost Governance & Mock Sentry

## Summary

Design and build a centralized LLM token cost governor and mock response sentry (`TokenCostGovernor.js`) to protect sandboxed agent execution runs from runaway recursive model spending. It enforces a strict runtime budget, dynamically intercepts outbound model requests, and automatically falls back to lightweight, deterministic local mocks or rejects requests once the budget is exhausted.

## Motivation

- Mitigates severe risk of runaway financial costs during unattended multi-day or overnight autonomous loops.
- Provides absolute zero-cost verification environments by defaulting to high-fidelity simulated models during integration tests.
- Extends the centralized `/metrics` endpoint with real-time token tracking statistics.

## Scope

**In:**

- Create `src/net/TokenCostGovernor.js` to manage session budgets (in tokens and USD currency) for guest agent runs.
- Intercept outbound fetch/http calls directed at major LLM endpoints (e.g., `openai.com`, `anthropic.com`, `google.com`) inside the `SandboxFirewall` or dynamic loader.
- Provide a programmatic mock registry (`TokenCostGovernor.registerMock(promptRegex, responseText)`) that intercept and satisfies LLM calls locally with deterministic, high-fidelity mock completions.
- Automatically reject model queries with `402 Payment Required` or throw security limit errors if the cumulative runtime budget (e.g., $0.05 limit) is crossed.
- Write robust unit/integration tests in `src/net/TokenCostGovernor.test.js` verifying budget exhaustion, local mocks intercept, and clean teardown.

**Out:**

- Do not intercept legitimate loopback cluster API exchanges or non-LLM outbound whitelisted endpoints.

## Approach

1. **Token & USD Accumulator:**
   - Track input/output prompt tokens using simple approximate length-based heuristics (or standard tokenizers) and scale costs dynamically based on model pricing metadata tables.

2. **Zero-Trust Local Mock Intercept:**
   - Integrate proxy checks inside the guest connection firewall/sentinel. If mock mode is enabled or budget is exhausted, redirect model connections to a local interceptor that completes the query synchronously with pre-registered mocks.

## Acceptance Criteria

- [ ] Outbound LLM queries crossing the defined budget cap are gracefully blocked or diverted to local mocks.
- [ ] Pre-registered prompt regular expressions return deterministic simulated responses with zero external API spending.
- [ ] Observe metrics via `/metrics` reporting total tokens spent and USD consumed.
- [ ] Extensive test suite covers limits enforcement and teardown integrity.
