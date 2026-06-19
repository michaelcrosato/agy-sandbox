import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolve } from "./GuestLoader.js";
import { ProcessSentinel } from "./ProcessSentinel.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

describe("GuestLoader resolving", () => {
  const tempFilePath = path.resolve("src/net/temp_guest_loader_module.js");
  let tempFileHash = "";

  beforeAll(() => {
    fs.writeFileSync(tempFilePath, "console.log('temp module');", "utf8");
    tempFileHash = crypto
      .createHash("sha256")
      .update("console.log('temp module');")
      .digest("hex");
  });

  afterAll(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
    jest.restoreAllMocks();
    delete process.env.GUEST_ALLOWED_MODULE_HASHES;
  });

  test("should allow safe native core modules without restrictions", async () => {
    const nextResolve = jest.fn().mockResolvedValue({ url: "node:path" });
    const result = await resolve("node:path", {}, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith("node:path", {});
    expect(result).toEqual({ url: "node:path" });
  });

  test("should reject restricted native core modules and log violations", async () => {
    const nextResolve = jest.fn();
    const logSpy = jest.spyOn(SandboxSecurityRegistry, "logViolation");

    await expect(
      resolve("node:child_process", {}, nextResolve),
    ).rejects.toThrow(
      "ESM Import Violation: Access to native core module [node:child_process] is restricted",
    );
    expect(nextResolve).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "integrity",
      "native_import_violation",
      {
        specifier: "node:child_process",
      },
    );
  });

  test("should enforce path boundary constraints", async () => {
    const nextResolve = jest.fn().mockResolvedValue({
      url: `file:///${path.resolve("src/net/../../secret.js").replace(/\\/g, "/")}`,
    });
    const checkPathSpy = jest
      .spyOn(ProcessSentinel, "checkPath")
      .mockImplementation(() => {
        throw new Error("Path boundary violation");
      });

    await expect(resolve("../../secret.js", {}, nextResolve)).rejects.toThrow(
      "ESM Import Violation: Path boundary violation",
    );
    expect(checkPathSpy).toHaveBeenCalled();
  });

  test("should reject modules that are not registered in GUEST_ALLOWED_MODULE_HASHES", async () => {
    const nextResolve = jest.fn().mockResolvedValue({
      url: `file:///${tempFilePath.replace(/\\/g, "/")}`,
    });
    const logSpy = jest.spyOn(SandboxSecurityRegistry, "logViolation");

    // Enable path jailing bypass in spy so it goes to hash check
    jest.spyOn(ProcessSentinel, "checkPath").mockImplementation(() => {});

    await expect(
      resolve("./temp_guest_loader_module.js", {}, nextResolve),
    ).rejects.toThrow("Cryptographic Signature Mismatch for module");
    expect(logSpy).toHaveBeenCalledWith(
      "integrity",
      "module_integrity_violation",
      {
        path: tempFilePath,
        expectedHash: null,
        actualHash: tempFileHash,
      },
    );
  });

  test("should reject modules with mismatched cryptographic hashes", async () => {
    const nextResolve = jest.fn().mockResolvedValue({
      url: `file:///${tempFilePath.replace(/\\/g, "/")}`,
    });
    const logSpy = jest.spyOn(SandboxSecurityRegistry, "logViolation");
    jest.spyOn(ProcessSentinel, "checkPath").mockImplementation(() => {});

    process.env.GUEST_ALLOWED_MODULE_HASHES = JSON.stringify({
      [tempFilePath]: "wrong_hash_here",
    });

    await expect(
      resolve("./temp_guest_loader_module.js", {}, nextResolve),
    ).rejects.toThrow("Cryptographic Signature Mismatch for module");
    expect(logSpy).toHaveBeenCalledWith(
      "integrity",
      "module_integrity_violation",
      {
        path: tempFilePath,
        expectedHash: "wrong_hash_here",
        actualHash: tempFileHash,
      },
    );
  });

  test("should successfully resolve modules with matching hashes", async () => {
    const nextResolve = jest.fn().mockResolvedValue({
      url: `file:///${tempFilePath.replace(/\\/g, "/")}`,
    });
    jest.spyOn(ProcessSentinel, "checkPath").mockImplementation(() => {});

    process.env.GUEST_ALLOWED_MODULE_HASHES = JSON.stringify({
      [tempFilePath]: tempFileHash,
    });

    const result = await resolve(
      "./temp_guest_loader_module.js",
      {},
      nextResolve,
    );
    expect(result).toEqual({
      url: `file:///${tempFilePath.replace(/\\/g, "/")}`,
    });
  });
});
