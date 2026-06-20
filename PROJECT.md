# Project: Cockpit Sound Effects Engine (Refactored)

## Architecture
- `src/client/audio/SoundEngine.js`: Headless Web Audio API synthesizer engine that manages continuous sound loops (thrusters), one-shot sound effects (lasers, impacts, warp jumps), spatial stereo panning (via `StereoPannerNode`), proximity volume decay, and repetitive alarm warnings.
- `src/main.js`: Integrates user controls, player updates, ship coords tracking, and warp events. Binds gesture triggers (`click`, `keydown`, `touchstart`) and registers audio toggle HUD button.
- `src/client/UIController.js`: Detects shield/armor hits and updates warning alarm loops dynamically.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Exploration & Audit | Analyze codebase, check test runner configurations and structure | none | DONE |
| 2 | Design Spec | Create spec detailing frequencies, durations, and modulation rules | M1 | DONE |
| 3 | Core Engine | Implement `SoundEngine.js` with spatial stereo panning and volume decay | M2 | DONE |
| 4 | Client Integration | Integrate `SoundEngine` and add golden-glassmorphic Audio Toggle button with localStorage persistence | M3 | DONE |
| 5 | Test Suite | Implement mock-based unit tests for SoundEngine and spatial panning | M4 | DONE |
| 6 | Forensic Audit | Verify gate passes (`npm run agent:check`) and run Forensic Auditor | M5 | DONE |

## Interface Contracts
### `SoundEngine`
- `constructor(options)`: Initializes context or schedules it to start on user interaction, loaded with initial muted state.
- `start()`: Instantiates the AudioContext and starts audio thread on user interaction.
- `stop()` / `dispose()`: Disconnects and cleans up all running nodes.
- `setListenerPosition(x, y)`: Updates listener coordinates for spatial panning.
- `setThrusterState(throttle, isBoosting)`: Adjusts continuous thruster frequency and rumble.
- `playWarpJump(position)`: Triggers warp sound.
- `playWeapon(type, position)`: Plays laser or plasma fire with spatial panning and decay.
- `playShieldImpact(position)`: Plays shield impact chime.
- `playArmorImpact(position)`: Plays armor low thud.
- `updateAlarms(alarmStates)`: Evaluates warning alert loops on tick updates.
- `mute()` / `unmute()`: Toggles the master gain node mute state.
- `setVolume(vol)`: Modulates master volume (0.0 to 1.0).
