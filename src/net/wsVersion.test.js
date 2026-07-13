import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * spec 027 — `ws` security-floor guard for **CVE-2026-45736**.
 *
 * CVE-2026-45736 is an uninitialized-memory disclosure in `ws`
 * `websocket.close()` when a TypedArray is passed as the `reason` argument —
 * the function transmits uninitialized buffer memory to the peer. It is
 * **fixed in ws 8.20.1**. This repo pins `ws ^8.21.0`, comfortably above the
 * floor (and `npm audit` is clean), so there is no active exposure. This test
 * makes the floor **enforceable**: if a future change ever resolves `ws` below
 * 8.20.1, the gate goes red.
 */

const WS_CVE_FLOOR = "8.20.1";

/** Parses an "x.y.z" core version (dropping any prerelease/build suffix). */
function parseVersion(v) {
  const core = String(v).split("-")[0].split("+")[0];
  return core.split(".").map((n) => parseInt(n, 10) || 0);
}

/** True if semver-core `a` is >= semver-core `b`. */
function gte(a, b) {
  const A = parseVersion(a);
  const B = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] > B[i]) return true;
    if (A[i] < B[i]) return false;
  }
  return true;
}

describe("ws security floor (CVE-2026-45736)", () => {
  test("the installed ws version is at or above the 8.20.1 fix", () => {
    // Read the resolved package.json from node_modules rather than the range in
    // package.json, so this asserts what actually ships, not what is requested.
    const wsPkgUrl = new URL(
      "../../node_modules/ws/package.json",
      import.meta.url,
    );
    const wsPkg = JSON.parse(readFileSync(wsPkgUrl, "utf8"));
    expect(typeof wsPkg.version).toBe("string");
    expect(gte(wsPkg.version, WS_CVE_FLOOR)).toBe(true);
  });

  test("the semver comparator handles the relevant boundaries", () => {
    expect(gte("8.21.0", WS_CVE_FLOOR)).toBe(true);
    expect(gte("8.20.1", WS_CVE_FLOOR)).toBe(true);
    expect(gte("8.20.0", WS_CVE_FLOOR)).toBe(false);
    expect(gte("9.0.0", WS_CVE_FLOOR)).toBe(true);
    expect(gte("7.99.99", WS_CVE_FLOOR)).toBe(false);
  });
});
