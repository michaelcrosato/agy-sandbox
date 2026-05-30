# SPEC-058 — Outfitting Fittings Shop & Loadout Presets

## Description
This spec upgrades starship outfitting to support **discrete fitting slots (Weapons, Shields, Utility)**, trade-ins (refunding deprecated equipment), and saving/loading loadout presets.

1. Partition starship outfitting slots: 2x Weapon Slots, 1x Shield Slot, 1x Utility Slot (e.g., Jammers, Locator Radars).
2. Allow players to sell back installed outfits to the planetary outfitter, receiving a 90% trade-in refund in credits.
3. Enforce slot type restrictions (e.g., cannot install two shields, or weapons in a utility slot).
4. Expose loadout profiles inside the client Spaceport Outfitting tab, allowing players to save up to 3 custom presets and hotkey swap them at docks.
5. Enhance outfitting statistics visualization in the UI, showcasing mass impact, speed reductions, shield boosts, and damage values.

## Definition of Done (DoD)
- [ ] Enforce fit-slot classifications and buy/sell validation in `src/engine/Outfitting.js`.
- [ ] Implement outfitting trade-ins in `src/server/portHandlers.js` and credit refunds.
- [ ] Create loadout save/load profile capabilities in the persistence layer.
- [ ] Design the premium outfitting dashboard layout with slots rendering in `src/client/SpaceportUI.js`.
- [ ] Write unit tests confirming slot limits, correct refund transactions, and preset serialization.

## Implementation Approach
- Add a `slots` map on `Ship` properties keeping track of installed outfits by slot id.
- Add `"port_outfit_sell"` and `"port_preset_save"` handler endpoints in `portHandlers.js`.
- Build the slot config layout in the Outfitter UI with elegant glassmorphic detail panes displaying ship performance.
