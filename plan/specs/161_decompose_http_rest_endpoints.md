# SPEC-161: Decompose HTTP REST Endpoints to Modular Handler & Author Integration Tests

## Summary

Decouple the HTTP static file server and API routes from the main `src/server.js` monolith. Extract all REST endpoints (`/metrics`, `/healthz`, `/chronicle`, `/schema`, `/codex`, `/api/firewall/rules`, `/api/outfitting/metrics`, `/api/sandbox/execute`, `/api/sandbox/kill`) into a clean, testable, fully JSDoc-annotated module under `src/server/restHandlers.js`. Write dedicated unit and integration tests covering all routes and edge cases.

## Motivation

- Shrinks the `src/server.js` monolith toward a pure composition root (< 500 LOC).
- Enhances server maintainability, unit-testability, and security by jailing API routing decisions in an isolated handler module.
- Prevents cross-test environment pollution by passing unified dependencies (singletons, registries, configuration hooks) dynamically via an `options` parameter.

## Scope

**In:**

- Create `src/server/restHandlers.js` exporting `handleRestRequest(req, res, options)`.
- Extract all HTTP API and static file serving logic from `src/server.js` into this module.
- Support CORS preflight headers, error responses (400, 404, 500), and invalid parameters cleanly.
- Keep the `server.js` monolith as a pure listener delegating requests to `handleRestRequest` with a unified context options parameter containing metric registries, persistent sessions, and telemetry indicators.
- Authored robust new integration test suites in `src/server/restHandlers.test.js` validating all endpoints, methods, and error cases headlessly.

**Out:**

- Do not modify existing API behavior, rates, firewall rules, or sandboxed executions; only decompose the monolith structure cleanly.

## Acceptance Criteria

- [ ] `src/server/restHandlers.js` handles all REST API and static file delivery modularly.
- [ ] `src/server.js` monolith delegates all HTTP requests to the modular handler.
- [ ] CORS preflight options and headers are handled cleanly across all endpoints.
- [ ] Robust test suite covers all extracted endpoints, parameters validation, and method rejections.
