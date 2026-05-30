# 037 — `permessage-deflate` compression evaluation (benchmark behind a flag)

- **Phase:** 2 (perf) · **Priority:** P2 · **Blocked by:** none

## Description & Expected Impact
The broadcast is already shrunk by AoI (`014`) + binary (`015`). `ws` supports **permessage-deflate**, but
2026 research warns it adds real **CPU/memory** cost (Node zlib fragments memory at high concurrency) and is
**disabled server-side by default**. **Impact:** *potentially* lower bandwidth for large frames — but only
if the CPU/memory trade is worth it. This spec is an **evaluation with data**, not an unconditional enable.

## Definition of Done & Acceptance Criteria
- [ ] A benchmark harness measures payload size **and** server CPU/time for representative frames
      (post-AoI/binary) **with vs without** permessage-deflate, including the recommended tuning
      (`threshold: 1024`, `concurrencyLimit`, `*_no_context_takeover`).
- [ ] Compression is wired **behind an env flag** (default **off**, mirroring `ws`'s own default and the
      `BINARY_PROTOCOL`/`INTEREST_MANAGEMENT` precedent); a written recommendation (enable / don't / only for
      JSON channels) lands in the spec or `BACKLOG.md` with the measured numbers.
- [ ] `npm run agent:check` green; default behaviour (compression off) is unchanged; server boots.

## Implementation Approach
- Add `perMessageDeflate` options to the `WebSocketServer` config gated by `WS_COMPRESSION` (default off,
  with safe tuning when on). Add a small benchmark script (not part of the gate) that encodes N
  representative frames and times deflate vs none, reporting bytes + ms.

## Test Strategy
- **Unit:** the option is present/absent per the flag (config assertion).
- **Bench (manual, documented):** sizes + timings table for binary frames with/without deflate; decision
  recorded. **Regression:** a `ws`-smoke still connects + decodes with the flag on and off.
