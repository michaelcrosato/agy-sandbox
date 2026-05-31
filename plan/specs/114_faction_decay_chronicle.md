# SPEC-114: Faction Standing Decays & Real-Time Galactic Chronicles Integration

## Summary
Wire the slow Faction standings reputation decay heartbeat updates directly into the persistent `GalacticChronicle` news feed and neon timeline sidebar.

## Motivation
- Rep decays happen silently inside the Slow Heartbeat Loop. Integrating these events into the chronicle lets pilots see and understand when and why their reputation drifts towards neutral over time.
- Ensures the P1 ("Persistent Living Universe") and P3 ("Faction & Reputation Web") pillars are visibly unified.

## Scope
**In:**
- Connect `FactionRegistry` decay ticks in `galaxyTicker.js` to write chronicle entries.
- Generate context-specific chronicle messages, such as: `"Commander [Name]'s standing with [Faction] drifted toward neutral due to inactive standings decay."`
- Display these dynamic news entries on the dashboard chronicle timeline.
- Add comprehensive Jest unit and mock integration coverage validating correct Chronicle triggers on decay pulses.

## Files
- `src/server/galaxyTicker.js` (modify)
- `src/persistence/GalacticChronicle.js` (modify)
- `src/server/galaxyTicker.test.js` (modify)
- `plan/specs/114_faction_decay_chronicle.md` (create)

## Acceptance Criteria
- [ ] Heartbeat reputation decays trigger corresponding news entries inside `GalacticChronicle`.
- [ ] News records display correctly on the dashboard.html timeline.
- [ ] No regression in other economy price shocks or server tick loops.
- [ ] `npm run agent:check` green.
