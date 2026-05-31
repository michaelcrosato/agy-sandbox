# SPEC-154: World-Derived Generative Missions Landing Flow Integration

## Summary

Integrate dynamic, world-derived generative missions directly into the spaceport landing flow, establishing them as the primary contract source inside the player dashboard UI. These contracts are dynamically synthesized from real-time planetary commodity shortages/surpluses, local sector faction conflicts, and piracy indexes. Additionally, extract inline landing-flow interactions from `src/server.js` into a modular, tested `src/server/spaceportMissionHandlers.js` module.

## Motivation

- Connecting generative missions to landing interfaces bridges the gap between simulated economic triggers and player-facing gameplay.
- Decoupling spaceport contract generation further shrinks the server monolith, maintaining zero technical debt and 100% testability.

## Scope

**In:**

- Extract spaceport mission-boarding and contract acceptance/completion message handlers from `src/server.js` into modular handler functions under `src/server/spaceportMissionHandlers.js`.
- Integrate `GenerativeMissions.js` dynamically to synthesize available contracts based on active market inventories (e.g., generating transport missions for planetary commodity surpluses and procurement missions for shortages).
- Update the spaceport landing HUD to present these generative missions dynamically over WebSocket payloads.
- Apply standing rank waivers and docked taxes to rewards, and ensure completing a contract mutates both the faction registry and local commodity inventory.

**Out:**

- Do not implement offline client-authoritative mission-runners; all validation and reward calculations must remain authoritative on the server.

## Acceptance Criteria

- [ ] Inline spaceport landing and mission handlers are fully decoupled into `src/server/spaceportMissionHandlers.js`.
- [ ] Spaceport landing retrieves dynamically generated missions reflecting local planet market surpluses/shortages.
- [ ] Completing a mission mutates faction standing and planetary commodity inventories.
- [ ] Comprehensive Jest unit and integration tests verify the modular contract handlers.
