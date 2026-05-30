# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- **Tractor outfit mass (noticed during spec 020):** `engine/Outfitting.applyOutfitStats` only adds an
  outfit's `mass` for a *matched* stat type, so the stat-less `tractor` type (Tractor Beam Matrix, 200 kg)
  no longer contributes hull mass on buy/salvage. This was an incidental behaviour change when spec 007
  extracted the inline `outfit_buy` switch (the original applied mass unconditionally). Buy and salvage are
  now *consistent* (both skip it), so it's not a correctness regression between paths — but if tractor
  *should* add mass, add `case "tractor": break;` to `applyOutfitStats` (so `applied` is true and the mass
  branch runs) and add a regression test. Low priority.

- **Hit-flash kind is always "shield" — armor branch is dead (found by spec 021):**
  `client/UIController._updateCombatFeedback` only enters its hit branch when
  `currentTotal < this._lastShieldTotal - 0.5`, then computes
  `shieldDropped = player.shield < this._lastShieldTotal - player.armor - 0.5`. That inequality is
  algebraically the *same* condition (`shield + armor < _lastShieldTotal - 0.5`), so `shieldDropped` is
  always true inside the branch and `_hitFlashKind` is never `"armor"` — armor hits flash the blue
  shield-hit vignette instead of red. Root cause: only the *combined* shield+armor total is remembered
  between frames, so a shield-vs-armor split can't be recovered. Fix: store the previous `shield` (and/or
  `armor`) separately and classify off the actual per-pool delta, then assert the `"armor"` path in
  `UIController.test.js` (the test currently avoids pinning the kind for armor hits). Low priority (cosmetic
  feedback only), but it's a clear logic bug a future combat-feel pass should clean up.

- **Typecheck rollout to the engine (from spec 024):** the `checkJs` gate (`tsc --noEmit`) currently
  covers the import-isolated `src/net/**`, `src/physics/**`, `src/server/**` (green, in `agent:check` + CI).
  Extending it to `src/engine`/`src/persistence` needs JSDoc work on the stateful classes (~70 findings):
  GameInstance/Ship/Planet have untyped `{...parentParams}` constructor configs (TS rejects extra fields —
  give the config param `@param {Object}` or per-field `@typedef`s); SpaceEngine/MissionManager/Economy
  reference `{SpaceEntity}`/`{Ship}`/`{Planet}` in JSDoc without importing the type (use
  `{import("./X.js").X}`); FactionRegistry/Boarding init `{}` then index it (annotate
  `@type {Record<string, number>}`); GenerativeMissions/PersistenceManager have `{}`-vs-required-field call
  sites. Ratchet up dir-by-dir by widening `tsconfig.json` `include`, fixing JSDoc — never `@ts-nocheck`.

- **Widen the UtilityAI advisor rollout + goal→action mapping (from spec 017):** the `useUtilityAdvisor`
  flag is enabled only at the `GameInstance` merchant/guard/pirate spawns, and only the FLEE goal currently
  overrides the role FSM (with an evade). Two follow-ups: (1) opt the remaining NPC spawns in —
  `server.js` raider/boss (≈566/909/947) and escort (≈1712), and `main.js` single-player spawns — so every
  agent gets the advisory layer; (2) map the other goals to richer actions instead of falling through to
  the legacy FSM: REGROUP→break-off-and-recharge, TRADE→pick a profitable destination planet (today a
  merchant with the advisor still wanders when not fleeing), ENGAGE→prefer the highest-`weakness` prey
  rather than the nearest target. Also consider feeding live market spreads into `buildPerception`'s
  `tradeProfit` (currently a flat 0.6) and `factionPolicy` into `isThreat` once spec 016 lands. Medium
  priority — the FLEE slice already delivers the GOAL P5 "changes its plan" showcase.

- **Mission/trade-driven faction standings (from spec 016):** spec 016 wired standing changes on *kills*
  (`GameInstance.handleEntityDestroyed` → `adjustStanding`), plus faction pricing and hostile-docking
  refusal. The DoD also lists *missions* and *trades* adjusting standings. Trades are unwired (a small
  reputation bump for trading at a faction's port would be easy in the `server.js` trade handler). Missions
  are blocked on a deeper gap: `MissionManager.completeGeneratedMission` already computes a `factionChanges`
  array, but **nothing in `server.js` calls `completeGeneratedMission`** — the generated-mission consequence
  pipeline isn't connected to the live server yet (the land handler uses `checkArrivalCompletions`). Wiring
  missions means first connecting that pipeline, then feeding `factionChanges` into
  `room.factionRegistry.adjustStanding`. Also: `decayAll` (reputation healing over time) isn't called from
  the galaxy heartbeat yet — hook it for slow reputation recovery. Medium priority.
