# SPEC-084 — Emergency Distress Beacons & Emergent Rescue Caravans

## Description
Fuel persistence means players can occasionally run dry of `hyperFuel` in deep sector space. This specification implements a purchaseable "Emergency Distress Beacon" outfit (P3/P6/P5) allowing stranded players to broadcast a distress signal. Depending on the sector's local faction control and player standings, this triggers emergent NPC spawns: allied rescue/refuel caravans flying in to transfer fuel, or hostile pirates dropping in to plunder the disabled vessel.

1. **Distress Beacon Equipment & Spawning:**
   - Catalog the `Emergency Distress Beacon` outfit (type: `"utility"`, mass: 100kg, cost: 1,500 CR) in `outfitCatalog.js`.
   - Wire a socket listener `"distress_beacon"` on the server.
   - On activation, evaluate the player's standings with the local sector's controlling faction.
   - If standings are friendly/neutral (>= 0), spawn an NPC rescue caravan (a faction tanker ship) that navigates to the player and transfers fuel.
   - If standings are hostile (< 0) or in a pirate-dominated rim sector, trigger a pirate ambush spawn instead.

2. **Integration & Tests:**
   - Write integration tests verifying the distress trigger and checking that spawned NPC tanker vessels successfully execute FSM navigation towards the stranded flagship.

## Definition of Done (DoD)
- [ ] Catalog the Emergency Distress Beacon outfit in `outfitCatalog.js`.
- [ ] Implement `"distress_beacon"` WebSocket trigger and FSM spawning logic on the server.
- [ ] Write tests verifying standings-based allied refuel tanker vs hostile pirate spawns.
- [ ] Gate check `npm run agent:check` passes completely green.
