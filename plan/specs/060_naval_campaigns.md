# SPEC-060 — Factional Naval Mission Boards & Rank Campaigns

## Description
This spec introduces high-tier faction campaigns and faction-specific mission boards at spaceports. It ties FactionRegistry standing progress with Naval Command Decks (SPEC-055), unlocking specialized rank-locked commendations, premium faction starships, and advanced weaponry.

1. Implement faction-restricted mission generation in `src/engine/MissionManager.js` where high-tier missions (bounties or couriers with rewards > 2000 CR) are only visible if the player satisfies a standing threshold (e.g. `standing >= 30`).
2. Implement ranking promotion triggers: completing high-tier faction missions grants Naval Commendation Merits. Upon reaching merit thresholds, the player is promoted to new naval ranks (e.g., Ensign, Lieutenant, Commander).
3. Connect port handers inside `src/server/portHandlers.js` to prevent players from acquiring faction-locked hulls/weapons unless their current faction rank is verified.
4. Add comprehensive integration tests verifying the entire loop: completing a rank-locked faction mission -> merit accrual -> rank promotion -> successfully acquiring a rank-locked hull.

## Definition of Done (DoD)
- [ ] Add `standingThreshold` checks inside `generateMissions` in `MissionManager.js`.
- [ ] Add `navalMerits` and `navalRank` tracking inside the Player/Ship persistence profile.
- [ ] Wire port outfitting and shipyard purchase hooks to enforce faction rank unlocks.
- [ ] Write integration tests in `faction.integration.test.js` validating merit gains, rank promotions, and purchase lockout enforcement.

## Implementation Approach
- Extend Player serialization to serialize naval merits and faction ranks.
- Add JSDoc typings to prevent TS compiler errors.
- Keep the design pure and headless in the engine modules.
