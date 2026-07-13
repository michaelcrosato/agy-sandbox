/**
 * TokenCostGovernor.js (SPEC-174)
 * Centralized LLM API Token Cost Governance & Mock Sentry.
 * Manages runtime budgets, intercepts outbound model queries,
 * and satisfies them locally using deterministic mocks.
 */

import http from "http";
import https from "https";
import { Writable, Readable } from "stream";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const MODEL_PRICING = {
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-3-opus": { input: 15.0, output: 75.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "gemini-3.5-flash": { input: 0.075, output: 0.3 },
  "gpt-4o": { input: 5.0, output: 15.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
};

const DEFAULT_PRICING = { input: 10.0, output: 30.0 };

/** @type {Array<{ regex: RegExp; response: string | Object }>} */
let registeredMocks = [];

let budgetLimitUsd = 0.05; // Default $0.05 budget cap
let tokensSpent = 0;
let usdConsumed = 0.0;

let originalHttpRequest = null;
let originalHttpsRequest = null;
let originalHttpGet = null;
let originalHttpsGet = null;
let originalFetch = null;

/**
 * Automated LLM API Token Cost Governance & Mock Sentry.
 */
export const TokenCostGovernor = {
  /**
   * Registers a mock pattern and its corresponding completed response.
   *
   * @param {RegExp} promptRegex - Regular expression to match inside request body.
   * @param {string | Object} response - Mock completed text or JSON payload.
   */
  registerMock(promptRegex, response) {
    registeredMocks.push({ regex: promptRegex, response });
  },

  /**
   * Clears all registered mocks.
   */
  clearMocks() {
    registeredMocks = [];
  },

  /**
   * Sets the execution budget limit in USD.
   *
   * @param {number} limit
   */
  setBudgetLimitUsd(limit) {
    budgetLimitUsd = limit;
  },

  /**
   * Gets the budget limit in USD.
   *
   * @returns {number}
   */
  getBudgetLimitUsd() {
    return budgetLimitUsd;
  },

  /**
   * Gets the total tokens expended so far.
   *
   * @returns {number}
   */
  getTokensSpent() {
    return tokensSpent;
  },

  /**
   * Gets the total USD consumed so far.
   *
   * @returns {number}
   */
  getUsdConsumed() {
    return usdConsumed;
  },

  /**
   * Resets the accumulated token and cost metrics.
   */
  resetMetrics() {
    tokensSpent = 0;
    usdConsumed = 0.0;
  },

  /**
   * Determines if the accumulated spending exceeds the budget cap.
   *
   * @returns {boolean}
   */
  isBudgetExceeded() {
    return usdConsumed >= budgetLimitUsd;
  },

  /**
   * Checks if the target URL host is a recognized LLM API endpoint.
   *
   * @param {string} urlString
   * @returns {boolean}
   */
  isLlmEndpoint(urlString) {
    try {
      const url = new URL(urlString);
      const host = url.hostname.toLowerCase();
      return (
        host.includes("openai.com") ||
        host.includes("anthropic.com") ||
        host.includes("google.com") ||
        host.includes("googleapis.com")
      );
    } catch {
      return false;
    }
  },

  /**
   * Finds a mock response matching request body text.
   *
   * @param {string} bodyText
   * @returns {string | Object | null}
   */
  findMock(bodyText) {
    for (const mock of registeredMocks) {
      if (mock.regex.test(bodyText)) {
        return mock.response;
      }
    }
    return null;
  },

  /**
   * Approximates token counts from a text payload.
   *
   * @param {string} text
   * @returns {number}
   */
  calculateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  },

  /**
   * Deducts tokens and records cost based on model pricing metadata.
   *
   * @param {string} model
   * @param {number} inputTokens
   * @param {number} outputTokens
   */
  recordQuery(model, inputTokens, outputTokens) {
    const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    const queryCost = inputCost + outputCost;

    tokensSpent += inputTokens + outputTokens;
    usdConsumed += queryCost;
  },

  /**
   * Wraps mock completions into high-fidelity SDK envelopes based on endpoint URL.
   *
   * @param {string} url
   * @param {string | Object} matchedMock
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @returns {Object}
   */
  wrapResponse(url, matchedMock, inputTokens, outputTokens) {
    if (typeof matchedMock !== "string") {
      return matchedMock;
    }

    if (url.includes("anthropic.com")) {
      return {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [
          {
            type: "text",
            text: matchedMock,
          },
        ],
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      };
    }

    if (url.includes("openai.com")) {
      return {
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: matchedMock,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      };
    }

    if (url.includes("googleapis.com") || url.includes("google.com")) {
      return {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: matchedMock,
                },
              ],
              role: "model",
            },
            finish_reason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: inputTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: inputTokens + outputTokens,
        },
      };
    }

    return { response: matchedMock };
  },

  /**
   * Activates global request interception of LLM APIs.
   */
  activate() {
    if (originalHttpRequest) return;

    originalHttpRequest = http.request;
    originalHttpsRequest = https.request;
    originalHttpGet = http.get;
    originalHttpsGet = https.get;

    if (typeof globalThis.fetch === "function") {
      originalFetch = globalThis.fetch;
    }

    // Intercept global fetch
    if (originalFetch) {
      globalThis.fetch = async function (input, init) {
        let urlStr = "";
        if (typeof input === "string") {
          urlStr = input;
        } else if (input instanceof URL) {
          urlStr = input.toString();
        } else if (input && typeof input === "object" && "url" in input) {
          urlStr = input.url;
        }

        if (TokenCostGovernor.isLlmEndpoint(urlStr)) {
          if (TokenCostGovernor.isBudgetExceeded()) {
            SandboxSecurityRegistry.logViolation("token_budget", "query", {
              url: urlStr,
              reason: "LLM API budget exhausted",
            });
            throw new Error("402 Payment Required: LLM API budget exhausted");
          }

          const bodyText = init?.body ? String(init.body) : "";
          const matchedMock = TokenCostGovernor.findMock(bodyText);

          if (matchedMock !== null) {
            let model = "claude-opus-4-8";
            try {
              const bodyObj = JSON.parse(bodyText);
              if (bodyObj.model) model = bodyObj.model;
            } catch {
              // Ignore invalid JSON parsing
            }

            const inputTokens = TokenCostGovernor.calculateTokens(bodyText);
            const outputText =
              typeof matchedMock === "string"
                ? matchedMock
                : JSON.stringify(matchedMock);
            const outputTokens = TokenCostGovernor.calculateTokens(outputText);

            TokenCostGovernor.recordQuery(model, inputTokens, outputTokens);

            const finalResponse = TokenCostGovernor.wrapResponse(
              urlStr,
              matchedMock,
              inputTokens,
              outputTokens,
            );
            const responseBody =
              typeof finalResponse === "string"
                ? finalResponse
                : JSON.stringify(finalResponse);

            return new Response(responseBody, {
              status: 200,
              statusText: "OK",
              headers: new Headers({ "Content-Type": "application/json" }),
            });
          } else {
            // Block unmocked outbound LLM calls in guest sandboxes to protect budget
            throw new Error(
              `400 Bad Request: Outbound LLM API call unmocked and blocked: ${urlStr}`,
            );
          }
        }

        return originalFetch(input, init);
      };
    }

    // Intercept http.request
    http.request = function (options, callback) {
      const urlStr = getUrlFromOptions(options, "http:");
      if (TokenCostGovernor.isLlmEndpoint(urlStr)) {
        return new MockClientRequest(options, callback);
      }
      return originalHttpRequest.call(http, options, callback);
    };

    // Intercept http.get
    http.get = function (options, callback) {
      const req = http.request(options, callback);
      req.end();
      return req;
    };

    // Intercept https.request
    https.request = function (options, callback) {
      const urlStr = getUrlFromOptions(options, "https:");
      if (TokenCostGovernor.isLlmEndpoint(urlStr)) {
        return new MockClientRequest(options, callback);
      }
      return originalHttpsRequest.call(https, options, callback);
    };

    // Intercept https.get
    https.get = function (options, callback) {
      const req = https.request(options, callback);
      req.end();
      return req;
    };
  },

  /**
   * Deactivates interception and restores native http/fetch bindings.
   */
  deactivate() {
    if (!originalHttpRequest) return;

    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
    http.get = originalHttpGet;
    https.get = originalHttpsGet;

    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }

    originalHttpRequest = null;
    originalHttpsRequest = null;
    originalHttpGet = null;
    originalHttpsGet = null;
    originalFetch = null;
  },
};

/**
 * Normalizes connection options to URL string.
 *
 * @param {string | URL | Object} options
 * @param {string} defaultProtocol
 * @returns {string}
 */
function getUrlFromOptions(options, defaultProtocol) {
  if (typeof options === "string") return options;
  if (options instanceof URL) return options.toString();

  const protocol = options.protocol || defaultProtocol;
  const host = options.hostname || options.host || "localhost";
  const port = options.port ? `:${options.port}` : "";
  const path = options.path || "/";
  return `${protocol}//${host}${port}${path}`;
}

/**
 * Mock ClientRequest to simulate HTTP connection flows locally.
 */
class MockClientRequest extends Writable {
  declare callback;
  declare chunks;
  declare options;
  /**
   * @param {Object} options
   * @param {Function} [callback]
   */
  constructor(options, callback) {
    super();
    this.options = options;
    this.callback = callback;
    /** @type {Array<Buffer>} */
    this.chunks = [];
  }

  /**
   * @param {Buffer} chunk
   * @param {string} _encoding
   * @param {Function} callback
   */
  _write(chunk, _encoding, callback) {
    this.chunks.push(chunk);
    callback();
  }

  /**
   * @param {any} [chunk]
   * @param {any} [_encoding]
   * @param {any} [callback]
   * @returns {this}
   */
  end(chunk?: any, _encoding?: any, callback?: any): any {
    let actualCallback = callback;
    if (typeof chunk === "function") {
      actualCallback = chunk;
      chunk = null;
    } else if (typeof _encoding === "function") {
      actualCallback = _encoding;
    }

    if (chunk) {
      this.chunks.push(chunk);
    }
    super.end(actualCallback);

    const bodyText = Buffer.concat(this.chunks).toString("utf8");
    const urlStr = getUrlFromOptions(
      this.options,
      this.options.protocol || "https:",
    );

    if (TokenCostGovernor.isBudgetExceeded()) {
      const err = new Error("402 Payment Required: LLM API budget exhausted");
      (err as any).code = "ENETUNREACH";
      process.nextTick(() => {
        this.emit("error", err);
      });
      return this;
    }

    const matchedMock = TokenCostGovernor.findMock(bodyText);
    if (matchedMock !== null) {
      let model = "claude-opus-4-8";
      try {
        const bodyObj = JSON.parse(bodyText);
        if (bodyObj.model) model = bodyObj.model;
      } catch {
        // Ignore invalid JSON parsing
      }

      const inputTokens = TokenCostGovernor.calculateTokens(bodyText);
      const outputText =
        typeof matchedMock === "string"
          ? matchedMock
          : JSON.stringify(matchedMock);
      const outputTokens = TokenCostGovernor.calculateTokens(outputText);

      TokenCostGovernor.recordQuery(model, inputTokens, outputTokens);

      const finalResponse = TokenCostGovernor.wrapResponse(
        urlStr,
        matchedMock,
        inputTokens,
        outputTokens,
      );
      const responseBody =
        typeof finalResponse === "string"
          ? finalResponse
          : JSON.stringify(finalResponse);

      const resStream = Readable.from([responseBody]);
      (resStream as any).statusCode = 200;
      (resStream as any).statusMessage = "OK";
      (resStream as any).headers = {
        "content-type": "application/json",
      };

      process.nextTick(() => {
        if (this.callback) {
          this.callback(resStream);
        }
        this.emit("response", resStream);
      });
    } else {
      const err = new Error(
        `400 Bad Request: Outbound LLM API call unmocked and blocked: ${urlStr}`,
      );
      (err as any).code = "ENETUNREACH";
      process.nextTick(() => {
        this.emit("error", err);
      });
    }
    return this;
  }

  /**
   * @param {number} _ms
   * @param {Function} [cb]
   * @returns {this}
   */
  setTimeout(_ms, cb) {
    if (cb) process.nextTick(cb);
    return this;
  }

  /**
   * @returns {this}
   */
  abort() {
    return this;
  }
}
