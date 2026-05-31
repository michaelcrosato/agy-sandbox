/**
 * GuestRunnerWorker.js (SPEC-136) — child-process bootstrap wrapper.
 * Pre-activates all sandbox protections before loading the untrusted guest script.
 */

import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { register } from "node:module";
import { ProcessSentinel } from "./ProcessSentinel.js";
import { IntegrityGuard } from "./IntegrityGuard.js";
import { SandboxFirewall, activateFirewall } from "./SandboxFirewall.js";

async function bootstrap() {
  const scriptPath = process.env.GUEST_SCRIPT_PATH;
  const sandboxDir = process.env.GUEST_SANDBOX_DIR;

  if (!scriptPath) {
    console.error(
      "❌ [GUEST WORKER] Missing GUEST_SCRIPT_PATH environment parameter.",
    );
    process.exit(1);
  }

  try {
    // 0. Register secure ESM dynamic loader sentry (SPEC-144)
    const loaderPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "GuestLoader.js",
    );
    register(pathToFileURL(loaderPath).href);

    // 1. Initialize and activate boundary containment
    if (sandboxDir) {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(path.resolve(sandboxDir));
    }

    // 1.5 Pre-activate zero-trust network containment firewall (SPEC-143)
    const firewall = new SandboxFirewall({ allowlistDomains: [] });
    activateFirewall(firewall);

    // 2. Lock down global prototypes and monitor scope pollution
    IntegrityGuard.start(25); // High-frequency polling for guest runs

    // Start cumulative CPU watchdog heartbeat (SPEC-140)
    const startCpuUsage = process.cpuUsage();
    const cpuTimer = setInterval(() => {
      const usage = process.cpuUsage(startCpuUsage);
      const cpuTimeMs = (usage.user + usage.system) / 1000;
      const memUsage = process.memoryUsage();
      if (process.send) {
        process.send({
          type: "cpu_heartbeat",
          cpuTimeMs,
          rssBytes: memUsage.rss,
          heapUsedBytes: memUsage.heapUsed,
          heapTotalBytes: memUsage.heapTotal,
        });
      }
    }, 50);
    cpuTimer.unref();

    // 3. Dynamically import and execute the guest script under active containment
    const resolvedScriptUrl = pathToFileURL(path.resolve(scriptPath)).href;
    await import(resolvedScriptUrl);
  } catch (err) {
    if (process.send) {
      process.send({ status: "error", error: err.message, stack: err.stack });
    }
    process.exit(1);
  }
}

bootstrap();
