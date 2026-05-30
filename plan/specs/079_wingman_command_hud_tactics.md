# SPEC-079 — wingman intercept tactics and shield/armor HUD telemetry

## Description
This specification deepens player wingman escort tactics and HUD telemetry overlays (P6). It introduces dedicated keyboard keys allowing players to order active wingmen to intercept the primary flagship target, and renders miniature status panels on the client cockpit HUD showing active wingman shields, armor, and current targets.

1. **Wingman Intercept Command:**
   - Wire WebSocket message triggers and AIController FSM states to order active escorts to break off and intercept the player's locked target.
   
2. **Wingman HUD Telemetry:**
   - Modify the client-side HUD status overlay to render mini-cards for each active assigned wingman, reporting their ship names, shield and armor integrity bars, and current targets.

## Definition of Done (DoD)
- [ ] Implement target intercept commands and FSM transitions for wingmen.
- [ ] Render miniature wingman status/vitals panels on the client cockpit HUD.
- [ ] Add unit tests verifying target lock-on and intercept FSM transitions.
- [ ] Gate check `npm run agent:check` passes completely green.
