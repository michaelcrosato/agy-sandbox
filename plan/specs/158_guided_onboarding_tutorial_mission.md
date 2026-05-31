# SPEC-158: Guided Interactive Tutorial Mission & Flight-Deck Onboarding HUD Cards

## Summary

Build an interactable, multi-step guided interactive tutorial mission sequence that helps new players master essential gameplay mechanics: throttle controls, targeting lock-on, drone combat, salvage harvesting, and docking procedures. Present the tutorial steps in a gorgeous golden-glassmorphic HUD cockpit card with live progress tracking and telemetry indicators.

## Motivation

- Presentation and Game Feel (P8) is a top remaining product frontier. First-time players need a hands-on guided tutorial to understand how the simulation works in under 60 seconds without relying on external documents.
- Interactive feedback loops make the galaxy feel responsive, welcoming, and alive.

## Scope

**In:**

- Implement an interactive tutorial state machine tracking steps: `thrust_maneuver`, `lock_target`, `destroy_drone`, `collect_salvage`, `dock_at_port`.
- Spawn a dedicated tutorial room containing a training drone and a mock salvage pod when a player initiates the tutorial.
- Design a stunning golden-glassmorphic HUD onboarding cockpit card rendering step descriptions, active checkboxes, progress status bars, and floating tutorial arrows or alerts.
- Support step progression triggers: e.g. pressing thrust increases throttle to progress the first step, locking onto the drone entity progresses the second.
- Authored integration and unit tests in `src/server/tutorialHandlers.test.js` or `src/client/tutorialUI.test.js` verifying tutorial initialization, state progression, and cleanup.

**Out:**

- Do not alter core flight controls, physics ticks, or global multiplayer room instances; isolate the tutorial runs safely.

## Acceptance Criteria

- [ ] Interactive onboarding tutorial tracks multi-step progression states (thrust, lock, destroy, harvest, dock).
- [ ] Golden-glassmorphic HUD onboarding card renders current objectives and checkboxes in real-time.
- [ ] Completing the tutorial awards introductory credits and triggers a Galactic Chronicle welcome news log.
- [ ] Unit and integration tests verify the state machine progression and tutorial room setup.
