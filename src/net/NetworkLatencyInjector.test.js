import { NetworkLatencyInjector } from "./NetworkLatencyInjector.js";

describe("NetworkLatencyInjector (SPEC-095)", () => {
  let mockSocket;
  let sendCalls;
  let onCalls;

  beforeEach(() => {
    sendCalls = [];
    onCalls = [];

    mockSocket = {
      OPEN: 1,
      readyState: 1,
      send: (data, options, cb) => {
        sendCalls.push({ data, options, cb });
        if (cb) cb();
      },
      on: (event, listener) => {
        onCalls.push({ event, listener });
      },
    };
  });

  test("initializes defaults and allows updates via setters", () => {
    const injector = new NetworkLatencyInjector();
    expect(injector.latencyMs).toBe(0);
    expect(injector.lossRatio).toBe(0);

    injector.setLatency(50);
    injector.setLossRatio(0.4);
    expect(injector.latencyMs).toBe(50);
    expect(injector.lossRatio).toBe(0.4);

    // Guard rails check: clamps out of bound ratios
    injector.setLossRatio(1.5);
    expect(injector.lossRatio).toBe(1.0);
    injector.setLossRatio(-0.5);
    expect(injector.lossRatio).toBe(0);
  });

  test("sends message immediately if latency and loss are zero", () => {
    const injector = new NetworkLatencyInjector();
    injector.wrap(mockSocket);

    mockSocket.send("direct message");
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0].data).toBe("direct message");
  });

  test("delays outbound send message under positive latencyMs", async () => {
    const injector = new NetworkLatencyInjector({ latencyMs: 20 });
    injector.wrap(mockSocket);

    mockSocket.send("delayed message");
    expect(sendCalls.length).toBe(0);

    // Wait for delay to expire
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0].data).toBe("delayed message");
  });

  test("drops outbound send packet completely if lossRatio is 1.0", () => {
    const injector = new NetworkLatencyInjector({ lossRatio: 1.0 });
    injector.wrap(mockSocket);

    mockSocket.send("dropped message");
    expect(sendCalls.length).toBe(0);
  });

  test("delays inbound on('message') events under positive latencyMs", async () => {
    const injector = new NetworkLatencyInjector({ latencyMs: 25 });
    injector.wrap(mockSocket);

    const received = [];
    const finalReceiver = (data, isBinary) => {
      received.push({ data, isBinary });
    };

    // Register listener via wrapped socket (which calls originalOn under the hood)
    mockSocket.on("message", finalReceiver);

    expect(onCalls.length).toBe(1);
    expect(onCalls[0].event).toBe("message");
    const messageHandler = onCalls[0].listener;

    // Trigger raw message
    messageHandler("inbound packet", false);

    // Won't immediately deliver
    expect(received.length).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(received.length).toBe(1);
    expect(received[0].data).toBe("inbound packet");
  });

  test("drops inbound on('message') events completely if lossRatio is 1.0", async () => {
    const injector = new NetworkLatencyInjector({ lossRatio: 1.0 });
    injector.wrap(mockSocket);

    const received = [];
    const finalReceiver = (data, isBinary) => {
      received.push({ data, isBinary });
    };

    // Register listener via wrapped socket
    mockSocket.on("message", finalReceiver);

    expect(onCalls.length).toBe(1);
    const messageHandler = onCalls[0].listener;

    messageHandler("dropped inbound", false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.length).toBe(0);
  });
});
