# SPEC-089 — Zero-Trust WebSocket Input Schema Validation

- **Status:** Todo
- **Wave:** v20 — Phase 0
- **Priority:** High
- **Product Pillar:** P7 — Netcode & Scale (Security & Integrity Hardening)

## Problem

Currently, the authoritative WebSocket server accepts inbound JSON client payloads and directly parses them without schema validation or type checks. If a malicious or buggy client sends malformed payloads (e.g., extremely long nicknames, invalid types, nested prototype pollution objects, or negative numbers for trades/refining), it could trigger runtime server exceptions, corrupt in-memory states, or execute illegal actions. We need a performant, zero-dependency, zero-trust schema validation layer on all inbound socket frames to ensure strict data hygiene and absolute security.

## Scope

### In

- **Pure Zero-Dependency Schema Validator (`src/net/SchemaValidator.js`):** Implement a modular `SchemaValidator` class that defines explicit type, range, length, and property constraints for each WebSocket command.
- **Enforced Payload Hygiene:** Strip any undeclared keys from incoming message objects (mitigating prototype pollution and malicious payload injections).
- **Core Schemas:** Define validators for at least:
  - `join` (`nickname` as string of max length 20, optional `sessionToken` as string)
  - `quick_join` (`mode` as string, optional `tags` as array of strings)
  - `controls` (`keys` as object containing boolean/number inputs, `heading` as finite number, `warp` as optional boolean)
  - `trade` (`planetName` as string, `commodity` as string, `amount` as integer >= 0, `buy` as boolean)
  - `outfit_buy`/`outfit_sell` (`outfitKey` as string)
  - `ship_buy` (`hullKey` as string)
  - `chat` (`text` as string of max length 100, `channel` as string)
- **Integration with server.js:** Intercept all inbound WebSocket messages directly in the `ws.on("message")` handler. Reject any malformed frame immediately with a clear error payload and log the transgression.
- **Testing:** Comprehensive Jest unit tests in `src/net/SchemaValidator.test.js` verifying that malformed payloads are rejected, sanitized, and successfully isolated.

### Out

- **Dynamic Database Schema Sync:** DB persistence validation is handled separately; this spec focuses exclusively on the real-time WebSocket network boundary.

## Acceptance Criteria

- [ ] `src/net/SchemaValidator.js` defines strict, zero-dependency validators for all core message payloads.
- [ ] Undeclared fields are automatically stripped from all incoming payloads.
- [ ] Rejects malformed frames (e.g., negative amounts, wrong data types, overflow lengths) before any routing or logic execution.
- [ ] 100% green Jest coverage under `npm test`.

## Verification Commands

```bash
npm test -- src/net/SchemaValidator.test.js
npm run agent:check
```
