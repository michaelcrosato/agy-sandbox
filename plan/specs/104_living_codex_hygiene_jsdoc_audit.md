# SPEC-104 — Living Codex Hygiene & JSDoc Audit

- **Status:** Completed
- **Wave:** v24 — Phase 0
- **Priority:** Medium
- **Product Pillar:** P7 — Netcode & Scale

## Problem

The automated repository parser ("Living Codex" under SPEC-101) continuously checks for technical and epistemic debt. The latest report identifies 13 symbols missing canonical JSDoc type annotations across core engine, networking, and server modules. It also flags 5 stale spec file references to non-existent or moved files, which can mislead future developer agents.

## Scope

### In

- **JSDoc Type Annotations:**
  - Add fully-formed JSDoc comments with `@param`, `@returns`, or type descriptions for the following 13 symbols:
    - `src/engine/GameInstance.js`: `GameInstance` class, `SECTOR_ADJACENCY` constant, `getSectorFromPosition` function.
    - `src/engine/LoadoutManager.js`: `OUTFIT_POWER_DRAWS` constant.
    - `src/net/BinaryCodec.js`: `BINARY_PROTOCOL_VERSION` constant.
    - `src/net/ProcessReaper.js`: `ProcessReaper` constant/class.
    - `src/net/PubSub.js`: `PubSub` class.
    - `src/net/SchemaCodec.js`: `ByteWriter` class, `ByteReader` class, `SCHEMA_PROTOCOL_VERSION` constant.
    - `src/server/SquadManager.js`: `Squad` class, `SquadManager` class, `squadManager` constant.
- **Spec Links Correction:**
  - Update stale markdown file links inside the following specifications to refer to valid existing files:
    - `plan/specs/019d_sticky_routing_lb.md`: change "src/server/router.js" reference to `src/net/roomRouter.js`.
    - `plan/specs/035_client_visual_browser_layer.md`: change "src/client/**/*.browser.test.js" reference to `src/client/__tests/CanvasRenderer.browser.test.js`.
    - `plan/specs/071_client_prediction_reconciliation.md`: change "src/client/__tests__/Reconciler.test.js" reference to `src/client/__tests/Reconciler.test.js`.
    - `plan/specs/082_faction_aware_trade_advisor.md`: change "src/engine/TradeAdvisor.js" reference to `src/engine/Trading.js`.
    - `plan/specs/101_living_codex_semantic_registry.md`: change "src/**/*.test.js" reference to standard test file locations.

### Out

- **Functional changes to code:** This task is strictly docstrings and markdown reference corrections, introducing zero functional alterations to runtime behavior.

## Acceptance Criteria

- [x] All 13 flagged JSDoc missing annotations are added with clean type descriptions.
- [x] Stale spec references are fully resolved so that the automated Living Codex gate scan reports `0` stale specification references.
- [x] No ESLint flat file rules are broken.
- [x] `npm run agent:check` passes completely green.

## Verification Commands

```bash
npm run agent:check
```
