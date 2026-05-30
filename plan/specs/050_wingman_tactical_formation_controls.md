# SPEC-050 — Wingman Tactical Formation & Targeting Controls

## Description
Players can purchase escort ships (wingmen) to help them in combat. The underlying `AIController.js` already includes support for `escortMode = "follow" | "hold" | "attack"`. However, the message handler routing `"escort_command"` client messages remains inline within the `src/server.js` monolith, has zero unit tests, and the tactical cooperation between flagship and escorts can be significantly deepened.

This specification:
1. Extracts the inline `"escort_command"` WS handler from `src/server.js` into the modular `src/server/portHandlers.js` as `handleEscortCommand(clientObj, command, room)`, increasing code hygiene.
2. Creates comprehensive unit tests in `src/server/portHandlers.test.js` covering successful command transmissions, invalid states, and correct notification returns.
3. Enhances the tactical wingman AI inside `src/engine/ai/AIController.js`. When a player instructs their escorts to `"attack"`, the wingmen will automatically acquire and aggressively lock onto their flagship's current target (`flagshipController.target` or target ship), cooperating as a real cooperative strike force!

## Definition of Done (DoD)
- [ ] Extract the `"escort_command"` message handler from `src/server.js` into `src/server/portHandlers.js` as `handleEscortCommand(clientObj, command, room)`.
- [ ] Wire the handler back into `src/server.js` to process client orders seamlessly.
- [ ] Write dedicated, isolated unit tests inside `src/server/portHandlers.test.js` validating:
  - Transmitting `"hold"`, `"follow"`, and `"attack"` commands correctly updates the `escortMode` of all escorts owned by the player's flagship.
  - Returns a success notification indicating the exact count of wingmen commanded.
  - Handles absent rooms, ships, or empty fleets gracefully without throwing.
- [ ] Enhance escort combat behavior inside `src/engine/ai/AIController.js` so that when `escortMode === "attack"`, it queries its flagship's active target (searching for its flagship's controller target) and locks onto that exact target if within scanning range.
- [ ] Verify that all 800+ Jest tests and lint checks pass cleanly.

## Implementation Approach
- In `src/server/portHandlers.js`, add:
  ```javascript
  export function handleEscortCommand(clientObj, command, room) {
    if (!clientObj || !clientObj.ship || !room) return;
    let count = 0;
    for (const ai of room.ais) {
      if (ai.role === "escort" && ai.flagship === clientObj.ship) {
        ai.escortMode = command;
        count++;
      }
    }
    clientObj.send({
      type: "notification",
      message: `Transmitted [${command.toUpperCase()}] commands to ${count} AI wingmen.`,
      style: "success",
    });
  }
  ```
- In `src/server.js`, import `handleEscortCommand` and delegate the `"escort_command"` block to it.
- In `src/engine/ai/AIController.js` under `role === "escort"` updates:
  - When evaluating active threat targets in `"attack"` mode, if the flagship has an active combat target, the escort should prioritize that target during its scan and target-locking phase.

## Test Strategy
- Unit tests inside `src/server/portHandlers.test.js` using mock client, room, and AI objects.
- AI cooperation unit tests inside `src/engine/ai/AIController.test.js` verifying flagship target-locking propagation.
- Gate verify command:
  `npm run agent:check`
