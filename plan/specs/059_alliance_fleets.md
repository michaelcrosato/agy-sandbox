# SPEC-059 — Multiplayer Squads & Allied Shared Standing

## Description
This spec introduces **multiplayer alliance squads** that allow players to form co-op groups, share sector radar visual sweeps, coordinate faction standings, and split bounty vouchers proportionally.

1. Implement a squad creation/join protocol inside `src/server.js` using `"squad_invite"`, `"squad_join"`, and `"squad_leave"` WS message types.
2. In a squad, all members share active sensor ranges, rendering fellow squad members as friendly chevrons and sharing their targeted entities on the client HUD.
3. Combat neutralizations of faction hostiles split bounty vouchers and standing merits dynamically among all squad members present in the same sector.
4. Render co-op squad teammate statuses (shield, armor, current target) dynamically in a dedicated overlay on the client HUD.
5. Support a dedicated `/squad <msg>` command in the chat channel that broadcasts messages exclusively to squad members.

## Definition of Done (DoD)
- [x] Create `SquadManager` inside `src/server/SquadManager.js` to manage membership and lifecycle.
- [x] Rework `GameInstance.js` handleEntityDestroyed to distribute vouchers and standing among sector squadmates.
- [x] Integrate shared visual sensors within AoI culling configurations.
- [x] Create teammate HUD panels showing vital stats and target indicators.
- [x] Write integration tests verifying squad joining, co-op voucher splitting, and correct target sync.

## Implementation Approach
- Manage squad ID mappings inside the server process memory/Redis registry.
- Extend `interestFilter` in `src/net/interest.js` to optionally accept squadmate coordinates as inclusion criteria.
- Add co-op stat layout grids in the HUD using CSS Flexbox.
