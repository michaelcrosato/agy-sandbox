import { ConnectionFloodSentry } from "./ConnectionFloodSentry.js";

describe("ConnectionFloodSentry", () => {
  test("allows connections up to the ceiling limit", () => {
    const sentry = new ConnectionFloodSentry({ maxConnectionsPerIp: 3 });
    const ip = "192.168.1.50";

    expect(sentry.register(ip).allowed).toBe(true);
    expect(sentry.register(ip).allowed).toBe(true);
    expect(sentry.register(ip).allowed).toBe(true);

    const blockResult = sentry.register(ip);
    expect(blockResult.allowed).toBe(false);
    expect(blockResult.reason).toContain(
      "Connection flood protection blocked IP",
    );
  });

  test("allows loopback/localhost IPs to bypass limit limits completely", () => {
    const sentry = new ConnectionFloodSentry({ maxConnectionsPerIp: 1 });
    const loopbackIpv4 = "127.0.0.1";
    const loopbackIpv6 = "::1";
    const localhostStr = "localhost";

    expect(sentry.register(loopbackIpv4).allowed).toBe(true);
    expect(sentry.register(loopbackIpv4).allowed).toBe(true); // Double allowed!

    expect(sentry.register(loopbackIpv6).allowed).toBe(true);
    expect(sentry.register(loopbackIpv6).allowed).toBe(true);

    expect(sentry.register(localhostStr).allowed).toBe(true);
    expect(sentry.register(localhostStr).allowed).toBe(true);
  });

  test("decrements socket count correctly on deregister", () => {
    const sentry = new ConnectionFloodSentry({ maxConnectionsPerIp: 2 });
    const ip = "8.8.8.8";

    expect(sentry.register(ip).allowed).toBe(true);
    expect(sentry.register(ip).allowed).toBe(true);
    expect(sentry.register(ip).allowed).toBe(false); // Capped

    sentry.deregister(ip);
    expect(sentry.register(ip).allowed).toBe(true); // Allowed again!
  });

  test("resets metrics cleanly", () => {
    const sentry = new ConnectionFloodSentry({ maxConnectionsPerIp: 1 });
    const ip = "4.2.2.2";

    expect(sentry.register(ip).allowed).toBe(true);
    expect(sentry.register(ip).allowed).toBe(false);

    sentry.reset();
    expect(sentry.register(ip).allowed).toBe(true);
  });
});
