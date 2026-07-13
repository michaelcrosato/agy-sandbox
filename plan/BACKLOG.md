# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- Client-side input prediction/reconciliation: the unwired `Reconciler` prototype (spec 071) was
  removed in the 2026-07-12 overhaul; reintroduce it wired into `NetworkHandler` if input latency
  becomes a complaint (recover the code from git history).
- Structured logging: server modules mix emoji `console.log` lines with the JSON logger in
  `src/net/logger.js`; unify on the structured logger.
- Browser visual suite (`npm run test:client:browser`) is Windows-only (win32 golden screenshots)
  and not in CI; add Linux baselines if it should gate merges.

## Known limitations / deferred hardening (surfaced 2026-07-13 audit)

- **Send-path backpressure:** only the 30 Hz world-state broadcast checks
  `ws.bufferedAmount` (`src/net/backpressure.js`). The general `clientObj.send()` and
  `GameInstance.broadcast()` paths (chat, notifications, market_sync, roster/stats) do not, so a
  slow client can briefly grow its socket buffer between ticks. The world-state path still drops the
  client at the 4 MB hard limit within ~33 ms. Route all sends through a shared `bufferedAmount`
  guard if this becomes a memory concern under load.
- **AI perception cost:** `updateAILogic` → `AIController.update` runs `scanSensors(entities)` over
  the full entity list for every AI each tick (O(numAIs × entities)). Reuse the interest spatial
  grid (`src/net/interest.js`) for AI perception if AI-heavy sectors become a bottleneck.
- **`/metrics` is unauthenticated** (CORS `*`) and exposes operational/security telemetry. Gating it
  would break the browser dashboards that fetch it, so it is left open by design; put it behind a
  reverse proxy / firewall when exposing the server publicly. (Guest-controlled fields it surfaces
  are now HTML-escaped in the dashboards.)
- **No LICENSE:** `package.json` is marked `private`, but there is no license file. Add one if the
  project is ever distributed (a licensing decision for the owner).
- **Client `innerHTML` renders** of nicknames/room names in `src/main.js` rely on server-side input
  sanitization (CRITICAL_PROPS) rather than output escaping; add an `escapeHtml` pass for
  defense-in-depth.
