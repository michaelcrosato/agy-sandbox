# SPEC-099 — Architecture: Centralized Commodities & Unified Schema Registry

- **Status:** Todo
- **Wave:** v23 — Phase 0
- **Priority:** High
- **Product Pillar:** P2 — Emergent Economy / P7 — Netcode & Scale / Maintenance

## Problem

Starfall’s `COMMODITIES` definitions, prices, and network command validation schemas are currently duplicated across engine configurations, schema validators, and client-side rendering files. This creates a severe risk of structural drift, where client and server disagree on basic transaction values or formats, leading to state inconsistencies.

## Scope

### In

- **Centralized Schema Registry (`src/net/SchemaRegistry.js`):**
  - Implement a single, unified registry for all core commodities dictionary configurations (mass, base value, illegal status, category).
  - Centralize WebSocket network command structures, query schemas, and request schemas under the registry.
- **Client & Server Integration:**
  - Refactor `src/engine/commodities.js`, `src/net/SchemaValidator.js`, and `dashboard.html` / `src/client` to import and utilize the unified `SchemaRegistry` configs.
  - Expose `/schema` JSON HTTP endpoint to dynamically sync the commodities database and schemas to the client at startup.
- **Tests:**
  - Robust Jest suites verifying absolute structural parity between client-side and server-side configurations.

### Out

- **Dynamic schema additions at runtime:** Schema mappings remain statically defined inside the centralized registry, maintaining deterministic type safety.

## Acceptance Criteria

- [x] Single source of truth for commodities and network schemas is implemented, and duplications are completely eliminated.
- [x] Centralized schema properties successfully load, and validation checks remain fully operational.
- [x] Complete Jest coverage confirming strict schema structural parity and validation results.

## Verification Commands

```bash
npm test -- src/net/SchemaRegistry.test.js
```
