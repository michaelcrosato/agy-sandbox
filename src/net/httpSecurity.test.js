import path from "path";
import {
  isLoopbackAddress,
  safeEqual,
  isAdminAuthorized,
  readBodyWithLimit,
  resolveStaticFile,
  clientIpFromRequest,
} from "./httpSecurity.js";
import { EventEmitter } from "events";

describe("httpSecurity", () => {
  describe("isLoopbackAddress", () => {
    test.each([
      ["127.0.0.1", true],
      ["::1", true],
      ["::ffff:127.0.0.1", true],
      // IPv4-mapped loopback other than the exact string exercises the
      // startsWith("::ffff:127.") branch, not just exact equality.
      ["::ffff:127.0.0.5", true],
      ["127.5.5.5", true],
      ["  ::1  ", true],
      ["10.0.0.1", false],
      ["203.0.113.7", false],
      ["", false],
      [undefined, false],
    ])("%s -> %s", (addr, expected) => {
      expect(isLoopbackAddress(addr)).toBe(expected);
    });
  });

  describe("safeEqual", () => {
    test("true for equal strings", () => {
      expect(safeEqual("hunter2", "hunter2")).toBe(true);
    });
    test("false for different strings (incl. length mismatch)", () => {
      expect(safeEqual("hunter2", "hunter3")).toBe(false);
      expect(safeEqual("short", "a-much-longer-token")).toBe(false);
    });
  });

  describe("isAdminAuthorized", () => {
    const reqFrom = (remoteAddress, headers = {}) => ({
      socket: { remoteAddress },
      headers,
    });

    test("loopback caller is always authorized", () => {
      expect(isAdminAuthorized(reqFrom("127.0.0.1"), {})).toBe(true);
      expect(isAdminAuthorized(reqFrom("::1"), { adminToken: "" })).toBe(true);
    });

    test("remote caller without token is refused", () => {
      expect(isAdminAuthorized(reqFrom("203.0.113.7"), {})).toBe(false);
      expect(
        isAdminAuthorized(reqFrom("203.0.113.7"), { adminToken: "secret" }),
      ).toBe(false);
    });

    test("remote caller with matching token is authorized", () => {
      const req = reqFrom("203.0.113.7", { "x-admin-token": "secret" });
      expect(isAdminAuthorized(req, { adminToken: "secret" })).toBe(true);
    });

    test("remote caller with wrong token is refused", () => {
      const req = reqFrom("203.0.113.7", { "x-admin-token": "nope" });
      expect(isAdminAuthorized(req, { adminToken: "secret" })).toBe(false);
    });
  });

  describe("readBodyWithLimit", () => {
    const makeReq = () => {
      const req = new EventEmitter();
      req.destroy = () => {};
      return req;
    };

    test("resolves with the full body under the limit", async () => {
      const req = makeReq();
      const p = readBodyWithLimit(req, 1024);
      req.emit("data", Buffer.from("hello "));
      req.emit("data", Buffer.from("world"));
      req.emit("end");
      await expect(p).resolves.toBe("hello world");
    });

    test("rejects when the body exceeds the limit", async () => {
      const req = makeReq();
      const p = readBodyWithLimit(req, 4);
      req.emit("data", Buffer.from("too many bytes"));
      await expect(p).rejects.toMatchObject({ code: "E_BODY_TOO_LARGE" });
    });

    test("rejects when the request stream errors", async () => {
      const req = makeReq();
      const p = readBodyWithLimit(req, 1024);
      req.emit("error", new Error("socket hang up"));
      await expect(p).rejects.toThrow("socket hang up");
    });
  });

  describe("resolveStaticFile", () => {
    const root = path.resolve("/srv/app");

    test("serves allowlisted assets", () => {
      expect(resolveStaticFile(root, "/index.html")).toBe(
        path.join(root, "index.html"),
      );
      expect(resolveStaticFile(root, "/")).toBe(path.join(root, "index.html"));
      expect(resolveStaticFile(root, "/src/main.js")).toBe(
        path.join(root, "src/main.js"),
      );
      expect(resolveStaticFile(root, "/dashboard-codex")).toBe(
        path.join(root, "dashboard-codex.html"),
      );
    });

    test("refuses dotfiles, secrets, and VCS internals", () => {
      expect(resolveStaticFile(root, "/.env")).toBeNull();
      expect(resolveStaticFile(root, "/.git/config")).toBeNull();
      expect(resolveStaticFile(root, "/.aiignore")).toBeNull();
    });

    test("refuses non-allowlisted extensions (config, source dumps)", () => {
      expect(resolveStaticFile(root, "/package.json")).toBeNull();
      expect(resolveStaticFile(root, "/plan/config.json")).toBeNull();
      expect(resolveStaticFile(root, "/scripts/run-agent.js")).toBe(
        path.join(root, "scripts/run-agent.js"),
      );
      expect(resolveStaticFile(root, "/README.md")).toBeNull();
    });

    test("refuses sensitive directories and traversal", () => {
      expect(resolveStaticFile(root, "/data/players.json")).toBeNull();
      expect(resolveStaticFile(root, "/node_modules/ws/index.js")).toBeNull();
      expect(resolveStaticFile(root, "/../secret.js")).toBeNull();
      expect(resolveStaticFile(root, "/%2e%2e/secret.js")).toBeNull();
      expect(resolveStaticFile(root, "/foo\0.html")).toBeNull();
    });

    test("denied directory wins even for an allowlisted extension", () => {
      // The prefix check runs before the extension allowlist, so a .js/.html
      // under a sensitive directory is still refused.
      expect(resolveStaticFile(root, "/plan/report.js")).toBeNull();
      expect(resolveStaticFile(root, "/docs/guide.html")).toBeNull();
      expect(resolveStaticFile(root, "/tickets/note.html")).toBeNull();
    });
  });

  describe("clientIpFromRequest", () => {
    test("ignores X-Forwarded-For when proxy is not trusted", () => {
      const req = {
        headers: { "x-forwarded-for": "1.2.3.4" },
        socket: { remoteAddress: "203.0.113.7" },
      };
      expect(clientIpFromRequest(req, { trustProxy: false })).toBe(
        "203.0.113.7",
      );
    });

    test("honors X-Forwarded-For when proxy is trusted", () => {
      const req = {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        socket: { remoteAddress: "10.0.0.1" },
      };
      expect(clientIpFromRequest(req, { trustProxy: true })).toBe("1.2.3.4");
    });

    test("falls back to socket when trusted but no X-Forwarded-For is present", () => {
      const req = { headers: {}, socket: { remoteAddress: "10.0.0.1" } };
      expect(clientIpFromRequest(req, { trustProxy: true })).toBe("10.0.0.1");
    });

    test("falls back to socket when trusted but X-Forwarded-For is blank", () => {
      const req = {
        headers: { "x-forwarded-for": "   " },
        socket: { remoteAddress: "10.0.0.1" },
      };
      expect(clientIpFromRequest(req, { trustProxy: true })).toBe("10.0.0.1");
    });

    test("falls back to unknown with no socket", () => {
      expect(clientIpFromRequest({}, {})).toBe("unknown");
    });
  });
});
