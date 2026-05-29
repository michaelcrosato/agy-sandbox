# System Blueprint & Target Specification

## Lifecycle State Machine
- **CURRENT_STATE:** ACTIVE_SPECIFICATION  # [BOOTSTRAP | ACTIVE_SPECIFICATION]
- **TARGET_INFRASTRUCTURE:** Multi-Agent Scale-Out (Sequential/Concurrent Execution)
- **PRODUCT:** `Starfall: Living Galaxy` — a persistent, browser-native, multiplayer space sim where the world keeps living whether or not you are watching.

---

## Role & Persona (ACTIVE_SPECIFICATION State)
You are the lead engine architect for `Starfall`. The blueprint below is your high-level intent and structural constraint. Each loop tick you select and ship the **single highest-leverage increment** toward the North Star without breaking the validation gate. Real repo state outranks this document; when they conflict, fix the code and amend the relevant section here. When `CURRENT_STATE` is `ACTIVE_SPECIFICATION`, skip the BOOTSTRAP discovery interview.

---

===============================================================================
## ESTABLISHED BLUEPRINT

### North Star
Build a galaxy that is **alive without you**. A player should be able to log off, return a day later, and find that prices shifted because a war disrupted a trade lane, a faction they wronged now hunts their old haunts, a pirate clan grew bold in a system the navy abandoned, and a contract they ignored was completed by someone else. Not scripted events on a timer — **consequences of a simulation that never stopped running.**

The bar: a stranger opens a browser tab, and within sixty seconds is flying; within ten minutes is making a choice that the world remembers.

### Design Tenets
1. **Simulation over scripting.** Prefer systems that produce stories to stories hand-authored into the code. Emergence is the product.
2. **Every action leaves a mark.** Trades move prices, kills shift reputations, presence changes spawns. No inert verbs.
3. **Legible depth.** Deep systems, surfaced clearly. The player should always understand *why* the galaxy reacted.
4. **The server dreams.** World simulation advances on the server independent of any connected client; players are observers and participants, never the clock.
5. **Headless, testable core.** All simulation logic stays pure and unit-tested — no DOM, no sockets in the engine. If it matters, it has a test.

### Invariants (never violated)
1. **Main stays green.** Every landed increment keeps `npm test` and `npm run lint` clean. No skipped tests, no weakened gate.
2. **Determinism in tests.** Randomness is seeded or injected so every test is reproducible; no `Math.random` leaking into assertions.
3. **Substrate is sacred.** Never modify the write-protected control-plane files listed in `docs/AGENT-LOOP.md`.
4. **Authoritative server.** The server is the single source of truth; the client renders and predicts, it never decides.
5. **Preserve every attempt.** Failed work is archived per the Axioms before rollback.
6. **Small, shippable moves.** A vertical slice that lands green today beats a grand refactor that sits broken.

### Baseline (delivered — verify before trusting)
- 30Hz authoritative multi-room WebSocket server; canvas client; multi-sector galaxy with warp gates and autopilot.
- Simulation engine: `SpaceEngine` (spatial-grid broad-phase, elastic collisions, **ramming impact damage**), `Ship`, `Projectile` (**shield-piercing damage type**), `Planet`, `CargoPod`.
- **Combat & survival depth:** energy/heat/overheat, disable-before-destroy, **post-hit shield-regen combat lockout**, **afterburner boost** (Shift), shield-pierce weapons (`Ion Disruptor Array`).
- `EconomyManager`: dynamic markets with price elasticity, shortage/surplus events, normalization drift.
- **`GalaxyHeartbeat` (P1 delivered):** a headless, deterministic pulse that ages the economy with zero players connected — prices diffuse along sector trade lanes (cornering a commodity in one system measurably ripples to its neighbors) and drift toward baseline. Runs server-side on a slow interval across all rooms.
- `MissionManager`: missions, bounties, multi-stage storyline.
- `AIController`: merchant / guard / pirate / escort behaviours (FSM).
- Outfitting (12 modules) and shipyard (6 hulls); fleets; nebula hazards; tractor beam; salvage.
- ~228 passing Jest tests; ESLint clean.
- **Frontier gaps:** state is in-memory (lost on restart — the next P1 slice); combat/physics still only simulate where players are (the economy now ages globally via the heartbeat); full world-state is broadcast every tick (no deltas); NPCs are role-FSMs, not goal-driven agents; the economy has no production chains.

### The Deep Systems (pillars)
Work the lowest-numbered pillar with unblocked work; within it, ship the smallest slice that lands green and visibly advances the North Star. Each pillar lists its **depth** (what makes it deep) and **DoD** (a concrete, testable proof it is real).

**P1 — Persistent Living Universe** *(the foundation the North Star stands on — IN PROGRESS)*
- *Depth:* A save/load layer (interface first, JSON-on-disk to start, DB-swappable) persisting players (ship, credits, cargo, outfits, reputation, missions) and galaxy state (markets, faction standings, active conflicts). A background "galaxy heartbeat" advances economy and faction simulation on a slow tick even with zero players online, so the world ages.
- *Delivered:* `GalaxyHeartbeat` — economy ages and price shocks diffuse across trade lanes with no players, deterministic and unit-tested.
- *Remaining:* persistence to disk behind a swappable store interface; restore player + galaxy (incl. heartbeat-aged markets) on restart/login; extend the heartbeat to drive faction standings once P3 lands.
- *DoD:* Kill the server, restart, log back in → player and market state restored. Run the heartbeat headless for N simulated ticks → prices (and later standings) provably drift. All covered by deterministic tests.

**P2 — Emergent Economy**
- *Depth:* Commodities flow through production chains (raw → refined → manufactured); planets produce and consume based on type; scarcity and surplus propagate along trade lanes; player bulk trades visibly move local prices; contraband and smuggling carry risk/reward against faction patrols.
- *DoD:* A simulated supply shock in one system measurably raises prices in connected systems over time; a large player sale depresses local price; tests assert the propagation and elasticity math.

**P3 — Faction & Reputation Web**
- *Depth:* Multiple factions with standing per player and pairwise relations (allies/enemies). Standing governs how NPCs treat you (hails, aggression, docking rights, prices), shifts from your actions (kills, trades, missions), and decays/propagates (helping faction A angers its enemy B). Territory control determines spawn tables and patrol strength.
- *DoD:* A scripted sequence of player actions moves a standing value that then **demonstrably changes NPC behaviour and prices**; covered by tests on the reputation model.

**P4 — Generative Missions & Narrative**
- *Depth:* A mission generator that composes objectives from world state (real shortages → delivery contracts; real bounties → hunt missions; real conflicts → combat ops) with stakes, rewards, and faction consequences — so missions are *about* the living galaxy, not flavor text. Branching multi-stage arcs that react to outcomes.
- *DoD:* Generated missions reference actual current world state and, on completion, mutate it (economy/reputation); generation is seeded and tested for shape, solvability, and consequence.

**P5 — Intelligent NPCs (Goal-Driven Agents)**
- *Depth:* Replace role-FSMs with utility/goal-driven agents that own persistent goals (profit, survival, territory, vengeance), perceive the world, and plan (trade routes, hunting, fleeing, regrouping). Pirates that learn where the money flows; merchants that reroute around danger; navies that respond to incursions.
- *DoD:* An agent demonstrably changes its plan when the world changes (a new threat reroutes a merchant; a rich lane attracts pirates); decision logic is pure and unit-tested.

**P6 — Ship Identity & Fleet Command**
- *Depth:* Outfits with real tradeoffs (mass → handling, energy/heat budgets), distinct hull roles, weapon archetypes (kinetic/energy/missile/beam) on one damage model, and player fleets you command in formation and combat.
- *DoD:* Build choices produce measurably different simulated performance; a commanded wingman executes a formation/attack order; combat and loadout math fully tested.

**P7 — Netcode & Scale** *(carries the rest at player count)*
- *Depth:* Delta/interest-managed state sync (see `night-queue` M0 tasks), client interpolation + server reconciliation, instrumentation, and grid-accelerated server-side hot loops.
- *DoD:* A 50-entity room with 8 simulated clients holds 30Hz at materially lower bandwidth than full-state; reconnection is seamless; encoder and interpolator are unit-tested.

**P8 — Presentation & Game Feel**
- *Depth:* Readable HUD/minimap, weapon/thruster/damage feedback, audio, and a sixty-second onboarding flow; touch/mobile input.
- *DoD:* A first-time player can fly, fight, trade, and dock without external instructions.

### Showcase Moments (what "impressive" looks like)
These are the demos that prove the North Star — steer increments toward making them real:
- **"The world moved."** Log off, run the heartbeat, log back in → markets and faction lines have shifted from causes you can name.
- **"It remembers."** Wrong a faction, fly away, return → its patrols are now hostile in its territory.
- **"The economy is real."** Corner a commodity; watch the price you set ripple to neighboring systems and spawn a delivery mission for someone else.
- **"They think."** A pirate clan abandons a picked-clean lane and migrates to where your trades created new wealth.

### How to Pick the Next Move (per loop tick)
1. Re-read the Axioms; confirm no substrate mutation is planned.
2. Reconcile this blueprint against real repo state (`git`, tests, `src/`, `night-queue/`).
3. Choose the lowest-numbered pillar with unfinished, unblocked work; within it, the smallest slice that lands green and visibly advances the North Star or a Showcase Moment.
4. Implement + test, force the validation gate; on green, commit and log the truth per `docs/LOG.md` rules.
5. If blocked or red: archive, roll back to last green, log the pivot, pick a different slice.
