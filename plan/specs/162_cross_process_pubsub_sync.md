# SPEC-162: Cross-Process Chat & Sector Interest Sync Pipeline over Redis Pub/Sub

## Summary

Build an efficient cross-process messaging and interest registration layer inside `src/net/PubSub.js` using Redis Pub/Sub sharded channels. Integrate this cleanly with `src/server.js` dynamic routing and squad manager to allow real-time squad chat, team invitations, and position frame synchronization across separate cluster worker nodes.

## Motivation

- Hardens multi-process horizontal scaling (P7) to enable players connected to different node shards to seamlessly form squads, coordinate, and chat without boundaries.
- Keeps process-level WebSocket loops lightweight by delegating dynamic cross-node message routing to the high-performance Redis Pub/Sub engine.

## Scope

**In:**

- Extend `src/net/PubSub.js` to support dedicated channels for squad synchronization: `chat:squad` and `squad:events`.
- Update `squadHandlers.js` and `SquadManager.js` to propagate team updates (member joins, leaves, invites, vitals synchronization) across sharded workers using the pub/sub connection.
- Enable sharded presence maps to allow local WebSocket broadcasters to query squadmate details from the store even if they reside on a different shard node.
- Author comprehensive unit/integration tests verifying cross-process message publication, routing, and subscription loops.

**Out:**

- Do not alter the single-process in-memory pub/sub behavior; keep it fully backward-compatible as the default fallback in non-clustered environments.

## Acceptance Criteria

- [ ] Squad invites, joins, and messaging propagate seamlessly across worker processes.
- [ ] RedisPubSub manages dedicated `chat:squad` and `squad:events` channels.
- [ ] Sector squad roster updates synchronize across cluster nodes.
- [ ] Dedicated unit/integration tests verify cross-shard communication flows under mock Redis models.
