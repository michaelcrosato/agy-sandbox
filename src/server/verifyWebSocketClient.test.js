import { verifyWebSocketClient, connectionFloodSentry } from "../server.js";
import { jest } from "@jest/globals";

describe("verifyWebSocketClient", () => {
  beforeEach(() => {
    connectionFloodSentry.reset();
  });

  test("rejects request if URI length exceeds 2048", () => {
    const mockCb = jest.fn();
    const mockInfo = {
      origin: "http://localhost:8080",
      req: {
        url: "/" + "a".repeat(2048), // Total length 2049
        headers: {
          host: "localhost:8080",
        },
      },
    };

    verifyWebSocketClient(mockInfo, mockCb);
    expect(mockCb).toHaveBeenCalledWith(false, 414, "URI Too Long");
  });

  test("rejects request if Content-Length exceeds 4096", () => {
    const mockCb = jest.fn();
    const mockInfo = {
      origin: "http://localhost:8080",
      req: {
        url: "/",
        headers: {
          host: "localhost:8080",
          "content-length": "4097",
        },
      },
    };

    verifyWebSocketClient(mockInfo, mockCb);
    expect(mockCb).toHaveBeenCalledWith(false, 413, "Payload Too Large");
  });

  test("allows valid request when headers and limits are normal", () => {
    const mockCb = jest.fn();
    const mockInfo = {
      origin: "http://localhost:8080",
      req: {
        url: "/",
        headers: {
          host: "localhost:8080",
          "content-length": "100",
        },
        socket: {
          remoteAddress: "127.0.0.1",
        },
      },
    };

    verifyWebSocketClient(mockInfo, mockCb);
    expect(mockCb).toHaveBeenCalledWith(true);
  });

  test("triggers connection flood sentry for non-loopback IPs and rejects excess connections with 429", () => {
    const ip = "192.0.2.1"; // TEST-NET-1 IP address (non-localhost)
    const mockCb = jest.fn();

    // Set maxConnectionsPerIp to 2 for this test
    const originalLimit = connectionFloodSentry.maxConnectionsPerIp;
    connectionFloodSentry.maxConnectionsPerIp = 2;

    const makeInfo = () => ({
      origin: "http://localhost:8080",
      req: {
        url: "/",
        headers: {
          host: "localhost:8080",
        },
        socket: {
          remoteAddress: ip,
        },
      },
    });

    try {
      // First connection
      verifyWebSocketClient(makeInfo(), mockCb);
      expect(mockCb).toHaveBeenLastCalledWith(true);

      // Second connection
      verifyWebSocketClient(makeInfo(), mockCb);
      expect(mockCb).toHaveBeenLastCalledWith(true);

      // Third connection (exceeds limit 2)
      verifyWebSocketClient(makeInfo(), mockCb);
      expect(mockCb).toHaveBeenLastCalledWith(false, 429, "Too Many Requests");
    } finally {
      // Restore limit
      connectionFloodSentry.maxConnectionsPerIp = originalLimit;
    }
  });
});
