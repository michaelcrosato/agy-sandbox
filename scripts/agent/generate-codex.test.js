import { describe, test, expect } from "vitest";
import { generateCodexGraph, run } from "./generate-codex.js";
import fs from "fs";
import path from "path";

describe("Living Codex & Codebase Ontology Generator (SPEC-101)", () => {
  test("successfully scans the codebase and builds the knowledge graph", () => {
    const graph = generateCodexGraph();

    // Verify presence of high-level keys
    expect(graph).toHaveProperty("generatedAt");
    expect(graph).toHaveProperty("stats");
    expect(graph).toHaveProperty("files");
    expect(graph).toHaveProperty("specs");
    expect(graph).toHaveProperty("epistemicDebt");

    // Verify stats properties
    expect(graph.stats).toHaveProperty("totalSourceFiles");
    expect(graph.stats).toHaveProperty("totalTestFiles");
    expect(graph.stats).toHaveProperty("totalSpecFiles");
    expect(graph.stats).toHaveProperty("totalLoc");
    expect(graph.stats).toHaveProperty("totalTests");

    // Confirm that we have successfully scanned core files
    expect(graph.stats.totalSourceFiles).toBeGreaterThan(0);
    expect(graph.stats.totalTestFiles).toBeGreaterThan(0);
    expect(graph.stats.totalSpecFiles).toBeGreaterThan(0);

    // Verify that file objects contain path, loc, classes, exports
    const apiRateLimiterFile = graph.files.find(
      (f) => f.path === "src/net/ApiRateLimiter.ts",
    );
    if (apiRateLimiterFile) {
      expect(apiRateLimiterFile).toHaveProperty("path");
      expect(apiRateLimiterFile).toHaveProperty("loc");
      expect(apiRateLimiterFile).toHaveProperty("fileOverview");
      expect(apiRateLimiterFile.classes.length).toBeGreaterThan(0);
      expect(apiRateLimiterFile.classes[0].name).toBe("ApiRateLimiter");
      expect(apiRateLimiterFile.testFile).toContain(
        "src/net/ApiRateLimiter.test.ts",
      );
    }
  });

  test("correctly reports untested files and missing JSDocs under epistemic debt", () => {
    const graph = generateCodexGraph();

    expect(graph.epistemicDebt).toHaveProperty("untestedCoreFiles");
    expect(graph.epistemicDebt).toHaveProperty("missingJsDocs");
    expect(graph.epistemicDebt).toHaveProperty("staleSpecReferences");

    // Untested core files array should be properly formed
    expect(Array.isArray(graph.epistemicDebt.untestedCoreFiles)).toBe(true);

    // If there is any missing JSDocs, check its structure
    if (graph.epistemicDebt.missingJsDocs.length > 0) {
      const entry = graph.epistemicDebt.missingJsDocs[0];
      expect(entry).toHaveProperty("path");
      expect(entry).toHaveProperty("symbols");
      expect(Array.isArray(entry.symbols)).toBe(true);
      expect(entry.symbols[0]).toHaveProperty("name");
      expect(entry.symbols[0]).toHaveProperty("type");
      expect(entry.symbols[0]).toHaveProperty("line");
    }
  });

  test("writes REPO_MAP.md during synchronization", () => {
    // REPO_MAP.md is a generated (gitignored) artifact, so drive the generator
    // and assert it produced the file — including creating docs/ai/ if a fresh
    // clone doesn't have it yet.
    run();
    const repoMapPath = path.resolve("docs/ai/REPO_MAP.md");
    expect(fs.existsSync(repoMapPath)).toBe(true);
    const content = fs.readFileSync(repoMapPath, "utf8");
    expect(content).toContain("# Repo Map (for agents)");
    expect(content).toContain("## Core product logic");
  });
});
