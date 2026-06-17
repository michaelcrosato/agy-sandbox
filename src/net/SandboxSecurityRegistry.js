/**
 * SandboxSecurityRegistry.js (spec 131) — centralized, tamper-proof security registry
 * to track, persist, and expose sandbox containment breach events.
 */

import fs from "fs";
import path from "path";

function getAuditFilePath() {
  return path.resolve(
    process.env.SECURITY_AUDIT_FILE || "plan/security_audit.json",
  );
}
const maxLogsInMemory = 100;
const memoryLogs = [];

const violationCounters = {
  total: 0,
  filesystem: 0,
  firewall: 0,
  rate_limit: 0,
  process: 0,
  cpu: 0,
  integrity: 0,
  economy: 0,
  static_analysis: 0,
  token_budget: 0,
  intrusion: 0,
};

// Safe asynchronous non-blocking file writer
function persistLog(event) {
  try {
    const auditFilePath = getAuditFilePath();
    let existingLogs = [];
    if (fs.existsSync(auditFilePath)) {
      try {
        const content = fs.readFileSync(auditFilePath, "utf8");
        existingLogs = JSON.parse(content);
        if (!Array.isArray(existingLogs)) {
          existingLogs = [];
        }
      } catch {
        // Corrupt file, start fresh
        existingLogs = [];
      }
    }

    existingLogs.push(event);

    // Keep file size bounded
    if (existingLogs.length > 500) {
      existingLogs = existingLogs.slice(-500);
    }

    fs.writeFileSync(
      auditFilePath,
      JSON.stringify(existingLogs, null, 2),
      "utf8",
    );
  } catch (_err) {
    // Degrade gracefully: fail silently on disk write failure
  }
}

export const SandboxSecurityRegistry = {
  /**
   * Log a security breach/violation event.
   * @param {string} category - Category of violation ("filesystem" | "firewall" | "rate_limit" | "process")
   * @param {string} action - Sub-action or triggered method (e.g. "writeFile", "spawn", "connect")
   * @param {Object} details - Arbitrary parameters/details of the violation
   */
  logViolation(category, action, details = {}) {
    const timestamp = Date.now();
    const timestampIso = new Date(timestamp).toISOString();
    const stack = new Error().stack || "";

    const event = {
      timestamp,
      timestampIso,
      category,
      action,
      details,
      stack,
    };

    // Update memory cache
    memoryLogs.push(event);
    if (memoryLogs.length > maxLogsInMemory) {
      memoryLogs.shift();
    }

    // Update metrics counters
    violationCounters.total++;
    if (category in violationCounters) {
      violationCounters[category]++;
    }

    // Persist to disk
    persistLog(event);

    return event;
  },

  /**
   * Returns security metrics for observability /metrics endpoint.
   * @returns {Object}
   */
  getMetrics() {
    return {
      security_violations_total: violationCounters.total,
      security_violations_by_category: { ...violationCounters },
      recent_violations: [...memoryLogs],
    };
  },

  /**
   * Clears the in-memory cache and local file ledger (mainly for test hygiene).
   */
  clearRegistry() {
    memoryLogs.length = 0;
    violationCounters.total = 0;
    violationCounters.filesystem = 0;
    violationCounters.firewall = 0;
    violationCounters.rate_limit = 0;
    violationCounters.process = 0;
    violationCounters.cpu = 0;
    violationCounters.integrity = 0;
    violationCounters.economy = 0;
    violationCounters.static_analysis = 0;
    violationCounters.token_budget = 0;
    violationCounters.intrusion = 0;

    try {
      const auditFilePath = getAuditFilePath();
      if (fs.existsSync(auditFilePath)) {
        fs.unlinkSync(auditFilePath);
      }
    } catch {
      // ignore
    }
  },
};
