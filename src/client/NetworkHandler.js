import { applyDelta } from "../net/StateCodec.js";
import { decode as decodeFrame } from "../net/BinaryCodec.js";

/**
 * Manages WebSocket networking, input transmission, state synchronization,
 * and cooperative party/fleet systems.
 */
export class NetworkHandler {
  constructor() {
    this.socket = null;
    this.connected = false;

    // Core parameters received from server
    this.playerId = null;
    this.nickname = localStorage.getItem("nebula_callsign") || "Commander";
    this.fleet = {
      name: null,
      members: [],
    };

    // Client entities cache synced from server states
    this.entitiesData = [];
    this.activeSectorEvent = null;

    // P7: server broadcasts state as keyframes + deltas. We hold the latest
    // reconstructed snapshot (id-keyed entity map) and the seq it represents,
    // so an incoming delta can be applied iff its baseSeq matches.
    this.serverSnapshot = { entities: {} };
    this.serverSeq = -1;

    // Message Hook callbacks
    this.onInit = null;
    this.onStateReceived = null;
    this.onStatsReceived = null;
    this.onLanded = null;
    this.onLaunched = null;
    this.onFleetSync = null;
    this.onProjectileFired = null;
    this.onNotification = null;
    this.onChatReceived = null;
    this.onMarketSync = null;
    this.onMarketBulkSync = null;
    this.onEventSync = null;
    this.onGalaxyEventAnnouncement = null;
    this.onPingReceived = null;
    this.onLobbySync = null;
    this.onConnectionStatusChange = null;

    // Persisted session token for recovery
    this.sessionToken = localStorage.getItem("nebula_session_token") || null;

    // Ping heartbeat timer
    this.pingInterval = null;

    // Throttle input packets sending (only send when controls flags change)
    this.lastSentControls = null;

    // Reconnect backoff parameters
    this.reconnectAttempt = 0;
    this.maxReconnectDelay = 15000; // cap at 15 seconds
  }

  /**
   * Adopts a full keyframe snapshot from the server: replaces the local
   * reconstructed snapshot wholesale and adopts its seq. Pure with respect to
   * the network layer (no socket/DOM), so the snapshot/delta reconstruction is
   * unit-testable in isolation.
   * @param {{entities?: Object<string, Object>, seq: number}} msg
   * @returns {Array<Object>} The reconstructed entity list (id-map values).
   */
  applySnapshotMessage(msg) {
    this.serverSnapshot = { entities: msg.entities || {} };
    this.serverSeq = msg.seq;
    this.entitiesData = Object.values(this.serverSnapshot.entities);
    return this.entitiesData;
  }

  /**
   * Applies an incremental delta iff its `baseSeq` matches the snapshot we
   * currently hold. A mismatch means we missed a frame, so the delta is dropped
   * and we wait for the next keyframe (the server's ~1s cadence self-heals the
   * desync). On success the local snapshot/seq advance and the new entity list
   * is returned; on a dropped delta the local state is left untouched.
   * @param {{baseSeq: number, seq: number, delta: Object}} msg
   * @returns {Array<Object>|null} Entity list on apply, or null if dropped.
   */
  applyDeltaMessage(msg) {
    if (msg.baseSeq !== this.serverSeq) return null;
    this.serverSnapshot = applyDelta(this.serverSnapshot, msg.delta);
    this.serverSeq = msg.seq;
    this.entitiesData = Object.values(this.serverSnapshot.entities);
    return this.entitiesData;
  }

  /**
   * Connects to the authoritative WebSocket server.
   */
  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log(`Connecting to Nebula Server: ${wsUrl}`);
    this.socket = new WebSocket(wsUrl);
    // Receive the binary world-state frames (spec 015) as ArrayBuffers so we can
    // decode them; chat/notification/etc. still arrive as JSON text.
    this.socket.binaryType = "arraybuffer";

    this.socket.onopen = () => {
      this.connected = true;
      this.reconnectAttempt = 0; // Reset backoff on successful connection
      console.log("Connected to server! Sending joining logs...");
      this.send({
        type: "join",
        name: this.nickname,
        sessionToken: this.sessionToken,
      });

      if (this.onConnectionStatusChange) {
        this.onConnectionStatusChange("online");
      }

      // Start periodic heartbeat pings
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        this.send({
          type: "ping",
          time: Date.now(),
        });
      }, 2500);
    };

    this.socket.onmessage = (event) => {
      let msg;
      if (event.data instanceof ArrayBuffer) {
        // Binary world-state frame (spec 015): decode it back into the same
        // {type, seq, ...} shape the JSON path produces.
        try {
          msg = decodeFrame(new Uint8Array(event.data));
        } catch {
          return;
        }
      } else {
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
      }

      switch (msg.type) {
        case "init":
          this.playerId = msg.playerId;
          if (msg.nickname) {
            this.nickname = msg.nickname;
            localStorage.setItem("nebula_callsign", msg.nickname);
          }
          if (msg.sessionToken) {
            this.sessionToken = msg.sessionToken;
            localStorage.setItem("nebula_session_token", msg.sessionToken);
          }
          if (this.onInit) this.onInit(msg);
          break;

        case "state_snapshot": {
          // Full keyframe: replace the local snapshot wholesale and adopt seq.
          const entities = this.applySnapshotMessage(msg);
          if (this.onStateReceived) this.onStateReceived(entities);
          break;
        }

        case "state_delta": {
          // Delta is only valid if its baseSeq matches the snapshot we hold.
          // Otherwise we've missed a frame — drop the delta and wait for the
          // next keyframe (the ~1s cadence on the server self-heals desync).
          const entities = this.applyDeltaMessage(msg);
          if (entities && this.onStateReceived) this.onStateReceived(entities);
          break;
        }

        case "stats":
          if (this.onStatsReceived) this.onStatsReceived(msg);
          break;

        case "landed":
          if (this.onLanded) this.onLanded(msg);
          break;

        case "launched":
          if (this.onLaunched) this.onLaunched(msg);
          break;

        case "fleet_sync":
          this.fleet.name = msg.name;
          this.fleet.members = msg.members;
          if (this.onFleetSync) this.onFleetSync(msg);
          break;

        case "projectile_fired":
          if (this.onProjectileFired) this.onProjectileFired(msg);
          break;

        case "notification":
          if (this.onNotification) this.onNotification(msg);
          break;

        case "chat":
          if (this.onChatReceived) this.onChatReceived(msg);
          break;

        case "market_sync":
          if (this.onMarketSync) this.onMarketSync(msg);
          break;

        case "market_bulk_sync":
          if (this.onMarketBulkSync) this.onMarketBulkSync(msg);
          break;

        case "event_sync":
          this.activeSectorEvent = msg.event;
          if (this.onEventSync) this.onEventSync(msg);
          break;

        case "galaxy_event_announcement":
          this.activeGalaxyEvent = msg.event;
          if (this.onGalaxyEventAnnouncement) {
            this.onGalaxyEventAnnouncement(msg);
          }
          break;

        case "cargo_pickup":
          if (this.onCargoPickup) this.onCargoPickup(msg);
          break;

        case "pong":
          {
            const latency = Date.now() - msg.time;
            if (this.onPingReceived) this.onPingReceived(latency);
          }
          break;

        case "lobby_sync":
          if (this.onLobbySync) this.onLobbySync(msg);
          break;

        case "match_admitted":
          if (this.onMatchAdmitted) this.onMatchAdmitted(msg);
          break;

        case "warp_success":
          if (this.onWarpSuccess) this.onWarpSuccess(msg);
          break;
      }
    };

    this.socket.onclose = () => {
      this.connected = false;
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      // Drop the cached snapshot/seq so the next session starts from the
      // forced keyframe the server sends on reconnect rather than trying to
      // apply deltas against pre-disconnect state.
      this.serverSnapshot = { entities: {} };
      this.serverSeq = -1;
      if (this.onConnectionStatusChange) {
        this.onConnectionStatusChange("reconnecting");
      }
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s... capped at 15s
      this.reconnectAttempt++;
      const baseDelay = Math.min(
        1000 * Math.pow(2, this.reconnectAttempt - 1),
        this.maxReconnectDelay,
      );
      const jitter = Math.floor(Math.random() * 500);
      const delay = baseDelay + jitter;
      console.log(
        `Disconnected from server. Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempt})...`,
      );
      setTimeout(() => this.connect(), delay);
    };

    this.socket.onerror = (err) => {
      console.error("WebSocket network error:", err);
      if (this.onConnectionStatusChange) {
        this.onConnectionStatusChange("offline");
      }
    };
  }

  /**
   * Sends a structured message to the server if connection is active.
   * @param {Object} data - Payload object.
   */
  send(data) {
    if (this.connected && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  /**
   * Sends steering inputs to the server, throttle-checked to prevent spam.
   * @param {Object} controls - Ship control keys.
   * @param {number} heading - Direct heading rotation.
   */
  sendControls(controls, heading) {
    if (!this.connected) return;

    // Check if input state actually changed since last time
    const checkStr = JSON.stringify(controls) + heading.toFixed(3);
    if (this.lastSentControls === checkStr) return;

    this.lastSentControls = checkStr;
    this.send({
      type: "controls",
      controls,
      heading,
    });
  }

  /**
   * Request planetary landing sequence check.
   */
  requestLanding() {
    this.send({ type: "land" });
  }

  /**
   * Launch ship back to space orbit.
   */
  requestLaunch() {
    this.send({ type: "launch" });
  }

  /**
   * Submit commodity cargo transaction.
   * @param {string} item - Commodity ID.
   * @param {string} action - "buy" or "sell".
   */
  requestTrade(item, action) {
    this.send({
      type: "trade",
      item,
      action,
    });
  }

  /**
   * Upgrade starship outfit configuration.
   * @param {string} outfitName - Name of outfit to buy.
   */
  requestOutfitPurchase(outfitName) {
    this.send({
      type: "outfit_buy",
      outfitName,
    });
  }

  /**
   * Trade current hull in for a brand new spacecraft.
   * @param {string} shipName - Shipyard model designation.
   */
  requestShipPurchase(shipName) {
    this.send({
      type: "ship_buy",
      shipName,
    });
  }

  /**
   * Submits acceptance of a bounty or courier contract.
   * @param {string} planetName - Origin planet.
   * @param {string} missionId - Unique mission ID.
   */
  requestMissionAccept(planetName, missionId) {
    this.send({
      type: "mission_accept",
      planetName,
      missionId,
    });
  }

  /**
   * Submits contract abandonment.
   * @param {string} missionId - Active mission ID.
   */
  requestMissionAbandon(missionId) {
    this.send({
      type: "mission_abandon",
      missionId,
    });
  }

  /**
   * Refine raw ore in ship cargo into minerals or machinery.
   * @param {number} quantity - Quantity of raw ore to refine.
   * @param {string} targetCommodity - Target commodity.
   */
  requestRefine(quantity, targetCommodity) {
    this.send({
      type: "port_refine",
      quantity,
      targetCommodity,
    });
  }

  /**
   * Create or join a collaborative fleet party.
   * @param {string} nick - Call sign nickname of pilot.
   * @param {string} fleetCode - Code/ID of target fleet.
   */
  requestFleetJoin(nick, fleetCode) {
    this.nickname = nick.trim().substring(0, 12) || "Commander";
    localStorage.setItem("nebula_callsign", this.nickname);

    this.send({
      type: "fleet_create", // creation and joining share a backend lobby handler
      fleetName: fleetCode,
      name: this.nickname,
    });
  }

  /**
   * Leave current fleet group.
   */
  requestFleetLeave() {
    this.send({ type: "fleet_leave" });
  }

  /**
   * Dispatches chat message broadcast request.
   * @param {string} channel - "global" or "fleet".
   * @param {string} text - Message content.
   */
  sendChat(channel, text) {
    this.send({
      type: "chat",
      channel,
      text,
    });
  }
}
