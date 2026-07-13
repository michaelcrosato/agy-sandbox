import { interestFilter, buildSpatialGrid } from "../net/interest.js";
import { encode as encodeFrame } from "../net/BinaryCodec.js";
import { nextFrame } from "../net/BroadcastFramer.js";
import { sendDecision } from "../net/backpressure.js";

/**
 * Broadcasts the current room world state to all connected clients.
 *
 * @param {object} room - The authoritative room instance.
 * @param {object} options - Configuration and dependency options.
 * @param {object} options.squadManager - The squad manager instance.
 * @param {object} options.latencyMonitor - The latency monitor instance.
 * @param {object} options.metrics - The metrics registry.
 * @param {boolean} options.interestEnabled - Whether Area-of-Interest filtering is enabled.
 * @param {number} options.interestRadius - The radius of viewport visibility.
 * @param {boolean} options.binaryProtocol - Whether to format frames as binary payload.
 */
export function broadcastRoomState(room, options) {
  const {
    squadManager,
    latencyMonitor,
    metrics,
    interestEnabled,
    interestRadius,
    binaryProtocol,
  } = options;

  const allEntities = room.serializeEntities();
  const spatialGrid = interestEnabled
    ? buildSpatialGrid(allEntities, interestRadius)
    : null;

  const roomForceKeyframe = !!room.needsKeyframe;
  room.needsKeyframe = false;

  for (const client of room.clients.values()) {
    if (client.ws.readyState !== client.ws.OPEN) continue;

    const viewer = client.ship;
    let squadmates = [];
    if (viewer && squadManager) {
      const squad = squadManager.getSquadForPlayer(client.id);
      if (squad) {
        for (const memberId of squad.memberIds) {
          if (memberId === client.id) continue;
          const smClient = room.clients.get(memberId);
          if (smClient && smClient.ship && smClient.ship.position) {
            squadmates.push({
              x: smClient.ship.position.x,
              y: smClient.ship.position.y,
            });
          }
        }
      }
    }

    let visible =
      interestEnabled && viewer && viewer.position
        ? interestFilter(
            allEntities,
            { x: viewer.position.x, y: viewer.position.y },
            {
              radius: interestRadius,
              alwaysIncludeId: client.id,
              spatialGrid,
              squadmates,
            },
          )
        : allEntities;

    // Event-Loop Latency Backpressure load-shedding (SPEC-090): drop
    // non-essential clutter (asteroids + projectiles) under latency pressure.
    // Asteroids are typed "generic"/"gem_asteroid" (see GameInstance
    // spawnNewAsteroid and the mining/collision predicates), not "asteroid" —
    // the previous filter matched a type that never exists, so it shed nothing.
    if (latencyMonitor && latencyMonitor.shouldShed("optional")) {
      visible = visible.filter(
        (ent) =>
          ent.type !== "generic" &&
          ent.type !== "gem_asteroid" &&
          ent.type !== "projectile",
      );
    }

    const frame = nextFrame({
      entities: visible,
      prev: client.broadcastState,
      forceKeyframe:
        roomForceKeyframe || !client.broadcastState || !!client.needsKeyframe,
    });

    // Backpressure (spec 004): a slow client's send buffer must not grow
    // unbounded. Skip deltas to a backed-up client (it resyncs on the next
    // keyframe); drop one that is hopelessly behind. The per-client baseline
    // advances ONLY on a successful send, so a skipped client's next delta is
    // computed against the state it actually holds — no desync.
    const decision = sendDecision(client.ws.bufferedAmount, {
      isKeyframe: frame.isKeyframe,
    });

    if (decision === "drop") {
      client.ws.terminate();
      if (metrics) {
        metrics.inc("slow_client_drops");
      }
    } else if (decision === "send") {
      client.broadcastState = frame.nextState;
      client.needsKeyframe = false;
      const statePayload = binaryProtocol
        ? encodeFrame(frame.payload)
        : JSON.stringify(frame.payload);
      client.ws.send(statePayload);
      if (metrics) {
        const bytes =
          typeof statePayload === "string"
            ? statePayload.length
            : statePayload.byteLength;
        metrics.inc("broadcast_bytes", bytes);
      }
    }
  }
}
