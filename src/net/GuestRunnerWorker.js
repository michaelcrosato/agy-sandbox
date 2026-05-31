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

    // 3. Dynamically import and execute the guest script under active containment
    const resolvedScriptUrl = pathToFileURL(path.resolve(scriptPath)).href;
    await import(resolvedScriptUrl);

    // 4. Report clean exit
    if (process.send) {
      process.send({ status: "success" });
    }
    process.exit(0);
  } catch (err) {
    if (process.send) {
      process.send({ status: "error", error: err.message, stack: err.stack });
    }
    process.exit(1);
  }
}

bootstrap();
