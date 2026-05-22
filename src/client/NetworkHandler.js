
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
      members: []
    };

    // Client entities cache synced from server states
    this.entitiesData = [];

    // Message Hook callbacks
    this.onInit = null;
    this.onStateReceived = null;
    this.onStatsReceived = null;
    this.onLanded = null;
    this.onLaunched = null;
    this.onFleetSync = null;
    this.onProjectileFired = null;
    this.onNotification = null;

    // Throttle input packets sending (only send when controls flags change)
    this.lastSentControls = null;
  }

  /**
   * Connects to the authoritative WebSocket server.
   */
  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Connecting to Nebula Server: ${wsUrl}`);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.connected = true;
      console.log("Connected to server! Sending joining logs...");
      this.send({
        type: "join",
        name: this.nickname
      });
    };

    this.socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "init":
          this.playerId = msg.playerId;
          if (msg.nickname) {
            this.nickname = msg.nickname;
            localStorage.setItem("nebula_callsign", msg.nickname);
          }
          if (this.onInit) this.onInit(msg);
          break;

        case "state":
          this.entitiesData = msg.entities;
          if (this.onStateReceived) this.onStateReceived(msg.entities);
          break;

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
      }
    };

    this.socket.onclose = () => {
      this.connected = false;
      console.log("Disconnected from server. Retrying connection in 3 seconds...");
      setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = (err) => {
      console.error("WebSocket network error:", err);
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
      heading
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
      action
    });
  }

  /**
   * Upgrade starship outfit configuration.
   * @param {string} outfitName - Name of outfit to buy.
   */
  requestOutfitPurchase(outfitName) {
    this.send({
      type: "outfit_buy",
      outfitName
    });
  }

  /**
   * Trade current hull in for a brand new spacecraft.
   * @param {string} shipName - Shipyard model designation.
   */
  requestShipPurchase(shipName) {
    this.send({
      type: "ship_buy",
      shipName
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
      missionId
    });
  }

  /**
   * Submits contract abandonment.
   * @param {string} missionId - Active mission ID.
   */
  requestMissionAbandon(missionId) {
    this.send({
      type: "mission_abandon",
      missionId
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
      name: this.nickname
    });
  }

  /**
   * Leave current fleet group.
   */
  requestFleetLeave() {
    this.send({ type: "fleet_leave" });
  }
}
