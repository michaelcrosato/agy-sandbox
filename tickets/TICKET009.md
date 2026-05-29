# TICKET009 — EW4: Passenger missions (bunks)

- **Status:** DONE (2026-05-28)
- **Priority:** P2

## Goal
Add passenger-transport contracts: ferry N passengers (occupying ship "bunks", not cargo tonnage) to
a destination for a payout on arrival.

## Context
`MissionManager` has courier/smuggle/bounty/storyline + generative missions, all cargo- or
combat-based. Endless Sky's passenger charters are a distinct income stream that uses passenger
capacity rather than the cargo hold.

## Scope
- **In:** `Ship.passengerCapacity` (persisted); a `passenger` mission type in `acceptMission`
  (bunk-capacity reservation) and `checkArrivalCompletions` (pay on arrival, no cargo); a passenger
  branch in `generateMissionsForPlanet`.
- **Out:** Passenger quarters as an outfit (EW7 follow-up); reputation effects.

## Likely files
- `src/engine/Ship.js` (+ `Ship.test.js`)
- `src/persistence/serializers.js`
- `src/engine/MissionManager.js` (+ `MissionManager.test.js`)

## Steps
1. `Ship`: add `passengerCapacity = 4`; persist via `PLAYER_HULL_FIELDS`.
2. `acceptMission`: for `type === "passenger"`, refuse if `usedBunks + mission.bunks >
   player.passengerCapacity` (usedBunks = sum of bunks over active passenger missions); no cargo added.
3. `checkArrivalCompletions`: complete a passenger mission at its destination — pay reward, no
   `removeCargo`; leaving `activeMissions` frees the bunks.
4. `generateMissionsForPlanet`: add a passenger band (keeps 3 procedural missions/landing).

## Acceptance criteria
- [x] Accepting a passenger mission reserves bunks and adds no cargo.
- [x] A mission that exceeds free bunks is refused.
- [x] Arrival pays the reward and removes the mission (freeing bunks for a new one).
- [x] `Ship.passengerCapacity` defaults sensibly and round-trips through persistence.
- [x] `npm run agent:check` green (29 suites / 535 tests).

## Commands
```bash
npm test -- src/engine/MissionManager.test.js src/engine/Ship.test.js
npm run agent:check
```

## Risks
- Re-banding `generateMissionsForPlanet` must keep 3 procedural missions so existing generation tests
  hold (they assert count, not type).

## Notes
Bunks are tracked implicitly via active passenger missions — no separate passenger counter to persist.
