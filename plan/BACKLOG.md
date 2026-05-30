# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- **Tractor outfit mass (noticed during spec 020):** `engine/Outfitting.applyOutfitStats` only adds an
  outfit's `mass` for a *matched* stat type, so the stat-less `tractor` type (Tractor Beam Matrix, 200 kg)
  no longer contributes hull mass on buy/salvage. This was an incidental behaviour change when spec 007
  extracted the inline `outfit_buy` switch (the original applied mass unconditionally). Buy and salvage are
  now *consistent* (both skip it), so it's not a correctness regression between paths — but if tractor
  *should* add mass, add `case "tractor": break;` to `applyOutfitStats` (so `applied` is true and the mass
  branch runs) and add a regression test. Low priority.

- **Typecheck rollout to the engine (from spec 024):** the `checkJs` gate (`tsc --noEmit`) currently
  covers the import-isolated `src/net/**`, `src/physics/**`, `src/server/**` (green, in `agent:check` + CI).
  Extending it to `src/engine`/`src/persistence` needs JSDoc work on the stateful classes (~70 findings):
  GameInstance/Ship/Planet have untyped `{...parentParams}` constructor configs (TS rejects extra fields —
  give the config param `@param {Object}` or per-field `@typedef`s); SpaceEngine/MissionManager/Economy
  reference `{SpaceEntity}`/`{Ship}`/`{Planet}` in JSDoc without importing the type (use
  `{import("./X.js").X}`); FactionRegistry/Boarding init `{}` then index it (annotate
  `@type {Record<string, number>}`); GenerativeMissions/PersistenceManager have `{}`-vs-required-field call
  sites. Ratchet up dir-by-dir by widening `tsconfig.json` `include`, fixing JSDoc — never `@ts-nocheck`.
