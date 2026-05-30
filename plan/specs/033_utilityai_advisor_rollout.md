# 033 — UtilityAI advisor wider rollout + richer goal→action mapping

- **Phase:** 1 · **Priority:** P1 (sim depth; BACKLOG from spec 017) · **Blocked by:** none

## Description & Expected Impact
Spec 017 enabled the `useUtilityAdvisor` only at `GameInstance` merchant/guard/pirate spawns, and only the
**FLEE** goal overrides the role FSM. The remaining NPC spawns (`server.js` raider/boss ~566/909/947 +
escort ~1712, `main.js` single-player) are still pure FSMs, and ENGAGE/TRADE/REGROUP fall through to legacy
behaviour. **Impact:** every NPC "thinks", and goals map to distinct actions — a visibly smarter galaxy.

## Definition of Done & Acceptance Criteria
- [ ] All NPC spawn sites opt into the advisor (server boss/raider/escort + `main.js`), default-on for new
      spawns; the constructor default stays `false` so the 36+ legacy AIController tests are unchanged.
- [ ] At least two more goals map to real actions beyond FLEE: **REGROUP** → break off and recharge (retreat
      from threat without fully fleeing); **TRADE** → steer toward a profitable destination planet (a
      merchant with the advisor no longer just wanders when safe). Optionally **ENGAGE** → prefer the
      highest-`weakness` prey rather than the nearest target.
- [ ] Deterministic tests cover each new mapping (same agent, different world, different action);
      `npm run agent:check` green; `node src/server.js` boots and NPCs behave sanely.

## Implementation Approach
- Thread `{ useUtilityAdvisor: true, ... }` into the remaining `new AIController(...)` call sites.
- In `AIController.update`, extend the advisory block: map `Goals.REGROUP`/`Goals.TRADE`(/`ENGAGE`) to new
  `executeRegroup`/`executeTrade` helpers (or parameterize the existing FSM), keeping the legacy path when
  the flag is off. Reuse `buildPerception` opportunities (`trades`) for destination selection.

## Test Strategy
- **Unit:** advisor-on agent selects REGROUP when wounded-but-not-cornered and acts (retreat); selects
  TRADE near a safe planet and steers to it; legacy-path (flag off) tests remain byte-identical.
- **Manual:** boot; observe a merchant routing to a planet and a wounded ship recharging.
