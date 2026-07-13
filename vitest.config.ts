import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// Unified Vitest runner (Phase 1 of the TypeScript migration): a single config
// with three projects replaces the former split between `vitest.config.js`
// (client jsdom) and `vitest.browser.config.js` (client Chromium). Vitest now
// owns the entire suite that Jest previously ran.
//
// - node:    pure engine/net/physics/persistence/server suites and the
//            `scripts/agent` control-plane tests. Uses the `vmForks` pool: like
//            Jest, it runs each test file in its own V8 vm realm, so suites that
//            freeze/monkey-patch core builtins (e.g. IntegrityGuard) or boot
//            `dist/server.js` in worker_threads stay isolated from each other
//            and from the runner itself.
// - jsdom:   client DOM units under `src/client/**` (excludes browser specs).
// - browser: canvas/CSS specs that need a real Chromium via Playwright.
//
// `globals: false` everywhere — every spec imports its test API explicitly from
// "vitest", matching the client suites that already did so.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          globals: false,
          environment: "node",
          // Restore process.env after each file so env writes don't leak across
          // files sharing a reused fork (Jest isolated process per file).
          setupFiles: ["./vitest.setup.node.js"],
          // `scripts/**` is included because the agent control-plane tests
          // (generate-codex, loop-monitor, validate-specs) ran under Jest too.
          include: ["src/**/*.test.{js,ts}", "scripts/**/*.test.js"],
          exclude: ["src/client/**", "**/node_modules/**"],
          pool: "vmForks",
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: "jsdom",
          globals: false,
          environment: "jsdom",
          include: ["src/client/**/*.test.js"],
          exclude: ["src/client/**/*.browser.test.js", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "browser",
          globals: false,
          include: ["src/client/**/*.browser.test.js"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            headless: true,
          },
        },
      },
    ],
  },
});
