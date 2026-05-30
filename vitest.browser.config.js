import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// Dedicated browser-only test runner (spec 035).
// Runs in a real Chromium headless instance using Playwright, permitting
// visual/canvas and computed CSS tests that jsdom cannot support.
export default defineConfig({
  test: {
    include: ["src/client/**/*.browser.test.js"],
    globals: false,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
    },
  },
});
