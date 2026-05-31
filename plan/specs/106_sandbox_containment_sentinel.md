# SPEC-106 — Sandbox Containment: Strict Process Spawn Sentinel & Self-Healing Port Reclaimer

- **Status:** Completed
- **Wave:** v25 — Phase 0
- **Priority:** High
- **Product Pillar:** P0 — Security & Teardown Lifecycle (Sandbox Infrastructure)

## Problem

Under autonomous multi-day agent execution, two critical vulnerabilities threaten sandbox stability and security:
1. **Process-Level Sandbox Escape:** While `ApiRateLimiter` restricts Node-level HTTP/HTTPS/fetch network egress, a guest agent can execute raw commands (like `exec("curl http://malicious.com")` or `exec("nslookup ...")`) using Node's `child_process` module, completely bypassing network sentinels to exfiltrate files or execute untrusted code on the host.
2. **Port Conflict Failures (`EADDRINUSE`):** If a previous execution run crashes or terminates abruptly, background threads or child workers can remain orphaned, locking ports (like `8080`, `18196`, `18198`). Subsequent runs immediately fail on boot with `EADDRINUSE`, breaking the unattended execution loop.

## Scope

### In

- **Strict Process Spawn Sentinel (`src/net/ProcessSentinel.js`):**
  - Monkey-patch Node.js `child_process` methods (`spawn`, `spawnSync`, `fork`, `exec`, `execSync`).
  - Maintain a strict whitelist of permitted commands and subcommands:
    - `git` (only with subcommands: `status`, `add`, `commit`, `restore`, `diff`, `ls-files`).
    - `npm` (only with: `run dev`, `run lint`, `run typecheck`, `test`, `run agent:check`, `run codex:generate`, `ci`).
    - `node` (only running allowed local workspace scripts, e.g. `scripts/agent/generate-codex.js`).
    - `eslint`, `prettier`, `tsc`.
  - Block any un-allowlisted or raw network-reaching commands (like `curl`, `wget`, `ping`, `nslookup`, `ssh`), immediately throwing a sandboxed `SecurityError` or returning a failing exit code 1.
  - Expose a secure, read-only stats collector counting allowed vs blocked commands.
- **Port Conflict Self-Healer (`src/net/PortReclaimer.js`):**
  - Implement a programmatic port conflict resolver inside the server bootstrap sequence.
  - On `EADDRINUSE` error, execute a sandboxed lookup (using platform-native commands like `netstat -ano` on Windows or `lsof -i` on Unix) to discover the zombie PID occupying the target port.
  - Terminate the specific zombie process cleanly (`process.kill(pid, "SIGKILL")`) and retry binding successfully.
- **Robust Unit & Lifecycle Tests:**
  - Create `src/net/ProcessSentinel.test.js` validating command whitelists and rejections.
  - Create `src/net/PortReclaimer.test.js` simulating port binding collisions, proving successful reclamation and socket cleanup.

### Out

- **Host-level container firewalls:** This provides process-level containment within the guest Node.js sandbox, without managing host OS level firewall interfaces.

## Acceptance Criteria

- [x] `src/net/ProcessSentinel.js` monkey-patches `child_process` globally, blocking un-allowlisted and network commands while permitting clean git/npm checks.
- [x] `src/net/PortReclaimer.js` successfully detects `EADDRINUSE` port locks, identifies the process ID occupying the port, and kills it to bind successfully.
- [x] Server boot sequence in `src/server.js` is wired with the port reclaimer.
- [x] Comprehensive unit tests confirm all rejections, allowlists, and port reclamation events.
- [x] `npm run agent:check` remains 100% green.

## Verification Commands

```bash
npm run agent:check
```
