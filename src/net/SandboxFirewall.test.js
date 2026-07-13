import dns from "dns";
import net from "net";
import {
  SandboxFirewall,
  activateFirewall,
  deactivateFirewall,
} from "./SandboxFirewall.js";

describe("SandboxFirewall", () => {
  let firewall;

  beforeEach(() => {
    firewall = new SandboxFirewall({
      allowlistDomains: ["google.com", "api.google.com"],
    });
  });

  afterEach(() => {
    deactivateFirewall();
  });

  test("isPrivateIp identifies private subnets and permits local loopback", () => {
    // RFC 1918 IPv4
    expect(firewall.isPrivateIp("10.0.0.1")).toBe(true);
    expect(firewall.isPrivateIp("10.255.255.255")).toBe(true);
    expect(firewall.isPrivateIp("172.16.4.15")).toBe(true);
    expect(firewall.isPrivateIp("172.31.255.255")).toBe(true);
    expect(firewall.isPrivateIp("192.168.1.100")).toBe(true);

    // Link-local / AWS metadata
    expect(firewall.isPrivateIp("169.254.169.254")).toBe(true);

    // Loopback should be false (allowed)
    expect(firewall.isPrivateIp("127.0.0.1")).toBe(false);
    expect(firewall.isPrivateIp("::1")).toBe(false);

    // Public IPv4
    expect(firewall.isPrivateIp("8.8.8.8")).toBe(false);
    expect(firewall.isPrivateIp("142.250.190.46")).toBe(false);

    // IPv6 local subnets
    expect(firewall.isPrivateIp("fe80::1")).toBe(true);
    expect(firewall.isPrivateIp("fc00::abcd")).toBe(true);
    expect(firewall.isPrivateIp("2001:db8::")).toBe(false); // Public
  });

  test("checkHost blocks private IPs and non-whitelisted domains, permits loopbacks", () => {
    // Permitted local loopback hosts
    expect(firewall.checkHost("localhost").allowed).toBe(true);
    expect(firewall.checkHost("127.0.0.1").allowed).toBe(true);
    expect(firewall.checkHost("::1").allowed).toBe(true);

    // Block private IP hosts
    const resPrivate = firewall.checkHost("192.168.0.1");
    expect(resPrivate.allowed).toBe(false);
    expect(resPrivate.reason).toContain(
      "blocked connection to private IP range",
    );

    // Whitelisted domains
    expect(firewall.checkHost("google.com").allowed).toBe(true);
    expect(firewall.checkHost("sub.google.com").allowed).toBe(true);
    expect(firewall.checkHost("api.google.com").allowed).toBe(true);

    // Blocked non-allowlisted domains
    const resBlocked = firewall.checkHost("malicious.com");
    expect(resBlocked.allowed).toBe(false);
    expect(resBlocked.reason).toContain("blocked non-allowlisted host domain");

    expect(firewall.blockCount).toBe(2);
    expect(firewall.blockedEvents.length).toBe(2);
  });

  test("checkIp blocks resolved private IPs, permits public/loopback IPs", () => {
    expect(firewall.checkIp("10.0.0.1").allowed).toBe(false);
    expect(firewall.checkIp("169.254.169.254").allowed).toBe(false);

    expect(firewall.checkIp("127.0.0.1").allowed).toBe(true);
    expect(firewall.checkIp("8.8.8.8").allowed).toBe(true);
  });

  test("blockedEvents is bounded so sustained blocks cannot grow memory unboundedly", () => {
    const bounded = new SandboxFirewall({ maxBlockedEvents: 5 });
    for (let i = 0; i < 50; i++) {
      bounded.checkHost(`blocked-${i}.example`);
    }
    // Ring buffer retains only the most recent maxBlockedEvents entries...
    expect(bounded.blockedEvents.length).toBe(5);
    expect(bounded.blockedEvents[bounded.blockedEvents.length - 1].host).toBe(
      "blocked-49.example",
    );
    expect(bounded.blockedEvents[0].host).toBe("blocked-45.example");
    // ...while blockCount stays the lifetime total.
    expect(bounded.blockCount).toBe(50);
  });

  test("activateFirewall intercepts dns.lookup and net.connect", (done) => {
    activateFirewall(firewall);

    // 1. Assert dns.lookup blocks unauthorized domains before resolution
    dns.lookup("malicious.com", (err) => {
      expect(err).toBeDefined();
      expect(err.message).toContain("blocked non-allowlisted host domain");
      expect(err.code).toBe("ENETUNREACH");

      // 2. Assert net.connect blocks unauthorized hosts
      const socket = net.connect({ host: "192.168.1.1", port: 80 });
      socket.on("error", (socketErr) => {
        expect(socketErr).toBeDefined();
        expect(socketErr.message).toContain(
          "blocked connection to private IP range",
        );

        // 3. Deactivate and verify standard call is restored
        deactivateFirewall();
        done();
      });
    });
  });

  test("firewall resolves whitelisted domains when active", (done) => {
    activateFirewall(firewall);

    // Should call native lookup (mocked to resolve localhost or trigger standard DNS resolution)
    dns.lookup("localhost", (err, address) => {
      expect(err).toBeNull();
      expect(address).toBeDefined();
      done();
    });
  });
});
