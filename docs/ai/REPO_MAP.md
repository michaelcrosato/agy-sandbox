# Repo Map (for agents)

Where things live, what to read, and what to skip. Pair this with `git ls-files` (which already
excludes `node_modules/`) and `.aiignore`. Full operating rules: `../../AGENTS.md`.

## Entry points

| What | File | Notes |
| --- | --- | --- |
| **Game server** (authoritative) | `src/server.js` | Node `ws` + static HTTP on `:8080`. ~1900 lines, **not unit-tested**, organized by lettered section headers (e.g. "J. Authoritative World State Broadcast"). Read the section you need. |
| **Browser client** bootstrap | `src/main.js` | Loaded by `index.html`; wires engine + `src/client/*`. Not unit-tested. |
| **Page shell** | `index.html`, `index.css` | DOM/HUD the client renders into. |
| `package.json` `main` | `src/index.js` | ⚠️ A demo stub (`add`/`subtract`/`greet`) — **not** a real entry point. Don't be misled. |

## Core product logic — `src/` (this is what you improve)

| Area | Path | Pure? | Tested? |
| --- | --- | --- | --- |
| Physics primitive | `src/physics/Vector2D.js` | yes | yes |
| Physics base entity | `src/engine/SpaceEntity.js` | yes | yes |
| Physics orchestrator | `src/engine/SpaceEngine.js` | yes | yes (incl. `_SpatialGrid`) |
| Per-room world | `src/engine/GameInstance.js` | yes | yes — **owns `BASE_MARKETS`** + seeded galaxy |
| Player-independent economy pulse | `src/engine/GalaxyHeartbeat.js` | yes | yes |
| Dynamic markets | `src/engine/EconomyManager.js` | yes | yes |
| Production chains | `src/engine/ProductionModel.js` | yes | yes |
| Missions / bounties / storyline | `src/engine/MissionManager.js` | yes | yes |
| Generative missions (seeded) | `src/engine/GenerativeMissions.js` | yes | yes |
| Factions & reputation | `src/engine/FactionRegistry.js` | yes | yes |
| Weapon archetypes | `src/engine/WeaponArchetypes.js` | yes | yes |
| Entities | `src/engine/{Ship,Projectile,Planet,CargoPod,Nebulae}.js` | yes | yes |
| AI (FSM + utility) | `src/engine/ai/{AIController,UtilityAI}.js` | yes | yes |
| Netcode codecs | `src/net/{StateCodec,BroadcastFramer}.js` | yes | yes |
| Persistence | `src/persistence/{Store,serializers,PersistenceManager}.js` | yes | yes |
| Client (render/input/net/UI) | `src/client/*.js` | **no** (DOM/canvas) | **no** — can't be headlessly unit-tested |

Rule of thumb: anything under `engine/`, `physics/`, `net/`, `persistence/` is pure and **must** stay
that way (no DOM, sockets, timers, or `Math.random` in test-reachable paths). Tests sit beside source
as `*.test.js`.

## Config & tooling

- `package.json` — scripts (`test`, `lint`, `format`, `format:check`, `agent:bootstrap`, `agent:check`), deps.
- `eslint.config.js` — flat config; `no-unused-vars: warn`; globals node+jest+browser.
- `.github/workflows/ci.yml` — the gate of record: prettier **--check** → eslint → jest on push/PR to `main`.
- `scripts/agent/*.{sh,ps1}` — agent-facing wrappers; `check` mirrors CI exactly.
- `.env.example` — runtime/automation env vars (copy to `.env`, which is gitignored).

## Governance / substrate (read; never modify the substrate set)

- `docs/AXIOMS.md`, `docs/AGENT-LOOP.md` — constitution + loop protocol (**substrate, read-only**).
- `docs/GOAL.md` — product blueprint (writable; the North Star and pillars P1–P8).
- `docs/LOG.md` — append-only ledger, newest-first.
- `.github/AGENT_RULES.md` — coding standards + git workflow (writable).
- `scripts/{assert-gate-integrity,local-gate,run-autonomous-loop}.ps1`, `scripts/validate-log-compliance.py`,
  `scripts/manifest.txt` — **substrate, read-only**.
- `scripts/{claude-night.ps1, run-agent.js}` — autonomous launchers (writable, not substrate).

## Skip (don't read into context)

`node_modules/`, `.git/`, `package-lock.json`, `coverage/`, `data/` (runtime saves, gitignored),
`night-queue/` (local task queue, gitignored), `.claude/`. See `.aiignore`.
