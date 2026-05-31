import { fileURLToPath } from "node:url";
import { ProcessSentinel } from "./ProcessSentinel.js";

/**
 * GuestLoader.js (SPEC-144) — ESM Import Loader Hook.
 * Intercepts dynamic and static imports inside the guest process, asserting strict path boundaries.
 */
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);

  if (resolved && resolved.url && resolved.url.startsWith("file://")) {
    const filePath = fileURLToPath(resolved.url);
    try {
      ProcessSentinel.checkPath(filePath, false);
    } catch (err) {
      throw new Error(
        `[SECURITY ACCESS DENIED] ESM Import Violation: ${err.message}`,
        { cause: err },
      );
    }
  }

  return resolved;
}
