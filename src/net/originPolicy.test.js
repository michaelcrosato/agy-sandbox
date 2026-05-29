import { isAllowedOrigin } from "./originPolicy.js";

describe("originPolicy.isAllowedOrigin (spec 002)", () => {
  test("allows connections with no Origin (non-browser tools) by default", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin(null)).toBe(true);
    expect(isAllowedOrigin("")).toBe(true);
  });

  test("can forbid no-Origin when allowNoOrigin is false", () => {
    expect(isAllowedOrigin(undefined, { allowNoOrigin: false })).toBe(false);
  });

  test("allows same-origin (page host equals ws host)", () => {
    expect(
      isAllowedOrigin("http://localhost:8080", { host: "localhost:8080" }),
    ).toBe(true);
    // Works for any tunnel host automatically.
    expect(
      isAllowedOrigin("https://abc.trycloudflare.com", {
        host: "abc.trycloudflare.com",
      }),
    ).toBe(true);
  });

  test("rejects a cross-site origin with no allowlist", () => {
    expect(
      isAllowedOrigin("https://evil.example", { host: "localhost:8080" }),
    ).toBe(false);
  });

  test("honors an allowlist of full origins or bare hosts", () => {
    expect(
      isAllowedOrigin("https://game.example", {
        host: "server.internal",
        allow: ["https://game.example"],
      }),
    ).toBe(true);
    expect(
      isAllowedOrigin("https://game.example", {
        host: "server.internal",
        allow: ["game.example"],
      }),
    ).toBe(true);
    expect(
      isAllowedOrigin("https://other.example", {
        host: "server.internal",
        allow: ["game.example"],
      }),
    ).toBe(false);
  });

  test('wildcard "*" allows any origin', () => {
    expect(isAllowedOrigin("https://anything.example", { allow: ["*"] })).toBe(
      true,
    );
  });

  test("is case-insensitive on origin and host", () => {
    expect(
      isAllowedOrigin("HTTP://Localhost:8080", { host: "localhost:8080" }),
    ).toBe(true);
  });
});
