# SPEC-074 — Faction Pairwise Standing Propagation & Pairwise Relations

## Description
This specification implements complete pairwise faction relations (Allies & Enemies) in `FactionRegistry`. When a player's standing with Faction A shifts (e.g., via kills, trades, or missions), a proportional change is automatically propagated to its Allied factions (+50% positive propagation) and Enemy factions (-50% negative propagation), fully completing the Emergent Faction & Reputation Web (P3).

1. **Pairwise Faction Relations Registry:**
   - Define canonical pairwise relationships in `FactionRegistry` (e.g., Federation is Allied with Independent, but Enemy to Pirates).
   - Implement `adjustStanding(playerId, factionId, amount)` in `FactionRegistry` to automatically calculate and apply pairwise standing ripples.
   
2. **Seeded Alignment Clamping:**
   - Ensure standing changes remain securely clamped in the standard [-100, 100] reputation bounds.
   - Prevent infinite loops or circular propagation using a recursion guard map.

## Definition of Done (DoD)
- [ ] Implement pairwise standing adjustments in `FactionRegistry` propagating standing changes proportionally to Allies and Enemies.
- [ ] Ensure all values remain strictly clamped within standard bounds without circular recursion loops.
- [ ] Add unit tests in `FactionRegistry.test.js` verifying that helping Faction A properly increases Allied Faction B standing while decreasing Enemy Faction C standing.
- [ ] Gate check `npm run agent:check` passes completely green.

## Implementation Approach
- Modify `adjustStanding` inside `src/engine/FactionRegistry.js` to read Allies/Enemies arrays defined for the target faction.
- Recursively apply standing updates with a `propagated = true` flag or visited set to ensure changes only ripple one level deep and do not loop.

## Test Strategy
- Assert that modifying standing with `federation` by +20 automatically increases `independent` by +10 and decreases `pirate` by -10.
