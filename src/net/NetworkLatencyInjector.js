/**
 * Network Latency & Packet-Loss Injector (SPEC-095).
 * Wraps WebSocket sockets to inject application-level latency and drops outbound/inbound frames.
 */
export class NetworkLatencyInjector {
  /**
   * Initializes the latency and loss-ratio properties.
   * @param {Object} [options={}] - Config options.
   * @param {number} [options.latencyMs=0] - Static delay in milliseconds.
   * @param {number} [options.lossRatio=0] - Frame drop ratio (0.0 to 1.0).
   */
  constructor(options = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.lossRatio = options.lossRatio ?? 0;
  }

  /**
   * Dynamically alters the latency delay value.
   * @param {number} ms - Milliseconds to delay network frames.
   */
  setLatency(ms) {
    this.latencyMs = ms;
  }

  /**
   * Dynamically alters the drop/loss ratio.
   * @param {number} ratio - Probability of dropping a packet (0.0 to 1.0).
   */
  setLossRatio(ratio) {
    this.lossRatio = Math.max(0, Math.min(1, ratio));
  }

  /**
   * Decorates a standard WebSocket instance to inject outbound/inbound delay and loss.
   * @param {Object} ws - The raw WebSocket instance to wrap.
   * @returns {Object} The wrapped WebSocket instance.
   */
  wrap(ws) {
    if (!ws || ws._isTelemetryWrapped) {
      return ws;
    }

    const originalSend = ws.send.bind(ws);

    // Intercept outbound send
    ws.send = (data, options, cb) => {
      // Allow callback to be optional
      let callback = cb;
      let sendOpts = options;
      if (typeof options === "function") {
        callback = options;
        sendOpts = {};
      }

      if (this.lossRatio > 0 && Math.random() < this.lossRatio) {
        if (callback) callback();
        return; // Drop outbound packet
      }

      if (this.latencyMs > 0) {
        setTimeout(() => {
          try {
            if (ws.readyState === ws.OPEN) {
              originalSend(data, sendOpts, callback);
            }
          } catch (_err) {
            // Defensively catch closed sockets during timeout
          }
        }, this.latencyMs);
      } else {
        originalSend(data, sendOpts, callback);
      }
    };

    // Intercept inbound on('message')
    const originalOn = ws.on.bind(ws);
    ws.on = (event, listener) => {
      if (event === "message") {
        originalOn(event, (data, isBinary) => {
          if (this.lossRatio > 0 && Math.random() < this.lossRatio) {
            return; // Drop inbound packet
          }

          if (this.latencyMs > 0) {
            setTimeout(() => {
              try {
                listener(data, isBinary);
              } catch (_err) {
                // Defensively catch execution failures
              }
            }, this.latencyMs);
          } else {
            listener(data, isBinary);
          }
        });
      } else {
        originalOn(event, listener);
      }
    };

    ws._isTelemetryWrapped = true;
    return ws;
  }
}
