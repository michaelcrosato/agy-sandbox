# SPEC-156: Dynamic Faction Hostility Patrols & Vengeance Hunters Spawner

## Summary

Implement a dynamic faction vengeance spawner that periodically monitors player standings and dynamically dispatches elite hunter fleets to track, interdict, and eliminate players whose reputation with a faction falls below a hostile threshold (e.g., -50). These vengeance hunters utilize FSM intelligence with aggressive interdiction sweeps, coordinated shielding coordinates, and high-tier combat ratings to project faction power and enforce severe reputational consequences.

## Motivation

- Factions should not remain passive when players systematically raid their trade caravans or planets.
- Dynamic hunter spawns introduce threat pressure and enforce meaningful narrative consequences.

## Scope

**In:**

- Add dynamic reputation sweeps to the slower galaxy heartbeat loop in `src/server/galaxyTicker.js` or player coordinate audits inside `GameInstance.js` to flag hostile players (standing < -50).
- Develop the faction vengeance hunter spawner dispatching elite hunter wings (NPCs with aggressive AI configurations and custom faction ship profiles) nearby flagged player sectors.
- Extend `AIController.js` and `UtilityAI.js` to direct hunter wings to actively chase, interdict, and lock onto hostile players within their proximity.
- Record vengeance hunter spawns, interdictions, and combat outcomes directly in the `GalacticChronicle` news database and security audit registries.

**Out:**

- Do not spawn infinite hunters; cap active hunters per sector to safeguard worker ticks and CPU resource limits.

## Acceptance Criteria

- [ ] Galaxy heartbeat monitors standings and flags hostile players for faction vengeance sweeps.
- [ ] Elite faction hunters spawn dynamically near flagged players and engage them aggressively.
- [ ] Vengeance hunter spawns and combat outcomes are registered in the Galactic Chronicle.
- [ ] Unit and integration tests verify the spawner, AI hunt patterns, and standing thresholds.
