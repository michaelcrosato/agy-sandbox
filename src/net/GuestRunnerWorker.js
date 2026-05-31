/**
 * GuestRunnerWorker.js (SPEC-136) — child-process bootstrap wrapper.
 * Pre-activates all sandbox protections before loading the untrusted guest script.
 */

import path from "path";
import { pathToFileURL } from "url";
import { ProcessSentinel } from "./ProcessSentinel.js";
import { IntegrityGuard } from "./IntegrityGuard.js";

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
    // 1. Initialize and activate boundary containment
    if (sandboxDir) {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(path.resolve(sandboxDir));
    }

    // 2. Lock down global prototypes and monitor scope pollution
    IntegrityGuard.start(25); // High-frequency polling for guest runs

    // Start cumulative CPU watchdog heartbeat (SPEC-140)
    const startCpuUsage = process.cpuUsage();
    const cpuTimer = setInterval(() => {
      const usage = process.cpuUsage(startCpuUsage);
      const cpuTimeMs = (usage.user + usage.system) / 1000;
      if (process.send) {
        process.send({ type: "cpu_heartbeat", cpuTimeMs });
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
