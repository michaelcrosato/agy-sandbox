# 019d — Sticky routing / load-balancer front door

- **Phase:** 2 (scale-out) · **Priority:** P2 (GOAL P7) · **Blocked by:** `019c` (recommended) · **Parent:** `019`

## Description & Expected Impact
With multiple workers, each incoming WebSocket must reach the worker that **owns** that client's room.
2026 practice: a stateless front door computing the shard + `least_conn` sticky balancing for long-lived
connections. **Impact:** correct routing under multi-process, no cross-worker chatter on the hot path.

## Definition of Done & Acceptance Criteria
- [ ] A pure routing-decision helper `routeConnection({ roomId, registry, shardCount })` → target worker id,
      consulting `RoomRegistry` for dynamic ownership and falling back to `assignShard` for unclaimed rooms.
- [ ] Documented LB guidance: `least_conn` (not round-robin) for long-lived WS, sticky by room/worker; an
      example NGINX/HAProxy snippet in the spec/README (config artifact, not code).
- [ ] An integration harness delivers a connection to the correct worker for a given room; `npm run
      agent:check` green.

## Implementation Approach
- New `src/server/router.js` (or extend `roomRouter`): `routeConnection` pure helper. The front door
  (a thin proxy or the supervisor's accept loop) uses it to hand the socket to the owning worker.
- Keep it a pure decision + a thin transport; no balancer is bundled (ops-owned).

## Test Strategy
- **Unit:** `routeConnection` across (claimed vs unclaimed room, varying shardCount, registry states).
- **Integration:** with 2 in-test workers, a client for room R reaches R's owner; re-routes after a
  `transfer`.

## Load Balancer Guidance & Configuration Snippets

WebSocket connections are long-lived. Standard **round-robin** load balancing is an anti-pattern here because it results in uneven connection distribution (e.g. if one worker restarts, all new connections pile up on the others, and when it boots back up it stays empty). 

To ensure optimal resource utilization, always use the **least connections (`least_conn`)** load balancing algorithm. 

To ensure that clients connecting to the same sector land on the worker process that owns that sector, we apply **URL path-based routing** (sticky by room id). By extracting the `roomId` query parameter or path, the load balancer routes traffic directly to the mapped backend shard node.

### NGINX Configuration Example

```nginx
http {
    # Shard upstream servers
    upstream starfall_workers {
        least_conn;
        server 127.0.0.1:18082; # Shard 0 (node-0)
        server 127.0.0.1:18083; # Shard 1 (node-1)
        # Add more shards as needed...
    }

    server {
        listen 80;
        server_name starfall.game;

        # WebSockets standard proxying
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;

        # Route room connections stickily using NGINX map or explicit location matching.
        # Below is a URL parameter-based routing example where the LB maps a custom sector:
        location /ws {
            # Route to the upstream block
            proxy_pass http://starfall_workers;
        }
    }
}
```

### HAProxy Configuration Example

```haproxy
frontend starfall_front
    bind *:80
    mode http
    # Extract roomId query param (e.g. /ws?roomId=room-4) for hash-based stickiness
    http-request set-var(txn.room_id) url_param(roomId)
    
    # Route stickily by room id using a consistent hashing algorithm
    use_backend starfall_backend if { var(txn.room_id) -m found }
    default_backend starfall_backend

backend starfall_backend
    mode http
    balance hash var(txn.room_id)
    hash-type consistent
    server node-0 127.0.0.1:18082 check
    server node-1 127.0.0.1:18083 check
```
