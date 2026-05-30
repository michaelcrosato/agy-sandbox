import { defineConfig } from "vitest/config";

// Client-only test runner (spec 021). Kept entirely separate from the Jest
// engine suite: Vitest owns the browser-ish DOM units under `src/client/**`
// using the jsdom environment, while Jest keeps owning the pure `src/**`
// engine/net/physics suites. `jest.config.json` ignores `/src/client/` so the
// two runners never pick up each other's files, and `npm run agent:check`
// (Jest) stays independent of `npm run test:client` (Vitest).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/client/**/*.test.js"],
    // Explicit imports from "vitest" in each spec — no implicit globals.
    globals: false,
  },
});
