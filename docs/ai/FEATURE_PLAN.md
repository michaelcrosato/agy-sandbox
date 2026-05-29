# Feature Plan — Easiest High-Value Wins (the "ultraplan")

**Purpose.** A curated backlog of the *easiest-to-implement, highest-value* features for
`Starfall: Living Galaxy`, derived by comparing the game's **actual current surface** (read from
`src/` 2026-05-28) against the staples of comparable space sims (Endless Sky, Escape Velocity,
Elite, EVE). Every item is filtered for: low effort, fits the **pure headless engine + Jest** model
(so it's deterministic and testable), and advances a `docs/GOAL.md` pillar / North Star.

This is the analysis; the ready-to-run implementation directive is at the bottom (**§ The
Implementation Goal**) and mirrored for `/goal`.

---

## What already exists (do NOT rebuild)

- **Trading economy:** 6 commodities, 8 planets/3 sectors, dynamic elasticity (`EconomyManager`),
  producer/consumer pulses + lane diffusion that age the market with no players (`GalaxyHeartbeat`,
  `ProductionModel`), persistence to disk (`PersistenceManager`).
- **Combat:** shields/armor/energy/heat/overheat, **disable-before-destroy** (`Ship.isDisabled`,
  armor floored to 30 standby), shield-pierce, ramming, afterburner; 4 weapon archetypes
  (KINETIC/ENERGY/BEAM/MISSILE); kill attribution via `entity.destroyedBy`.
- **Ships/outfits:** 6 hulls, 13 outfits with mass→handling tradeoffs.
- **Missions:** courier, smuggle, bounty, 3-stage storyline, + world-driven generative (delivery/hunt).
- **Mining:** **already live** — `gem_asteroid`/`generic` asteroids are shootable and
  `GameInstance.handleEntityDestroyed` drops scoopable `CargoPod`s (minerals/luxuries); `server.js`
  keeps ~35 asteroids spawned. (Enhancement only — see EW9.)
- **Other:** factions/reputation model (`FactionRegistry`, partially wired), utility-AI helper,
  fleets, nebulae, sector EMP/siege events, tractor beam, salvage, autopilot/warp gates, delta netcode.

## Genre staples Starfall is missing (the opportunity)

From the Endless Sky feature set (trading, **passengers**, **boarding/plunder**, **combat rating by
credit-value of ships destroyed**, **hyperdrive fuel**, repair/refuel at ports, hundreds of outfits):
Starfall lacks **passenger missions, boarding/plunder, a combat-rating/kill ledger, hyperfuel
economy, and port repair/refuel** — and the `hyperFuel` stat already exists but is **completely
unused**. These are the cheapest, most genre-defining gaps to close.

---

## The Easy-Win Backlog

| ID | Feature | Effort | Impact | Pillar | Primary files |
| --- | --- | --- | --- | --- | --- |
| EW1 | Combat rating + ship bounty value + kill ledger | S | High | P6/P3 | `Ship.js`, new `engine/CombatRating.js` |
| EW2 | Boarding & plunder of disabled ships | M | High | P6 | new `engine/Boarding.js`, `server.js` |
| EW3 | Hyperdrive fuel economy (activate `hyperFuel`) | M | High | P1/P7 | `Ship.js`, new `engine/Hyperdrive.js`, `server.js`, `Planet.js` |
| EW4 | Passenger missions (bunks) | S | Med | P4 | `MissionManager.js` |
| EW5 | Port services: repair & refuel | S | Med | P8/P1 | new `engine/PortServices.js`, `Planet.js`, `server.js` |
| EW6 | Jettison cargo | S | Med | P6 | `Ship.js`, `server.js` |
| EW7 | Content expansion (commodity, outfits, hull, 5th archetype) | S | Med | P2/P6 | `Planet.js`, `GameInstance.js`, `WeaponArchetypes.js`, `ProductionModel.js` |
| EW8 | Procedural NPC/ship name generator (seeded) | S | Low | P5/P8 | new `engine/NameGenerator.js` |
| EW9 | Mining depth (seeded yields, mining laser, ore) | S | Med | P2 | `GameInstance.js`, `Planet.js` |

Effort: **S** = one focused session; **M** = one larger session. All are pure-engine + unit-testable
except the thin server-wiring tails (verify those by booting `node src/server.js`).

---

### EW1 — Combat rating + ship bounty value + kill ledger
- **Why:** ES rates pilots by the **credit value of ships they disable/destroy** (logarithmic). Starfall
  already attributes kills (`destroyedBy`) but tracks nothing. Foundation for EW2 and richer bounties.
- **Approach:** give `Ship` a `bountyValue` (derived from hull/outfits or set on spawn). New pure
  `engine/CombatRating.js`: `combatRating(totalValue)` (monotonic, logarithmic) + `accrueKill(ledger, value)`.
  Track `kills`/`totalBounty` on the player session; increment in `handleEntityDestroyed` when `killerClient` resolves.
- **Tests:** rating is monotonic non-decreasing and logarithmic; accrual sums; zero-value safe.

### EW2 — Boarding & plunder of disabled ships
- **Why:** ES core loop — board a **disabled** hostile to plunder cargo/credits (or capture); board a
  friendly to repair. Starfall has the disabled state but no payoff, so disabling is a dead end.
- **Approach:** pure `engine/Boarding.js`: `canBoard(boarder, target)` (target `isDisabled`, boarder slow
  & adjacent), `plunder(boarder, target)` (transfer cargo up to boarder capacity + a credit fraction,
  mark `target.looted`), `boardRepair(boarder, target)` for friendlies. Wire a "board" action in `server.js`
  off the existing proximity/landing input.
- **Tests:** plunder respects cargo capacity, transfers credit fraction once (idempotent via `looted`),
  refuses non-disabled targets; friendly repair restores armor and grants no loot.

### EW3 — Hyperdrive fuel economy (activate the dead `hyperFuel` stat)
- **Why:** `Ship.hyperFuel`/`maxHyperFuel` exist but nothing consumes or refills them. ES gates jumps on
  fuel + a ramscoop that slowly regenerates it — instant depth from an existing field.
- **Approach:** pure `engine/Hyperdrive.js`: `canJump(ship, cost)`, `consumeJump(ship, cost)`,
  `ramscoopRegen(ship, dt, rate)`, `refuel(ship, units)`. Gate the warp/sector-jump handler in `server.js`
  on `canJump`; add a "Ramscoop" outfit (regen) and sell fuel at ports (ties to EW5).
- **Tests:** jump blocked under cost; consumes exactly on jump; refuel/ramscoop clamp at `maxHyperFuel`.

### EW4 — Passenger missions (bunks)
- **Why:** ES "carry passengers" is a whole income stream. Starfall has only cargo missions.
- **Approach:** add a `passenger` type to `MissionManager.generateMissionsForPlanet` (reserves N "bunks"
  = cargo-capacity units, no commodity); complete it in `checkArrivalCompletions` like `courier` but pay
  without `removeCargo`. Keep generation seedable where it touches the generative path.
- **Tests:** generation shape (origin/destination/bunks/reward), accept reserves capacity, arrival pays
  and frees bunks, over-capacity refused.

### EW5 — Port services: repair & refuel
- **Why:** Every port sim lets you repair hull and buy fuel. Starfall has trade/outfit/shipyard but no
  repair/refuel, so damage is only undone by death.
- **Approach:** pure `engine/PortServices.js`: `repairCost(ship, perPoint)`, `refuelCost(ship, perUnit)`,
  `applyRepair(ship, credits)`, `applyRefuel(ship, credits)` (charge, clamp to max, return change). Add
  `services` flags to `Planet`; wire spaceport handlers in `server.js`.
- **Tests:** cost ∝ damage/fuel deficit; applying restores and charges; insufficient credits is a no-op.

### EW6 — Jettison cargo
- **Why:** Dumping cargo to flee scans / free space is a staple; pairs with smuggling + EW2.
- **Approach:** `Ship` already has `removeCargo`. Add `jettison(commodity, amount)` returning pod specs;
  `server.js` spawns `CargoPod`s (reuse the asteroid-drop path).
- **Tests:** removes cargo, returns correct pod spec, guards amount/unknown commodity.

### EW7 — Content expansion (data-only depth)
- **Why:** ES has hundreds of outfits/ships; Starfall has a handful. Cheap variety + sets up EW2/3/9.
- **Approach (each a mini-slice):** add a commodity (e.g. `ore` or `medicine`) across `Ship.cargo`,
  `Planet.market` defaults, all 8 `BASE_MARKETS`, and `ProductionModel` profiles; add outfits
  (**Mining Laser**, **Ramscoop**, **Fuel Cells**); add a hull; add a **5th weapon archetype**
  (`FLAK`/`POINT_DEFENSE`) to `WeaponArchetypes`.
- **Tests:** table invariants (every commodity has a baseline on every planet; every outfit has positive
  mass; every archetype has all profile fields finite) — extend the existing `Planet`/`WeaponArchetypes` specs.

### EW8 — Procedural NPC/ship name generator (seeded)
- **Why:** Named pilots/ships make bounties (EW1) and encounters legible; ES names everything.
- **Approach:** pure `engine/NameGenerator.js` using a mulberry32 RNG (mirror `createSeededRng` in
  `GenerativeMissions.js`) — `pilotName(rng)`, `shipName(rng)` from syllable/word tables. No `Math.random`.
- **Tests:** deterministic for a seed; diverges across seeds; never empty.

### EW9 — Mining depth (enhance the existing loop)
- **Why:** Mining works but is `Math.random`-driven (untestable) and flat. Small upgrades add real depth.
- **Approach:** extract the asteroid→pod yield in `handleEntityDestroyed` into a pure seeded helper
  (`mineYield(asteroidType, rng, mineralPrice?)`); make a **Mining Laser** outfit boost yield; optionally
  introduce `ore` as the raw commodity that refines into minerals (ties to EW7 + P2 chains).
- **Tests:** deterministic yields per seed; mining-laser multiplier; gem vs. generic distribution.

---

## Suggested order (dependencies + easiest-first)

1. **EW1** (foundation: value + rating) → 2. **EW6** (trivial) → 3. **EW5** (ports) →
4. **EW4** (passengers) → 5. **EW8** (names) → 6. **EW7** (content, incremental) →
7. **EW3** (hyperfuel) → 8. **EW2** (boarding; uses EW1 value) → 9. **EW9** (mining depth).

## Deliberately OUT of "easiest" (ticket separately if desired)

- Ship **capture** (boarded → joins your fleet) — AI/ownership handoff is M/L.
- Contraband **interdiction/scan** AI behavior — needs new AI state (M).
- Client-side **trade-route planner / galaxy economy overlay** — UI, not headlessly testable.
- Interest-managed netcode, goal-driven NPC runtime swap — already pillar-tracked (P7/P5), larger.

---

## The Implementation Goal

Paste the block below into `/goal` to drive a session through this backlog. It runs the AGENTS.md loop
once per feature: ticket → pure+tested slice → green `npm run agent:check` → commit → `docs/LOG.md` entry,
substrate untouched, nothing pushed.

```text
Implement the EW1–EW9 backlog in docs/ai/FEATURE_PLAN.md — the easiest high-value features for
"Starfall: Living Galaxy". Ship REAL, tested code each iteration, not stubs or more planning.

Setup: highest-capability model, max effort/thinking. Read AGENTS.md FIRST, then docs/GOAL.md,
ROADMAP.md, docs/ai/REPO_MAP.md, and docs/ai/FEATURE_PLAN.md. Map before editing.

Autonomy: proceed without asking. Stop only for: a substrate edit (never do it), a push/merge/PR
(never unless explicitly told), a destructive or data-loss op, missing credentials/paid services, or
real legal/security ambiguity. Otherwise take the safest assumption, log it in docs/LOG.md, continue.

Hard rules:
- NEVER modify the write-protected substrate (AGENTS.md §0 / docs/AGENT-LOOP.md).
- Keep src/engine, src/physics, src/net, src/persistence PURE — no DOM, sockets, timers, or Math.random
  in test-reachable paths; seed/inject randomness (mirror createSeededRng in GenerativeMissions.js).
- Determinism: every test reproducible; no Math.random in assertions.
- No placeholders/TODOs/partial files.

The loop (one EW per iteration; lowest unblocked ID first, per FEATURE_PLAN.md "Suggested order"):
1. Pick the next EW. Create tickets/TICKETNNN.md (Status, Priority, Goal, Context, Scope in/out, Likely
   Files, Steps, Acceptance Criteria checkboxes, Commands, Risks, Notes).
2. Implement the smallest vertical slice: pure engine module + JSDoc first, then thin server/client wiring.
3. Write deterministic Jest tests beside the source for every behavior. The engine half MUST be fully
   covered; verify the server/client tail by booting `node src/server.js` (NODE_ENV=test disables the tunnel).
4. Gate: `npm run agent:check` (prettier --check + eslint + jest) MUST be green. Never weaken or bypass it.
5. On green: commit with Conventional Commits (feat/fix/test/docs), then prepend a compliant entry to
   docs/LOG.md (newest-first below == LOG-ANCHOR ==) and verify with `python scripts/validate-log-compliance.py`.
   No push, no merge — stay on the feature branch for human review.
6. Tick the ticket's acceptance boxes; file follow-ups; summarize; repeat for the next EW.

Per-feature acceptance = the Approach + Tests in each EW block of docs/ai/FEATURE_PLAN.md, notably:
- EW1: combat rating is monotonic + logarithmic; kills/bounty accrue from destroyedBy attribution.
- EW2: plunder respects boarder cargo capacity and transfers credits once (idempotent via a looted flag);
  boarding refused unless target.isDisabled; friendly board repairs and grants no loot.
- EW3: jump blocked when hyperFuel < cost; consumes exactly on jump; refuel + ramscoop clamp to maxHyperFuel.
- EW4: passenger missions reserve bunks (capacity), pay on arrival, free bunks; over-capacity refused.
- EW5: repair/refuel cost ∝ deficit; applying charges + clamps; insufficient credits is a no-op.
- EW6: jettison removes cargo and emits a CargoPod spec; guards amount/unknown commodity.
- EW7: after each content add, table invariants hold (every commodity has a baseline on every planet;
  every outfit mass > 0; every weapon archetype has all profile fields finite).
- EW8: seeded names are deterministic per seed, divergent across seeds, never empty.
- EW9: mine yields are deterministic per seed; mining-laser multiplier applies; gem vs generic differ.

Definition of done (whole goal): EW1–EW9 landed (or any deferred item ticketed WITH a reason), each behind
a green `npm run agent:check`, each with a docs/LOG.md entry; substrate untouched; no unexplained failures.
Honesty: never claim a check passed unless it actually ran and passed; record absent gates as "not found".

End with a summary: features landed (+ test counts), commands+results, tickets opened/closed, blockers,
and the single best next move.
```
