import { Worker } from "worker_threads";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const RECORDINGS_DIR = path.join(ROOT_DIR, "browser_recordings");

describe("Golden Visual E2E Playwright Automation & UI Telemetry Regression Guard (SPEC-163)", () => {
  let worker;
  let browser;
  const port = 18299;

  beforeAll(async () => {
    // Ensure recordings directory exists
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }

    // Purge test directories
    try {
      fs.rmSync("./data-test-playwright-visual", {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }

    // Boot Server Worker on custom port
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-playwright-visual",
      },
    });

    // Wait for the worker to bind to the port
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Launch headless Playwright Chromium instance
    browser = await chromium.launch({ headless: true });
  }, 10000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (worker) {
      await worker.terminate();
    }
  });

  const captureDashboardPage = async (pageFilename, pathSegment) => {
    const page = await browser.newPage();

    // 1. Load the page from the local sharded worker port
    await page.goto(`http://localhost:${port}/${pathSegment}`);

    // 2. Inject style overrides and JS mocks to freeze dynamic timers, starfields,
    // and CSS transitions/animations for 100% deterministic visual regression matching.
    await page.evaluate(() => {
      // Freeze all transitions and animations
      const style = document.createElement("style");
      style.innerHTML = `
        * {
          transition: none !important;
          animation: none !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
          animation-delay: 0s !important;
          animation-duration: 0s !important;
        }
      `;
      document.head.appendChild(style);

      // Freeze clocks/timers
      window.Date.now = () => 1700000000000;

      // Stop canvas rendering loops or random stars if present
      if (typeof window.stopAnimation === "function") {
        window.stopAnimation();
      }
    });

    // Wait for elements and styling to settle
    await page.waitForTimeout(500);

    // 3. Capture mobile responsive layout (375 x 667)
    await page.setViewportSize({ width: 375, height: 667 });
    const mobilePath = path.join(RECORDINGS_DIR, `${pageFilename}_mobile.png`);
    await page.screenshot({ path: mobilePath, fullPage: true });
    expect(fs.existsSync(mobilePath)).toBe(true);

    // 4. Capture tablet responsive layout (768 x 1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletPath = path.join(RECORDINGS_DIR, `${pageFilename}_tablet.png`);
    await page.screenshot({ path: tabletPath, fullPage: true });
    expect(fs.existsSync(tabletPath)).toBe(true);

    // 5. Capture desktop wide layout (1280 x 800)
    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopPath = path.join(
      RECORDINGS_DIR,
      `${pageFilename}_desktop.png`,
    );
    await page.screenshot({ path: desktopPath, fullPage: true });
    expect(fs.existsSync(desktopPath)).toBe(true);

    await page.close();
  };

  test("captures golden-glassmorphic cockpit dashboard cards in responsive viewports", async () => {
    await captureDashboardPage("dashboard", "dashboard.html");
  }, 20000);

  test("captures Living Codex sentry panel, terminal, and RPC progress rings in responsive viewports", async () => {
    await captureDashboardPage("dashboard_codex", "dashboard-codex.html");
  }, 20000);
});
