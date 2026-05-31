import fs from "fs";
import path from "path";
import { validateMessage } from "./SchemaValidator.js";

/**
 * Monitors and hot-reloads configurations from a target file (defaults to `plan/config.json`).
 * Features a zero-downtime secure design that validates properties through the SchemaValidator
 * before applying updates to active registry, firewall, and rate limiter instances,
 * safely swallowing any syntax errors.
 */
export class ConfigWatcher {
  /**
   * @param {string} filePath - Absolute or relative path to watch on disk.
   * @param {object} [targets] - Group of live instances to propagate reloads.
   * @param {object} [targets.apiRateLimiter] - The Outbound API rate limiter.
   * @param {object} [targets.sandboxFirewall] - The Outbound DNS/socket firewall.
   * @param {object} [targets.wsRateLimitConfig] - Dynamic WebSocket message rate limit configuration reference.
   * @param {Map<string, object>} [targets.instances] - active GameInstance instances to dynamically tune standings coefficients.
   */
  constructor(filePath, targets = {}) {
    this.filePath = path.resolve(filePath);
    this.targets = targets;
    this.watcher = null;
    this.reloadCount = 0;
    this.lastReloadTime = 0;
    this.debounceTimeout = null;
  }

  /**
   * Starts watching the target configuration file.
   */
  start() {
    if (this.watcher) return;

    // Trigger initial load if the file already exists on startup
    if (fs.existsSync(this.filePath)) {
      this.loadAndApply();
    }

    try {
      this.watcher = fs.watch(this.filePath, (eventType) => {
        if (eventType === "change" || eventType === "rename") {
          if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
          }
          this.debounceTimeout = setTimeout(() => {
            this.loadAndApply();
          }, 100);
        }
      });
    } catch (err) {
      console.error(
        `⚠️ [CONFIG WATCHER] Failed to initiate fs.watch for ${this.filePath}:`,
        err.message,
      );
    }
  }

  /**
   * Stops watching the configuration file and clears any debouncing timeouts.
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
  }

  /**
   * Loads configurations from the file path, parses JSON, performs structure-safety checks,
   * and dynamically updates live instances.
   *
   * @returns {boolean} True if reload was successfully parsed, validated, and propagated.
   */
  loadAndApply() {
    try {
      if (!fs.existsSync(this.filePath)) {
        console.warn(
          `⚠️ [CONFIG WATCHER] Config file does not exist at: ${this.filePath}`,
        );
        return false;
      }

      const content = fs.readFileSync(this.filePath, "utf-8");
      if (!content.trim()) return false;

      let config;
      try {
        config = JSON.parse(content);
      } catch (parseErr) {
        console.error(
          `❌ [CONFIG WATCHER] JSON syntax error:`,
          parseErr.message,
        );
        return false;
      }

      // Structure-safety validation using zero-trust SchemaValidator wrappers
      if (config.apiRateLimit) {
        const val = validateMessage({
          type: "apiRateLimitConfig",
          ...config.apiRateLimit,
        });
        if (!val.valid) {
          console.error(
            `❌ [CONFIG WATCHER] Invalid apiRateLimit configuration:`,
            val.error,
          );
          return false;
        }
      }

      if (config.sandboxFirewall) {
        const val = validateMessage({
          type: "sandboxFirewallConfig",
          ...config.sandboxFirewall,
        });
        if (!val.valid) {
          console.error(
            `❌ [CONFIG WATCHER] Invalid sandboxFirewall configuration:`,
            val.error,
          );
          return false;
        }
      }

      if (config.wsRateLimit) {
        const val = validateMessage({
          type: "wsRateLimitConfig",
          ...config.wsRateLimit,
        });
        if (!val.valid) {
          console.error(
            `❌ [CONFIG WATCHER] Invalid wsRateLimit configuration:`,
            val.error,
          );
          return false;
        }
      }

      if (config.standings) {
        const val = validateMessage({
          type: "standingsConfig",
          ...config.standings,
        });
        if (!val.valid) {
          console.error(
            `❌ [CONFIG WATCHER] Invalid standings configuration:`,
            val.error,
          );
          return false;
        }
      }

      this.apply(config);
      this.reloadCount++;
      this.lastReloadTime = Date.now();
      console.log(
        `✅ [CONFIG WATCHER] Successfully hot-reloaded configuration from ${this.filePath} (Reload #${this.reloadCount})`,
      );
      return true;
    } catch (err) {
      console.error(
        `❌ [CONFIG WATCHER] Unexpected error during configuration reload:`,
        err.message,
      );
      return false;
    }
  }

  /**
   * Applies the parsed and validated config parameters to active targets.
   *
   * @param {object} config
   */
  apply(config) {
    // 1. Outbound API rate limits
    if (config.apiRateLimit && this.targets.apiRateLimiter) {
      const limiter = this.targets.apiRateLimiter;
      if (config.apiRateLimit.maxPerMinute !== undefined) {
        limiter.maxPerMinute = config.apiRateLimit.maxPerMinute;
      }
      if (config.apiRateLimit.maxPerHour !== undefined) {
        limiter.maxPerHour = config.apiRateLimit.maxPerHour;
      }
      if (config.apiRateLimit.allowlistDomains !== undefined) {
        limiter.allowlistDomains = config.apiRateLimit.allowlistDomains.map(
          (d) => d.toLowerCase(),
        );
      }
    }

    // 2. Outbound firewall egress rules
    if (config.sandboxFirewall && this.targets.sandboxFirewall) {
      const firewall = this.targets.sandboxFirewall;
      if (config.sandboxFirewall.allowlistDomains !== undefined) {
        firewall.allowlistDomains = config.sandboxFirewall.allowlistDomains.map(
          (d) => d.toLowerCase(),
        );
      }
    }

    // 3. Inbound WebSocket message rate limits
    if (config.wsRateLimit && this.targets.wsRateLimitConfig) {
      if (config.wsRateLimit.maxPerSecond !== undefined) {
        this.targets.wsRateLimitConfig.maxPerSecond =
          config.wsRateLimit.maxPerSecond;
      }
    }

    // 4. Standings options on live FactionRegistry contexts
    if (config.standings) {
      if (this.targets.instances) {
        for (const room of this.targets.instances.values()) {
          if (room.factionRegistry) {
            room.factionRegistry.options = {
              ...room.factionRegistry.options,
              ...config.standings,
            };
          }
        }
      }
    }
  }
}
