# SPEC-045 — Shielded Cargo Holds & Decoy Jammers

## Description
Security scans on core planets currently confiscate 100% of contraband cargo and levy a flat 1,500 CR fine unconditionally. While this is effective, it limits the smuggling playstyle. This specification introduces two new dynamic, buyable outfitting modules:
1. **Shielded Cargo Holds** (cost: 3,500 CR, type: `jammer`, value: 0.6, mass: 600 kg, description: "Lead-shielded cargo containment. Reduces planetary security scan contraband detection probability by 60%.")
2. **Security Decoy Jammer** (cost: 5,000 CR, type: `jammer`, value: 0.9, mass: 400 kg, description: "Active military-grade scanner decoy. Reduces planetary security scan contraband detection probability by 90%.")

These jammer outfits will be evaluated during landing sweeps to determine if security patrols succeed in detecting the player's contraband. The scan bypass rate will be calculated based on the highest jammer value installed. Randomness is injected using a seeded PRNG (`createSeededRng`) to keep simulations deterministic in test environments.

## Definition of Done (DoD)
- [ ] Add the two new jammer outfits to `src/engine/outfitCatalog.js`.
- [ ] Implement jammer detection calculations on the server inside the landing flow in `src/server.js`.
- [ ] Utilize a seeded or optional random generator in the scan check so tests remain completely reproducible.
- [ ] Ensure that if a player carries multiple jammer outfits, only the highest protection value is used (no infinite stacking).
- [ ] Add deterministic unit/integration tests verifying that:
  - Having no jammer guarantees 100% detection.
  - A jammer correctly reduces the detection rate to the configured probability.
  - Correct fines and confiscations are applied when scans succeed, and bypassed when scans fail.
- [ ] Ensure `npm run agent:check` is completely green.

## Implementation Approach
- Update `src/engine/outfitCatalog.js` to add the two new entries:
  ```javascript
  { name: "Shielded Cargo Holds", cost: 3500, type: "jammer", value: 0.6, mass: 600, description: "Lead-shielded cargo containment. Reduces security scan contraband detection probability by 60%." },
  { name: "Security Decoy Jammer", cost: 5000, type: "jammer", value: 0.9, mass: 400, description: "Active military-grade scanner decoy. Reduces security scan contraband detection probability by 90%." }
  ```
- In `src/server.js`, inside the `land` handler:
  - Find the highest `jammer` outfit installed on the player's ship.
  - If a jammer is installed, roll a random check. If `rng() > jammer.value`, the scan succeeds, contraband is confiscated, and a fine is applied. Otherwise, the scan is bypassed, and the player lands with contraband intact.
- Keep the scan check logic testable by introducing an optional `rng` helper parameter that defaults to `Math.random`.

## Test Strategy
- Create a test case in `src/engine/Outfitting.test.js` or `src/engine/Gameplay.test.js` verifying that jammers successfully block scans under controlled PRNG seeds.
- Verify global verification command:
  `npm run agent:check`
