# SPEC-125: Zero-Downtime Hot Config Reloading Engine

## Summary
Build a secure configuration reload engine (`src/net/ConfigWatcher.js`) that monitors configuration file changes (`plan/config.json`) on disk using non-blocking asynchronous fs polling, dynamically validating and hot-reloading parameters (like connection rate limits, standings thresholds, and firewall rules) across running server contexts without process terminations.

## Motivation
- Running multi-worker environments requires high availability. Standard restarts cause temporary client disconnects and match disruption. Zero-downtime hot reloading keeps shards running smoothly under dynamic policy shifts.
- Enhances the P7 Scale and P8 Extensibility pillars.

## Scope
**In:**
- Build `src/net/ConfigWatcher.js` using `fs.watch` or non-blocking async `fs.stat` polling to detect disk mutations on `plan/config.json`.
- Safely parse dynamic configurations, passing them through `SchemaValidator` to ensure all loaded values (e.g. rate limit thresholds) are structure-safe.
- Hot-update global live instances of `SchemaValidator`, `apiRateLimiter`, and `FactionRegistry` options.
- Create complete ESM unit tests in `src/net/ConfigWatcher.test.js`.

**Out:**
- Do not let config errors crash active worker threads; catch all file reading/parsing exceptions gracefully and retain the existing configuration state.

## Acceptance Criteria
- [ ] ConfigWatcher successfully watches and loads disk configurations.
- [ ] Modified options are verified by SchemaValidator before reload propagation.
- [ ] Syntax errors or bad types are rejected safely without process crashes.
- [ ] Robust test coverage verifies reloads, invalid type rejections, and state updates.
