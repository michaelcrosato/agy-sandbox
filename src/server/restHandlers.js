import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import core sandbox and security registries
import { GuestRunner } from "../net/GuestRunner.js";
import { GuestRpcSentry } from "../net/GuestRpcSentry.js";
import { WorkspaceDriftSentry } from "../net/WorkspaceDriftSentry.js";
import { ProcessReaper } from "../net/ProcessReaper.js";
import { ProcessSentinel } from "../net/ProcessSentinel.js";
import { SandboxSecurityRegistry } from "../net/SandboxSecurityRegistry.js";
import { validateMessage } from "../net/SchemaValidator.js";
import { COMMODITIES_METADATA, SCHEMAS } from "../net/SchemaRegistry.js";
import { buildLobbyRoomsList } from "./lobbySync.js";
import { DynamicResourceGovernor } from "../net/DynamicResourceGovernor.js";
import {
  isAdminAuthorized,
  readBodyWithLimit,
  resolveStaticFile,
} from "../net/httpSecurity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT_DIR = path.resolve(__dirname, "../..");
const MAX_ADMIN_BODY_BYTES = 256 * 1024;

/**
 * Writes a JSON response with the standard header set.
 * @param {import("http").ServerResponse} res
 * @param {number} code
 * @param {object} obj
 * @param {boolean} [cors=true] Whether to send the permissive CORS header.
 */
function sendJson(res, code, obj, cors = true) {
  const headers = { "Content-Type": "application/json" };
  if (cors) headers["Access-Control-Allow-Origin"] = "*";
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}

/**
 * Rejects a request that failed the admin authorization gate.
 * @param {import("http").ServerResponse} res
 */
function sendForbidden(res) {
  sendJson(res, 403, {
    error:
      "Forbidden: administrative endpoints require a loopback caller or a valid X-Admin-Token header.",
  });
}

/**
 * Reads a file synchronously with retries on lock contention.
 * @param {string} filePath
 * @param {BufferEncoding} options
 * @param {number} [retries]
 * @param {number} [delay]
 * @returns {string}
 */
function readFileSyncWithRetry(filePath, options, retries = 5, delay = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      return fs.readFileSync(filePath, options);
    } catch (err) {
      if (
        (err.code === "EBUSY" ||
          err.code === "EPERM" ||
          err.code === "ENOENT") &&
        i < retries - 1
      ) {
        const start = Date.now();
        while (Date.now() - start < delay) {
          // busy wait
        }
        continue;
      }
      throw err;
    }
  }
}

function writeFileSyncWithRetry(
  filePath,
  data,
  options,
  retries = 5,
  delay = 20,
) {
  for (let i = 0; i < retries; i++) {
    try {
      return fs.writeFileSync(filePath, data, options);
    } catch (err) {
      if ((err.code === "EBUSY" || err.code === "EPERM") && i < retries - 1) {
        const start = Date.now();
        while (Date.now() - start < delay) {
          // busy wait
        }
        continue;
      }
      throw err;
    }
  }
}

/**
 * Handles incoming REST API and static file serving requests modularly.
 *
 * @param {import("http").IncomingMessage} req The HTTP request.
 * @param {import("http").ServerResponse} res The HTTP response.
 * @param {Object} options The configuration/dependency singletons option object.
 * @param {Object} options.metrics The core metrics registry.
 * @param {Map} options.instances The active room/sector instances directory.
 * @param {Object} options.matchmakingQueue The active JoinQueue.
 * @param {Object} options.latencyMonitor The LatencyMonitor singleton.
 * @param {Object} options.sandboxTelemetry The SandboxTelemetry singleton.
 * @param {Object} options.apiRateLimiter The ApiRateLimiter singleton.
 * @param {Object} options.sandboxFirewall The SandboxFirewall singleton.
 * @param {Object} options.memoryLeakSentry The MemoryLeakSentry singleton.
 * @param {Object} options.anomalyDetector The AnomalyDetector singleton.
 * @param {Map} options.clients The map of active sockets/clients ws -> clientObj.
 * @param {Object} options.galacticChronicle The GalacticChronicle instance.
 * @param {number} options.PORT The HTTP port the server is listening on.
 * @param {number} options.WORKERS The total number of sharded worker processes.
 * @param {number} options.SHARD_INDEX The current shard index.
 * @param {Object} options.wss The WebSocketServer instance.
 * @param {string} [options.ROOT_DIR] The optional repository root directory path.
 * @param {string} [options.adminToken] Token gating admin/sandbox endpoints (defaults to ADMIN_TOKEN env).
 */
export function handleRestRequest(req, res, options) {
  // Handle CORS OPTIONS preflight first to prevent GET endpoints from intercepting it
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const safeUrl = req.url.split("?")[0];
  const ROOT_DIR = options.ROOT_DIR || DEFAULT_ROOT_DIR;
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN;

  // Test only: Induce event loop lag to test backpressure shedding (SPEC-095)
  if (process.env.NODE_ENV === "test" && safeUrl === "/test/induce-lag") {
    const ms = Number(req.url.split("ms=")[1] || "60");
    const start = Date.now();
    while (Date.now() - start < ms) {
      // CPU busy-wait
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ induced: ms }));
    return;
  }

  // Observability endpoint (spec 010): read-only runtime metrics snapshot.
  if (safeUrl === "/metrics" || safeUrl === "/healthz") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });

    const snap = options.metrics.snapshot();
    let totalDrifts = 0;
    for (const inst of options.instances.values()) {
      if (inst.determinismSentry) {
        totalDrifts += inst.determinismSentry.getDriftAlertsTotal();
      }
    }

    const wssClientsSize = options.wss ? options.wss.clients.size : 0;

    const augmented = {
      ...snap,
      cluster_worker_ports: Array.from(
        { length: options.WORKERS },
        (_, i) => options.PORT - options.SHARD_INDEX + i,
      ),
      shard_index: options.SHARD_INDEX,
      workers_total: options.WORKERS,
      clients_active: wssClientsSize,
      rooms_active: options.instances.size,
      determinism_drift_alerts_total: totalDrifts,
      tick_ms_avg: snap.observations.tick_ms?.avg ?? 0,
      broadcast_bytes_total: snap.counters.broadcast_bytes ?? 0,
      matchmaking_queue_size: options.matchmakingQueue
        ? options.matchmakingQueue.size
        : 0,
      event_loop_latency_ms: options.latencyMonitor
        ? options.latencyMonitor.getLatency()
        : 0,
      event_loop_status: options.latencyMonitor
        ? options.latencyMonitor.getStatus()
        : "NORMAL",
      sandbox_telemetry: options.sandboxTelemetry
        ? options.sandboxTelemetry.getMetrics()
        : {},
      api_limiter: {
        block_count: options.apiRateLimiter
          ? options.apiRateLimiter.blockCount
          : 0,
        expended_tokens: options.apiRateLimiter
          ? options.apiRateLimiter.expendedTokens
          : 0,
        max_per_minute: options.apiRateLimiter
          ? options.apiRateLimiter.maxPerMinute
          : 0,
        max_per_hour: options.apiRateLimiter
          ? options.apiRateLimiter.maxPerHour
          : 0,
        allowlist_domains: options.apiRateLimiter
          ? options.apiRateLimiter.allowlistDomains
          : [],
      },
      sandbox_firewall: {
        block_count: options.sandboxFirewall
          ? options.sandboxFirewall.blockCount
          : 0,
        blocked_events: options.sandboxFirewall
          ? options.sandboxFirewall.blockedEvents
          : [],
        allowlist_domains: options.sandboxFirewall
          ? options.sandboxFirewall.allowlistDomains
          : [],
      },
      memory_leak_alerts: options.memoryLeakSentry
        ? options.memoryLeakSentry.getDiagnostics()
        : {},
      anomaly_triggers_total: options.anomalyDetector
        ? options.anomalyDetector.anomalyTriggersTotal
        : 0,
      anomaly_detector: options.anomalyDetector
        ? options.anomalyDetector.getDiagnostics()
        : {},
      sandbox_security: SandboxSecurityRegistry.getMetrics(),
      process_reaper: {
        active_processes: ProcessReaper.getProcessCount(),
        active_workers: ProcessReaper.getWorkerCount(),
      },
      process_sentinel: ProcessSentinel.getStats(),
      resource_governor: DynamicResourceGovernor.getMetrics(),
      guest_sandbox: {
        active_runs: Array.from(GuestRunner.activeRuns.values()),
        recent_runs: GuestRunner.recentRuns,
        rpc_total_requests: GuestRpcSentry.totalRequests,
        rpc_blocked_requests: GuestRpcSentry.blockedRequests,
        drift_total_self_heals: WorkspaceDriftSentry.totalSelfHeals,
        drift_total_files_restored_or_purged:
          WorkspaceDriftSentry.totalFilesRestoredOrPurged,
        tokens_spent: GuestRunner.getTotalTokensSpent(),
        usd_consumed: GuestRunner.getTotalUsdConsumed(),
      },
      rooms: buildLobbyRoomsList(options.instances).map((r) => ({
        ...r,
        players: r.playersCount,
        shardIndex: options.SHARD_INDEX,
      })),
    };
    res.end(JSON.stringify(augmented));
    return;
  }

  // Observability: The Galactic Chronicle & Dynamic Event Ledger (SPEC-096)
  if (safeUrl === "/chronicle") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify(
        options.galacticChronicle ? options.galacticChronicle.getEvents() : [],
      ),
    );
    return;
  }

  // SPEC-099: Centralized Commodities & Unified Schema Registry HTTP Endpoint
  if (safeUrl === "/schema") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        commodities: COMMODITIES_METADATA,
        schemas: SCHEMAS,
      }),
    );
    return;
  }

  // SPEC-102: Serve Codebase Living Codex JSON Data & friendly visual redirect
  if (safeUrl === "/codex") {
    const codexPath = path.resolve(ROOT_DIR, "plan/codex.json");
    if (fs.existsSync(codexPath)) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(fs.readFileSync(codexPath, "utf8"));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Living Codex data not found. Please run codex:generate first.");
    }
    return;
  }

  // SPEC-137: Dynamic Egress Firewall Admin rules modification endpoint
  if (req.method === "POST" && safeUrl === "/api/firewall/rules") {
    if (!isAdminAuthorized(req, { adminToken })) {
      sendForbidden(res);
      return;
    }
    readBodyWithLimit(req, MAX_ADMIN_BODY_BYTES)
      .then((body) => {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== "object") {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ error: "Invalid JSON payload" }));
          return;
        }

        const { action, domain } = payload;
        if (action !== "allow" && action !== "block") {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(
            JSON.stringify({ error: "Action must be 'allow' or 'block'" }),
          );
          return;
        }

        if (typeof domain !== "string" || !domain.trim()) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(
            JSON.stringify({
              error:
                "Domain parameter is required and must be a non-empty string",
            }),
          );
          return;
        }

        // Domain validation: simple regex check for safety (alphanumeric, dashes, dots)
        const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!domainRegex.test(domain)) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ error: "Invalid domain name format" }));
          return;
        }

        const targetDomain = domain.trim().toLowerCase();
        const configPath = path.resolve(ROOT_DIR, "plan/config.json");
        const configContent = readFileSyncWithRetry(configPath, "utf-8");
        const config = JSON.parse(configContent);

        if (!config.sandboxFirewall) {
          config.sandboxFirewall = { allowlistDomains: [] };
        }
        if (!Array.isArray(config.sandboxFirewall.allowlistDomains)) {
          config.sandboxFirewall.allowlistDomains = [];
        }

        const originalList = config.sandboxFirewall.allowlistDomains.map((d) =>
          d.toLowerCase(),
        );
        let updatedList = [...originalList];

        if (action === "allow") {
          if (!updatedList.includes(targetDomain)) {
            updatedList.push(targetDomain);
          }
        } else if (action === "block") {
          updatedList = updatedList.filter((d) => d !== targetDomain);
        }

        config.sandboxFirewall.allowlistDomains = updatedList;

        // Run validation against schemas before writing to config.json
        const val = validateMessage({
          type: "sandboxFirewallConfig",
          ...config.sandboxFirewall,
        });
        if (!val.valid) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(
            JSON.stringify({
              error: `Schema validation failed: ${val.error}`,
            }),
          );
          return;
        }

        writeFileSyncWithRetry(
          configPath,
          JSON.stringify(config, null, 2),
          "utf-8",
        );

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            success: true,
            allowlistDomains: config.sandboxFirewall.allowlistDomains,
          }),
        );
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          sendJson(res, 400, { error: "Invalid JSON payload" });
          return;
        }
        if (err && err.code === "E_BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "Payload Too Large" });
          return;
        }
        sendJson(res, 500, { error: err.message });
      });
    return;
  }

  // SPEC-155: Dynamic outfitting metrics API endpoint
  if (req.method === "GET" && safeUrl === "/api/outfitting/metrics") {
    const outfittingMetrics = [];
    if (options.clients) {
      for (const client of options.clients.values()) {
        if (client.ship) {
          outfittingMetrics.push({
            playerId: client.id,
            name: client.ship.name,
            hullMass:
              client.ship.hullMass !== undefined ? client.ship.hullMass : 2000,
            outfitMass:
              client.ship.outfitMass !== undefined ? client.ship.outfitMass : 0,
            totalMass: client.ship.mass !== undefined ? client.ship.mass : 2000,
            maxOutfitMass:
              client.ship.maxOutfitMass !== undefined
                ? client.ship.maxOutfitMass
                : 3000,
            effectiveTurnRate:
              typeof client.ship.getEffectiveTurnRate === "function"
                ? client.ship.getEffectiveTurnRate()
                : client.ship.turnRate || 2.5,
            effectiveMaxSpeed:
              typeof client.ship.getEffectiveMaxSpeed === "function"
                ? client.ship.getEffectiveMaxSpeed()
                : client.ship.maxSpeed || 300,
            thrustToMass:
              typeof client.ship.getThrustToMassRatio === "function"
                ? client.ship.getThrustToMassRatio()
                : client.ship.thrustPower / (client.ship.mass || 2000),
            chargeDuration:
              typeof client.ship.getEffectiveHyperdriveChargeDuration ===
              "function"
                ? client.ship.getEffectiveHyperdriveChargeDuration()
                : 5,
            outfits: client.ship.outfits || [],
          });
        }
      }
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ ok: true, metrics: outfittingMetrics }));
    return;
  }

  // SPEC-164: Faction War Campaign REST Endpoint
  if (req.method === "GET" && safeUrl === "/api/faction/campaign") {
    // 1. Get query param for room (optional)
    const urlParts = req.url.split("?");
    let roomName = null;
    if (urlParts[1]) {
      const qParams = new URLSearchParams(urlParts[1]);
      roomName = qParams.get("room");
    }

    // 2. Fetch the corresponding game instance
    let gameInstance = null;
    if (roomName && options.instances) {
      gameInstance = options.instances.get(roomName);
    }
    if (!gameInstance && options.instances && options.instances.size > 0) {
      // Fallback to the first active instance
      gameInstance = options.instances.values().next().value;
    }

    // 3. Serialize and return campaign state
    if (gameInstance && gameInstance.factionWarCampaign) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          ok: true,
          ticks: gameInstance.factionWarCampaign.ticks,
          militaryPower: gameInstance.factionWarCampaign.militaryPower,
          activeSieges: gameInstance.factionWarCampaign.activeSieges,
          blockades: gameInstance.factionWarCampaign.blockades,
          battleHistory: gameInstance.factionWarCampaign.battleHistory,
        }),
      );
    } else {
      res.writeHead(404, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          ok: false,
          error:
            "Faction war campaign data not found or no active galaxy instance running.",
        }),
      );
    }
    return;
  }

  // SPEC-153: Secure Interactive Codex CLI sandbox command dispatcher
  if (req.method === "POST" && safeUrl === "/api/sandbox/execute") {
    if (!isAdminAuthorized(req, { adminToken })) {
      sendForbidden(res);
      return;
    }
    let tempFile = null;
    readBodyWithLimit(req, MAX_ADMIN_BODY_BYTES)
      .then(async (body) => {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== "object") {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ error: "Invalid JSON payload" }));
          return;
        }

        const { code } = payload;
        if (typeof code !== "string" || !code.trim()) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ error: "Code parameter is required" }));
          return;
        }

        // Generate temporary script inside the network modules directory
        const randId = Math.random().toString(36).substring(2, 7);
        const tempFilename = `temp_cli_${Date.now()}_${randId}.js`;
        const tempDir = path.join(ROOT_DIR, "src/net");
        tempFile = path.join(tempDir, tempFilename);

        fs.writeFileSync(tempFile, code, "utf-8");

        const result = await GuestRunner.runScript(tempFile, {
          timeoutMs: 5000,
        });

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            error: result.error || null,
          }),
        );
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          sendJson(res, 400, { error: "Invalid JSON payload" });
          return;
        }
        if (err && err.code === "E_BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "Payload Too Large" });
          return;
        }
        sendJson(res, 500, { error: err.message });
      })
      .finally(() => {
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // ignore cleanup failure
          }
        }
      });
    return;
  }

  // SPEC-153: Secure Interactive Codex CLI sandbox process reaper termination trigger
  if (req.method === "POST" && safeUrl === "/api/sandbox/kill") {
    if (!isAdminAuthorized(req, { adminToken })) {
      sendForbidden(res);
      return;
    }
    readBodyWithLimit(req, MAX_ADMIN_BODY_BYTES)
      .then(async (body) => {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== "object") {
          sendJson(res, 400, { error: "Invalid JSON payload" });
          return;
        }

        const { pid } = payload;
        const numericPid = parseInt(String(pid), 10);
        if (isNaN(numericPid) || numericPid <= 0) {
          sendJson(res, 400, { error: "Valid PID parameter is required" });
          return;
        }

        // Only reap process trees this server actually spawned via GuestRunner
        // (activeRuns is keyed by child pid); never an arbitrary attacker-chosen
        // host PID.
        if (!GuestRunner.activeRuns.has(numericPid)) {
          sendJson(res, 403, {
            error: "Refusing to reap a PID not spawned by this server.",
          });
          return;
        }

        // Call the ProcessReaper to kill the child and its grandchildren
        await ProcessReaper.reap(numericPid);

        sendJson(res, 200, {
          success: true,
          message: `Process tree for PID ${numericPid} forcefully reaped.`,
        });
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          sendJson(res, 400, { error: "Invalid JSON payload" });
          return;
        }
        if (err && err.code === "E_BODY_TOO_LARGE") {
          sendJson(res, 413, { error: "Payload Too Large" });
          return;
        }
        sendJson(res, 500, { error: err.message });
      });
    return;
  }

  // Static file serving: allowlist-gated so secrets (.env), VCS internals
  // (.git), config, and persistence snapshots are never served (see
  // src/net/httpSecurity.js#resolveStaticFile).
  const filePath = resolveStaticFile(ROOT_DIR, safeUrl);
  if (!filePath) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let mime = "text/plain";
    if (ext === ".html") mime = "text/html";
    else if (ext === ".css") mime = "text/css";
    else if (ext === ".js") mime = "application/javascript";
    else if (ext === ".json") mime = "application/json";
    else if (ext === ".png") mime = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    else if (ext === ".svg") mime = "image/svg+xml";

    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}
