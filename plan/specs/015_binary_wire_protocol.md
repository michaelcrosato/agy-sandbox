# 015 — Binary wire protocol for broadcasts

- **Phase:** 2 · **Priority:** P2 (netcode / GOAL P7) · **Blocked by:** none

## Description & Expected Impact
State is sent as **JSON text** every tick. Market leaders (Colyseus) use **binary-encoded** delta sync,
which is far smaller and faster to parse. **Impact:** lower bandwidth and client/server (de)serialization
cost — compounds with `014` interest management; the protocol foundation for scaling.

## Definition of Done & Acceptance Criteria
- [ ] A pure, versioned binary encoder/decoder for the snapshot+delta payloads (`encode(frame) →
      ArrayBuffer/Uint8Array`, `decode(buf) → frame`) with the round-trip invariant `decode(encode(x))`
      deep-equals `x` across adds/updates/removes.
- [ ] Server sends binary frames (`ws` binary mode); client `NetworkHandler` decodes them; gameplay/visuals
      unchanged.
- [ ] A protocol `version` byte enables forward migration; non-state channels (chat, notifications) may
      stay JSON.
- [ ] Measured payload-size reduction vs. JSON for a representative frame (via `010` metrics).
- [ ] `npm run agent:check` green; `node src/server.js` boots; client connects and renders.

## Implementation Approach
- New `src/net/BinaryCodec.js` complementing `StateCodec`/`BroadcastFramer`: encode the same
  `{type, seq, baseSeq, entities|delta}` shape into a compact buffer (typed fields, varints/float32 for
  positions). Keep it pure and exhaustively tested before any wiring.
- Wire incrementally: encode in the broadcast loop, send with `ws.send(buffer, {binary:true})`; decode in
  `NetworkHandler` (detect binary vs string frames). Keep a JSON fallback behind an env flag for one
  release to de-risk.
- Do not change the logical frame contract (`BroadcastFramer` still decides keyframe vs delta).

## Test Strategy
- **Unit (`BinaryCodec.test.js`):** round-trip equality for empty/add/remove/partial/nested/field-removal
  frames; version byte respected; rejects truncated buffers. Mirror `StateCodec.test.js`'s coverage style.
- **Integration:** feed `BroadcastFramer` output through `BinaryCodec` and a parallel client decoder over a
  churn sequence; assert per-tick reconstruction matches `encodeSnapshot`.
- **Manual:** boot + client; confirm smooth rendering and a payload-size drop in `/metrics`.
