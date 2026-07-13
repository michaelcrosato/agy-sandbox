# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- Client-side input prediction/reconciliation: the unwired `Reconciler` prototype (spec 071) was
  removed in the 2026-07-12 overhaul; reintroduce it wired into `NetworkHandler` if input latency
  becomes a complaint (recover the code from git history).
- Structured logging: server modules mix emoji `console.log` lines with the JSON logger in
  `src/net/logger.ts`; unify on the structured logger.
- Browser visual suite (`npm run test:client:browser`) is Windows-only (win32 golden screenshots)
  and not in CI; add Linux baselines if it should gate merges.

## TypeScript migration follow-ups (surfaced during the TS migration)

The migration converted all of `src/**` to `.ts` and moved the build to `tsc` (emit to `dist/`),
type-checking the server-side graph at `strict: false`. Remaining work to tighten the type surface:

- **Tighten types.** Enable `strict` in `tsconfig.json`, remove the `// @ts-nocheck` headers on the
  browser client (`src/client/**`, `src/main.ts`), and fix the ~1982 client DOM / dynamic-property
  errors that surface once it joins the checked graph. In parallel, replace the placeholder
  `declare`d `any` fields on the server-side engine classes with real types (the untyped
  `{...parentParams}` configs were the reason the stateful engine classes were deferred from the
  `checkJs` gate). Ratchet `noImplicitAny` back on once the surface is filled in.
- **Evaluate TypeScript 7.** The Go-based `tsc` (TypeScript 7 / "native") promises large typecheck +
  build speedups; evaluate it for the gate once it is stable and its flags match the current config.
- **Project-reference split (optional).** Split the build into project references so `engine`/`net`/
  `physics`/`persistence` compile against a Node/DOM-free lib set — making the purity boundary a
  compiler guarantee (no accidental DOM globals) rather than a convention.
- **Bundle the client (optional).** The browser currently loads ~50 individual `dist/**/*.js`
  modules. If that request count becomes a load-time concern, add an `esbuild` (or similar) bundle
  step for the client entry (`dist/main.js`) while keeping `tsc` as the type/emit source of truth.

## Known limitations / deferred hardening (surfaced 2026-07-13 audit)

- **Send-path backpressure:** only the 30 Hz world-state broadcast checks
  `ws.bufferedAmount` (`src/net/backpressure.ts`). The general `clientObj.send()` and
  `GameInstance.broadcast()` paths (chat, notifications, market_sync, roster/stats) do not, so a
  slow client can briefly grow its socket buffer between ticks. The world-state path still drops the
  client at the 4 MB hard limit within ~33 ms. Route all sends through a shared `bufferedAmount`
  guard if this becomes a memory concern under load.
- **AI perception cost:** `updateAILogic` → `AIController.update` runs `scanSensors(entities)` over
  the full entity list for every AI each tick (O(numAIs × entities)). Reuse the interest spatial
  grid (`src/net/interest.ts`) for AI perception if AI-heavy sectors become a bottleneck.
- **`/metrics` is unauthenticated** (CORS `*`) and exposes operational/security telemetry. Gating it
  would break the browser dashboards that fetch it, so it is left open by design; put it behind a
  reverse proxy / firewall when exposing the server publicly. (Guest-controlled fields it surfaces
  are now HTML-escaped in the dashboards.)
- **No LICENSE:** `package.json` is marked `private`, but there is no license file. Add one if the
  project is ever distributed (a licensing decision for the owner).
- **Client `innerHTML` renders** of nicknames/room names in `src/main.ts` rely on server-side input
  sanitization (CRITICAL_PROPS) rather than output escaping; add an `escapeHtml` pass for
  defense-in-depth.
