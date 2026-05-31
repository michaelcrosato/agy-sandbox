# SPEC-157: Outfitting Presets & Fittings Storage Server Modularization & Test Expansion

## Summary

Extract all inline outfitting presets message handlers and endpoints from the monolithic `src/server.js` into a dedicated, unit-tested module `src/server/outfittingPresetHandlers.js`. Extend the test coverage to rigorously assert preset CRUD operations, mass dynamics validation limits, and bounds checking.

## Motivation

- `src/server.js` is currently over 1,900 lines of code and carries high architectural risk because it remains partially unit-tested.
- Extracting fittings presets logic into separate, testable handler modules aligns with the Target Architecture of a thin composition root.
- Hardening presets boundaries protects the server against invalid preset saves (e.g. over-capacity presets, malformed item structures).

## Scope

**In:**

- Decouple fittings presets save/load/delete message handlers and endpoints from `src/server.js` into a new modular file `src/server/outfittingPresetHandlers.js`.
- Harden preset validations to ensure total component mass does not exceed the ship's maximum chassis capability, and that components refer to valid catalog items.
- Authored comprehensive new unit/integration tests in `src/server/outfittingPresetHandlers.test.js` covering preset CRUD operations, invalid configurations, and size boundary overrides.

**Out:**

- Do not modify outfitting catalog items, pricing structures, or client outfitting rendering engines beyond hooking into the modular endpoints.

## Acceptance Criteria

- [ ] Outfitting preset save, load, and delete message handlers are modularized cleanly into `src/server/outfittingPresetHandlers.js`.
- [ ] Presets endpoints enforce strict chassis mass bounds and catalog item validations.
- [ ] End-to-end integration tests verify successful preset saves, loading, deletions, and graceful handling of malformed payloads.
- [ ] The gate check `npm run agent:check` passes 100% green with the new tests.
