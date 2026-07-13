import { describe, test, expect, beforeEach, afterEach } from "vitest";
/**
 * TokenCostGovernor.test.js
 * Jest unit tests for the TokenCostGovernor sentry.
 */

import { TokenCostGovernor } from "./TokenCostGovernor.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import https from "https";

describe("TokenCostGovernor", () => {
  beforeEach(() => {
    TokenCostGovernor.resetMetrics();
    TokenCostGovernor.clearMocks();
    TokenCostGovernor.setBudgetLimitUsd(0.05);
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    TokenCostGovernor.deactivate();
    TokenCostGovernor.clearMocks();
  });

  test("should register and match mock prompts", () => {
    TokenCostGovernor.registerMock(/hello/i, "Hello there!");
    TokenCostGovernor.registerMock(/buy sector (\d+)/i, { success: true });

    expect(TokenCostGovernor.findMock("Hello guest")).toBe("Hello there!");
    expect(TokenCostGovernor.findMock("Please buy sector 12")).toEqual({
      success: true,
    });
    expect(TokenCostGovernor.findMock("unmatched prompt")).toBeNull();
  });

  test("should compute correct token counts based on length heuristics", () => {
    expect(TokenCostGovernor.calculateTokens("")).toBe(0);
    expect(TokenCostGovernor.calculateTokens("abcd")).toBe(1);
    expect(TokenCostGovernor.calculateTokens("abcdefgh")).toBe(2);
  });

  test("should track spending and enforce budget limit", () => {
    // Pricing for claude-opus-4-8: input $5.00/1M, output $25.00/1M
    // Let's do 1,000,000 input tokens ($5.00) and 2,000,000 output tokens ($50.00)
    TokenCostGovernor.recordQuery("claude-opus-4-8", 1000000, 2000000);

    expect(TokenCostGovernor.getTokensSpent()).toBe(3000000);
    expect(TokenCostGovernor.getUsdConsumed()).toBe(55.0);
    expect(TokenCostGovernor.isBudgetExceeded()).toBe(true);
  });

  test("should wrap response envelopes dynamically by destination URL", () => {
    const matchedMock = "Interstellar drive online.";

    // Claude / Anthropic
    const anthropicWrap = TokenCostGovernor.wrapResponse(
      "https://api.anthropic.com/v1/messages",
      matchedMock,
      10,
      20,
    );
    expect(anthropicWrap.model).toBe("claude-opus-4-8");
    expect(anthropicWrap.content[0].text).toBe(matchedMock);

    // OpenAI
    const openaiWrap = TokenCostGovernor.wrapResponse(
      "https://api.openai.com/v1/chat/completions",
      matchedMock,
      15,
      25,
    );
    expect(openaiWrap.choices[0].message.content).toBe(matchedMock);

    // Gemini / Google
    const googleWrap = TokenCostGovernor.wrapResponse(
      "https://generativelanguage.googleapis.com/v1beta/models",
      matchedMock,
      5,
      10,
    );
    expect(googleWrap.candidates[0].content.parts[0].text).toBe(matchedMock);

    // Unknown wrapper fallback
    const fallbackWrap = TokenCostGovernor.wrapResponse(
      "https://example.com/api",
      matchedMock,
      5,
      5,
    );
    expect(fallbackWrap).toEqual({ response: matchedMock });
  });

  test("should intercept global fetch successfully with mock completions", async () => {
    TokenCostGovernor.activate();
    TokenCostGovernor.registerMock(/get coords/i, "Coordinates: [12, 45]");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "get coords" }],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.choices[0].message.content).toBe("Coordinates: [12, 45]");
    expect(TokenCostGovernor.getTokensSpent()).toBeGreaterThan(0);
    expect(TokenCostGovernor.getUsdConsumed()).toBeGreaterThan(0);
  });

  test("should throw Payment Required error in fetch if budget is exceeded", async () => {
    TokenCostGovernor.activate();
    TokenCostGovernor.setBudgetLimitUsd(0.01);
    TokenCostGovernor.recordQuery("claude-opus-4-8", 5000, 5000); // Exceeds budget

    expect(TokenCostGovernor.isBudgetExceeded()).toBe(true);

    await expect(
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    ).rejects.toThrow(/Payment Required/);

    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_by_category.token_budget).toBe(1);
  });

  test("should intercept http/https requests successfully using mock response streams", () =>
    new Promise((resolve) => {
      TokenCostGovernor.activate();
      TokenCostGovernor.registerMock(/tell me joke/i, "Space joke here.");

      const req = https.request(
        {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            const json = JSON.parse(data);
            expect(json.content[0].text).toBe("Space joke here.");
            resolve();
          });
        },
      );

      req.write(JSON.stringify({ prompt: "tell me joke" }));
      req.end();
    }));

  test("should emit error on http/https request when budget is exceeded", () =>
    new Promise((resolve) => {
      TokenCostGovernor.activate();
      TokenCostGovernor.setBudgetLimitUsd(0.001);
      TokenCostGovernor.recordQuery("claude-opus-4-8", 1000, 1000); // Exceeds budget

      const req = https.request({
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
      });

      req.on("error", (err) => {
        expect(err.message).toContain("Payment Required");
        resolve();
      });

      req.write(JSON.stringify({ prompt: "hello" }));
      req.end();
    }));
});
