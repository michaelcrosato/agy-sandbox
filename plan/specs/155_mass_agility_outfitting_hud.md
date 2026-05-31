# SPEC-155: Outfitting Fitting Preset Mass-Agility Dynamics HUD Card

## Summary

Build a premium outfitting visual feedback panel that dynamically calculates and renders how ship outfitting mass, active weapons weight, and power-grid footprints impact ship agility (thrust-to-mass ratios, maximum velocity limits, turn rates, and hyperdrive charging durations). Extend the outfitter logic inside `src/engine/LoadoutManager.js` to strictly enforce total outfitting chassis mass limits and expose outfitting metrics under dynamic WebSocket and HTTP APIs.

## Motivation

- Ship customizability must convey clear, legible physical trade-offs in ship handling to complete the fittings presets architecture.
- Real-time agility visual HUD meters provide feedback that enriches the outfitting gameplay loop.

## Scope

**In:**

- Extend `LoadoutManager.js` to calculate total ship weight based on active outfit setups (chassis, shields, engines, lasers, mining lasers, cargo pods).
- Implement dynamic physical agility scaling inside `Ship.js` (thrust agility, turning velocity, and hyperdrive power consumption depend directly on ship outfitting mass ratios).
- Design a gold-glassmorphic status panel inside the outfitter UI showing current cargo capacity vs. chassis mass limits, thrust ratios, and agility indicators.
- Enforce strict chassis mass limit validation on preset outfitting transactions.

**Out:**

- Do not rewrite core collision physics; mass affects agility and hyperdrive calculations, keeping collision kinematics based on existing Vector2D and kinetic damage models.

## Acceptance Criteria

- [ ] `LoadoutManager.js` computes total ship and outfitting component masses dynamically.
- [ ] Ship agility parameters scale programmatically on the server in relation to outfitting mass ratios.
- [ ] Outfitting UI renders circular golden agility rings and chassis mass bars.
- [ ] Jest unit tests verify mass outfitting limits, calculations, and agility impacts.
