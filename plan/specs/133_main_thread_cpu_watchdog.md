# SPEC-133: Autonomic CPU Exhaustion Guard & Main-Thread Watchdog

## Summary
Build a lightweight, background-worker thread main-thread watchdog (`src/net/MainThreadWatchdog.js`) that periodically pings the Node main event loop. If the main thread becomes frozen (e.g. blocked by a guest script running a synchronous infinite loop `while(true) {}`) and fails to acknowledge pings within a configurable threshold (default 1000ms), the watchdog thread forcefully terminates the process or invokes the process-tree reaper, protecting the host system from DoS freezes.

## Motivation
- AI agents executing untrusted code can trigger synchronous infinite loops that block Node's single-threaded event loop.
- When the event loop is blocked, standard interval timers and limiters fail to fire, causing absolute process freeze and resource starvation on the host.
- A dedicated background watchdog worker thread operates outside the main thread and can reliably detect freezes and forcefully recover, guaranteeing sandbox scale.
- Supports the P3 Security and P7 Scale and Netcode pillars.

## Scope
**In:**
- Implement `src/net/MainThreadWatchdog.js` spawning a background worker thread.
- Establish a bidirectional channel using `worker_threads` parentPort/postMessage.
- The main thread periodically acknowledges heartbeat pings from the watchdog thread (default every 200ms).
- If the main thread fails to respond within a timeout (default 1000ms), the watchdog logs a critical breach to `SandboxSecurityRegistry` and forcefully terminates the parent process via SIGKILL.
- Author robust Jest unit tests confirming heartbeat responsiveness and successful force-exit recovery under induced synchronous busy-loops.

## Out:**
- Do not block or interfere with normal Jest test sweeps or legitimate short computational spikes.

## Acceptance Criteria
- [ ] Watchdog worker thread pings the main thread periodically without performance overhead.
- [ ] If the main thread blocks for longer than the threshold, the watchdog forcefully tears down the frozen process.
- [ ] Watchdog logs CPU freeze violations to SandboxSecurityRegistry before termination.
- [ ] Jest unit tests confirm that induced main-thread freezes trigger successful forceful terminations.
