# SPEC-055 — Naval Command Decks & Faction Bounty Vouchers

## Description
This specification transitions combat rewards from immediate credit payouts to faction-specific **Bounty Vouchers** that players earn upon neutralizing hostiles in space. To cash them in, players visit a new **Naval Command Deck** spaceport service.

1. When players neutralize outlaw or enemy navy ships, they collect a "Bounty Voucher" (e.g. `{"faction": "Federation", "value": 1500}`). These vouchers are kept on the player's ship inventory.
2. Introduce the "Naval Command Deck" port service in planets controlled by major factions.
3. Players can redeem accumulated vouchers at the Naval Command Deck to claim their credits and earn a faction commendation multiplier.
4. Redemptions also grant **Faction Standings / Merits**, ranking up the player's profile (e.g. recruit, lieutenant, commander).
5. Higher naval ranks unlock access to locked premium military ship hulls (e.g., "Interceptor Mk II") or exclusive weaponry in the shipyard/outfitter.

## Definition of Done (DoD)
- [ ] Add `bountyVouchers` array to player ship constructor in `src/engine/Ship.js`.
- [ ] Mutate `GameInstance.js` combat rewards to push vouchers into the killer player's `bountyVouchers` list instead of adding credits instantly.
- [ ] Implement `redeemVouchers(player, faction)` in a new module or inside `src/engine/PortServices.js` that calculates credit payout and adds standings.
- [ ] Update `src/client/SpaceportUI.js` and `index.html` to add the "Naval Command Deck" tab and redemption controls.
- [ ] Wire ship hull and outfit purchase checks so locked military upgrades verify the player's faction standings/rank before permitting a buy.
- [ ] Write deterministic unit/integration tests confirming voucher issuance on combat, redemption logic, and rank lock enforcement.
- [ ] Maintain a 100% green gate check.

## Implementation Approach
- In `src/engine/Ship.js`, initialize `this.bountyVouchers = []`.
- In `src/engine/PortServices.js`, add `redeemFactionVouchers(ship, faction, factionRegistry)` which filters vouchers, awards credits, and increments player standings with a bonus commendation factor.
- In `src/server/portHandlers.js`, hook `"port_redeem_vouchers"` WS endpoint.
- In `src/client/SpaceportUI.js`, render the "Naval Command" deck displaying current vouchers, current naval rank, and a "REDEEM ALL VOUCHERS" button.

## Test Strategy
- Write unit tests in `src/engine/PortServices.test.js` or `src/engine/Outfitting.test.js` asserting:
  - Destructing an outlaw ship correctly generates and pushes a voucher.
  - Redeeming vouchers correctly adds standings and credits, and purges the redeemed vouchers.
  - Military shipyard hulls correctly block transactions if standing/rank is insufficient.
