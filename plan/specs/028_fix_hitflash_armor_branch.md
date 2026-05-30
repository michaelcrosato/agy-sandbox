# 028 — Fix the hit-flash armor-branch dead code (real bug)

- **Phase:** 0 · **Priority:** P0 (correctness; found by spec 021's tests) · **Blocked by:** none

## Description & Expected Impact
`client/UIController._updateCombatFeedback` enters its hit branch only when
`currentTotal < this._lastShieldTotal - 0.5`, then computes
`shieldDropped = player.shield < this._lastShieldTotal - player.armor - 0.5` — which is **algebraically the
same condition**, so `shieldDropped` is always true inside the branch and `_hitFlashKind` is **never
`"armor"`**. Result: armor hits flash the **blue shield** vignette instead of red. Root cause: only the
*combined* shield+armor total is remembered between frames. **Impact:** correct combat-feel feedback
(red = armor, blue = shield) and the activation of dead UI code.

## Definition of Done & Acceptance Criteria
- [ ] Track the previous **shield** (and/or armor) separately so classification keys on the actual
      per-pool delta: a shield drop → `_hitFlashKind === "shield"`; an armor-only drop → `"armor"`.
- [ ] `src/client/__tests__/UIController.test.js` asserts BOTH kinds: a shield-only hit flashes `"shield"`
      (+ `shield-hit` class) and an armor-only hit flashes `"armor"` (no `shield-hit` class). Update the
      existing "armor-hit detection" test that currently avoids pinning the kind.
- [ ] `npm run test:client` green; `npm run agent:check` unaffected (client dir is Jest-ignored).

## Implementation Approach
- In `_updateCombatFeedback`, add `this._lastShield` (init `null` in the constructor); set
  `shieldDropped = (player.shield || 0) < this._lastShield - 0.5` using the prior frame's shield; keep the
  combined-total check as the hit trigger. Update `this._lastShield` each frame alongside `_lastShieldTotal`.
- Remove the now-correct BACKLOG note for this item.

## Test Strategy
- **Unit (Vitest+jsdom):** shield drop (armor constant) → `"shield"`; armor drop (shield full AND shield
  already 0) → `"armor"`; no-hit frame clears the flash. Deterministic (dt-independent transitions).
