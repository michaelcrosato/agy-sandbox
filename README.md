# Starfall: Living Galaxy

A browser-native multiplayer space-trading and combat game built inside an autonomous-engineering sandbox.

There are two layers:

- **The game:** an authoritative Node/WebSocket server simulates a persistent galaxy; a Canvas client lets players fly, fight, trade, dock, and take missions in a shared world.
- **The harness:** a principle-governed autonomous loop uses specs, deterministic gates, and an operational ledger to keep improving the repo.

North Star: **a galaxy that is alive without you** — markets, factions, NPCs, missions, and consequences continue to evolve server-side. See [`docs/GOAL.md`](docs/GOAL.md).

---

## Quick start

```powershell
npm install
node src/server.js
```

Open **http://localhost:8080** in a modern browser.

> `npm run dev` only serves static files. It does not run the authoritative simulation or multiplayer server.

### Play with friends

Keep `node src/server.js` running and expose it with a tunnel, for example:

```bash
cloudflared tunnel --url http://localhost:8080
```

Send the generated `https://…trycloudflare.com` URL. Other players need only a browser.

### Controls

| Action      | Keys              |
| ----------- | ----------------- |
| Thrust      | `W` / `↑`         |
| Brake       | `S` / `↓`         |
| Turn        | `A` `D` / `←` `→` |
| Fire        | `Space`           |
| Afterburner | `Shift`           |

Approach a planet slowly to land, then use the spaceport UI to trade, outfit, buy ships, and take missions.

---

## Validation

```powershell
npm run agent:check          # full gate: substrate integrity + format + lint + typecheck + Jest + client tests
npm run agent:check:core     # faster inner-loop gate, excludes client tests
npm test                     # Jest suite
npm run test:client          # Vitest client suite
npm run lint
npm run typecheck
npm run format:check
```

Do not claim a change is green unless the relevant command actually ran and passed.

---

## Canonical docs

| File                                         | Purpose                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                     | Canonical operating manual for agents and humans. Read first. |
| [`docs/AXIOMS.md`](docs/AXIOMS.md)           | Immutable constitution; substrate, read-only.                 |
| [`docs/AGENT-LOOP.md`](docs/AGENT-LOOP.md)   | Compliance protocol; substrate, read-only.                    |
| [`docs/GOAL.md`](docs/GOAL.md)               | Product blueprint and architecture intent.                    |
| [`plan/PROGRESS.md`](plan/PROGRESS.md)       | Live work queue and resume anchor.                            |
| [`plan/specs/`](plan/specs/)                 | Atomic implementation specs.                                  |
| [`docs/ai/REPO_MAP.md`](docs/ai/REPO_MAP.md) | Repo navigation map for agents.                               |
| [`docs/LOG.md`](docs/LOG.md)                 | Reverse-chronological operational ledger.                     |

`tickets/` is legacy history unless a launch context explicitly says otherwise. The live queue is `plan/PROGRESS.md` plus `plan/specs/`.

---

## Repository layout

```text
├── AGENTS.md                 <- canonical agent/human operating manual
├── docs/
│   ├── AXIOMS.md             <- substrate constitution
│   ├── AGENT-LOOP.md         <- substrate compliance protocol
│   ├── GOAL.md               <- product blueprint
│   ├── LOG.md                <- operational ledger
│   └── ai/REPO_MAP.md        <- agent repo map
├── plan/
│   ├── GOAL_PROMPT.md        <- unattended loop prompt
│   ├── PROGRESS.md           <- live queue / resume anchor
│   ├── ROADMAP.md            <- current wave plan
│   └── specs/                <- atomic specs
├── scripts/
│   ├── agent/                <- cross-platform agent helpers and gates
│   ├── run-agent.js          <- GitHub issue-triggered agent
│   ├── run-afk-loop.*        <- local unattended loop launchers
│   └── claude-night.ps1      <- overnight task queue runner
├── src/
│   ├── server.js             <- authoritative server composition root
│   ├── server/               <- extracted server modules
│   ├── engine/               <- pure simulation modules
│   ├── physics/              <- pure physics primitives
│   ├── net/                  <- protocol, routing, interest, metrics
│   ├── persistence/          <- store/persistence abstractions
│   └── client/               <- browser client logic
└── index.html, index.css
```

---

## Rules of engagement

- Never modify substrate files listed in `AGENTS.md §0`.
- Keep main green.
- Keep simulation logic deterministic and testable.
- Prefer small vertical slices over broad rewrites.
- Update the spec/progress/log truthfully when work changes reality.
