# SPEC-083 — Client-Side Entity Interpolation & Remote Ship Smoothing

## Description
Currently, local player movement is reconciled cleanly via the `Reconciler` client prediction loop, but remote ships (other players/NPCs) update immediately to the latest authoritative server snapshot position. Under network lag or 30Hz update intervals, this causes visible jitter. This specification introduces a client-side Entity Interpolator (P7/P8) to smoothly interpolate remote ships between their last two known coordinates.

1. **Entity Interpolator Logic:**
   - In `src/client/Interpolator.js`, implement a class `EntityInterpolator` caching rolling history buffers (timestamp + position/velocity/heading) for every active remote entity.
   - Interpolate positions linearly (LERP) and angles spherically (SLERP or angular LERP) behind the current server time by a tiny buffer delay (e.g. 100ms), ensuring smooth transitional rendering at 60fps.

2. **UI Integration:**
   - Wire this inside `src/client/CanvasRenderer.js` to draw remote entities at their smoothed, interpolated coordinates instead of their raw, snapped snapshot positions.

## Definition of Done (DoD)
- [ ] Implement `EntityInterpolator` in `src/client/Interpolator.js`.
- [ ] Wire remote ship coordinates rendering to use interpolated positions in `CanvasRenderer.js`.
- [ ] Write unit tests verifying that LERP/SLERP calculations accurately slide entities over timestamps.
- [ ] Gate check `npm run agent:check` passes completely green.
