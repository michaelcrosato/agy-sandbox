# Roadmap

> **Operator: this is your file.** Plain-English bullets; reorder to change priorities. Agents only ever mark items "✅ shipped (PR #n)" — they never rewrite your words. Sections mean: **Now** = working on it, **Next** = queued, **Later** = someday, **Ideas** = unscoped thoughts.

## Now

- Stand up the skeleton: confirm `node src/server.js` starts clean, `npm run agent:check` (the full gate: substrate check + format + lint + typecheck + Jest + client tests) passes, and a browser can connect and see the game canvas
- Wire generated missions into the landing flow — players landing at a spaceport see missions generated from current galaxy state (shortages, conflict, piracy, faction standing), not placeholder stubs

## Next

- Fittings and loadout presets — players can name, save, and re-apply ship loadouts; fitting math is unit-tested and measurable performance differences are visible in flight
- Onboarding and game feel — a first-time player can fly, fight, dock, trade, and accept a mission within 60 seconds with no external explanation; automated smoke test covers the happy path
- Shrink `src/server.js` — continue extracting behaviour into tested handler modules under `src/server/` until the root file is a thin composition shell

## Later

- Squads and shared faction standing — groups of players sharing reputation consequences
- Chronicle / causal history — player-readable log explaining why the galaxy changed ("why is fuel expensive here?")
- Territory and conquest — faction borders shift with conflict outcomes and player action
- Multi-host scale proof — reproducible Redis + multi-worker load harness hitting p99 tick and bandwidth targets
- Ship-quality onboarding polish — touch input, audio, damage and thruster feedback

## Ideas

- Quarry reference (pre-purge implementation history): a previous Starfall implementation exists in the git history of the purge-backup bundle. Do not bulk-restore; if a specific algorithm or data structure from that history is worth recovering, cherry-pick the concept carefully as a new tested slice.
