// @ts-nocheck -- Browser client is not type-checked (see AGENTS/Phase 3 notes); compiled by tsconfig.build.json for emit only.
/**
 * SoundEngine: procedural synthesis engine for space simulation audio feedback.
 * Uses Web Audio API to synthesize sounds on-the-fly with spatial panning
 * and proximity volume decay.
 */
export default class SoundEngine {
  /**
   * Initializes the sound engine parameters.
   * @param {boolean|Object} [options] - Initial configuration or mute state boolean.
   */
  constructor(options = {}) {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.masterGain = null;
    /** @type {number} */
    this.volume = 0.5;

    if (typeof options === "boolean") {
      /** @type {boolean} */
      this.muted = options;
    } else {
      /** @type {boolean} */
      this.muted = !!options.muted;
    }

    /** @type {AudioBuffer|null} */
    this.sharedNoiseBuffer = null;

    // Listener coordinates
    this.listenerX = 0;
    this.listenerY = 0;

    // Alarm timing tracking
    this.lastLowShieldTime = 0;
    this.lastLowArmorTime = 0;
    this.lastOverheatTime = 0;

    this._lowShieldActive = false;
    this._lowArmorActive = false;
    this._overheatActive = false;

    // Thruster state nodes
    /** @type {OscillatorNode|null} */
    this.thrusterOsc = null;
    /** @type {BiquadFilterNode|null} */
    this.thrusterOscFilter = null;
    /** @type {GainNode|null} */
    this.thrusterOscGain = null;
    /** @type {OscillatorNode|null} */
    this.thrusterLFO = null;
    /** @type {GainNode|null} */
    this.thrusterLFOGainFreq = null;
    /** @type {GainNode|null} */
    this.thrusterLFOGainAmp = null;
    /** @type {AudioBufferSourceNode|null} */
    this.thrusterNoise = null;
    /** @type {BiquadFilterNode|null} */
    this.thrusterNoiseFilter = null;
    /** @type {GainNode|null} */
    this.thrusterNoiseGain = null;
  }

  /**
   * Instantiates the AudioContext and starts/resumes the audio thread.
   * This must be called from a user interaction gesture listener.
   */
  start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch((_err) => {});
      }
      return;
    }

    const AudioContextClass =
      window.AudioContext || /** @type {any} */ window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass();
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch((_err) => {});
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
      );
      this.masterGain.connect(this.ctx.destination);

      try {
        this.sharedNoiseBuffer = this._createNoiseBuffer();
      } catch (_err) {
        // Safe fallback if buffer creation fails
      }

      this._initThruster();
    } catch (_e) {
      // Gracefully catch instantiation failures (e.g. headless browser environments)
    }
  }

  /**
   * Safely stops and disconnects all active continuous nodes and cleans up references.
   */
  stop() {
    if (this.thrusterOsc) {
      try {
        this.thrusterOsc.stop();
      } catch (_e) {
        // Ignore errors if the node was not started or already stopped
      }
    }
    if (this.thrusterLFO) {
      try {
        this.thrusterLFO.stop();
      } catch (_e) {
        // Ignore errors if the node was not started or already stopped
      }
    }
    if (this.thrusterNoise) {
      try {
        this.thrusterNoise.stop();
      } catch (_e) {
        // Ignore errors if the node was not started or already stopped
      }
    }

    const nodesToDisconnect = [
      this.thrusterOsc,
      this.thrusterOscFilter,
      this.thrusterOscGain,
      this.thrusterLFO,
      this.thrusterLFOGainFreq,
      this.thrusterLFOGainAmp,
      this.thrusterNoise,
      this.thrusterNoiseFilter,
      this.thrusterNoiseGain,
      this.masterGain,
    ];

    for (const node of nodesToDisconnect) {
      if (node && typeof node.disconnect === "function") {
        try {
          node.disconnect();
        } catch (_e) {
          // Ignore errors if already disconnected
        }
      }
    }

    if (this.ctx) {
      try {
        if (typeof this.ctx.close === "function") {
          this.ctx.close().catch((_err) => {});
        }
      } catch (_e) {
        // Ignore errors closing context
      }
      this.ctx = null;
    }

    this.thrusterOsc = null;
    this.thrusterOscFilter = null;
    this.thrusterOscGain = null;
    this.thrusterLFO = null;
    this.thrusterLFOGainFreq = null;
    this.thrusterLFOGainAmp = null;
    this.thrusterNoise = null;
    this.thrusterNoiseFilter = null;
    this.thrusterNoiseGain = null;
    this.masterGain = null;
    this.sharedNoiseBuffer = null;
  }

  /**
   * Alias for stop() to support alternative cleanup naming conventions.
   */
  dispose() {
    this.stop();
  }

  /**
   * Tracks the player listener position in the coordinates system.
   * @param {number} x - Listener X position.
   * @param {number} y - Listener Y position.
   */
  setListenerPosition(x, y) {
    this.listenerX = typeof x === "number" ? x : 0;
    this.listenerY = typeof y === "number" ? y : 0;
  }

  /**
   * Routes a node through a spatial audio panning and decay chain.
   * Route: sourceNode -> StereoPannerNode (if supported) -> SpatialGainNode -> masterGain.
   * @private
   * @param {AudioNode} sourceNode - Audio node to route.
   * @param {Object} [position] - Coordinate object {x, y} of the sound source.
   */
  _route(sourceNode, position = null) {
    if (!this.ctx || !this.masterGain) return;

    let pan = 0;
    let gainScale = 1.0;

    if (
      position &&
      typeof position.x === "number" &&
      typeof position.y === "number"
    ) {
      const dx = position.x - this.listenerX;
      pan = Math.max(-1.0, Math.min(1.0, dx / 1500));

      const d = Math.sqrt(
        (position.x - this.listenerX) ** 2 + (position.y - this.listenerY) ** 2,
      );
      gainScale = Math.max(0, 1 - d / 3000);
    }

    const spatialGain = this.ctx.createGain();
    spatialGain.gain.setValueAtTime(gainScale, this.ctx.currentTime);

    if (typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, this.ctx.currentTime);
      sourceNode.connect(panner);
      panner.connect(spatialGain);
    } else {
      sourceNode.connect(spatialGain);
    }

    spatialGain.connect(this.masterGain);
  }

  /**
   * Toggles the mute state of the master audio gain node.
   */
  mute() {
    this.muted = true;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  /**
   * Restores sound output to the active volume.
   */
  unmute() {
    this.muted = false;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Modulates the master volume.
   * @param {number} vol - Volume level between 0.0 and 1.0.
   */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Helper to create a noise buffer filled with random values (white noise).
   * @private
   * @returns {AudioBuffer} The generated AudioBuffer.
   */
  _createNoiseBuffer() {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    if (this.sharedNoiseBuffer) {
      return this.sharedNoiseBuffer;
    }
    const sampleRate = this.ctx.sampleRate || 44100;
    const bufferSize = sampleRate * 2; // 2 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.sharedNoiseBuffer = buffer;
    return buffer;
  }

  /**
   * Creates a white noise source node using a procedurally populated buffer.
   * @private
   * @returns {AudioBufferSourceNode} The noise source node.
   */
  _createNoiseNode() {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const node = this.ctx.createBufferSource();
    node.buffer = this._createNoiseBuffer();
    return node;
  }

  /**
   * Initializes the continuous thruster sound nodes.
   * @private
   */
  _initThruster() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Thruster fundamental tone oscillator
    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterOsc.type = "triangle";
    this.thrusterOsc.frequency.setValueAtTime(55, now);

    this.thrusterOscFilter = this.ctx.createBiquadFilter();
    this.thrusterOscFilter.type = "lowpass";
    this.thrusterOscFilter.frequency.setValueAtTime(120, now);

    this.thrusterOscGain = this.ctx.createGain();
    this.thrusterOscGain.gain.setValueAtTime(0.05, now);

    // Rumble LFO (Low Frequency Oscillator) to modulate frequency and amplitude
    this.thrusterLFO = this.ctx.createOscillator();
    this.thrusterLFO.type = "sine";
    this.thrusterLFO.frequency.setValueAtTime(15, now);

    this.thrusterLFOGainFreq = this.ctx.createGain();
    this.thrusterLFOGainFreq.gain.setValueAtTime(0, now);

    this.thrusterLFOGainAmp = this.ctx.createGain();
    this.thrusterLFOGainAmp.gain.setValueAtTime(0, now);

    // Wire LFO modulation routes
    this.thrusterLFO.connect(this.thrusterLFOGainFreq);
    this.thrusterLFOGainFreq.connect(this.thrusterOsc.frequency);

    this.thrusterLFO.connect(this.thrusterLFOGainAmp);
    this.thrusterLFOGainAmp.connect(this.thrusterOscGain.gain);

    // Noise component setup for turbulent exhaust hiss
    try {
      this.thrusterNoise = this._createNoiseNode();
      this.thrusterNoise.loop = true;
    } catch (_e) {
      // Catch mock errors in testing
    }

    this.thrusterNoiseFilter = this.ctx.createBiquadFilter();
    this.thrusterNoiseFilter.type = "bandpass";
    this.thrusterNoiseFilter.frequency.setValueAtTime(150, now);
    this.thrusterNoiseFilter.Q.setValueAtTime(1.0, now);

    this.thrusterNoiseGain = this.ctx.createGain();
    this.thrusterNoiseGain.gain.setValueAtTime(0.01, now);

    // Main connections
    this.thrusterOsc.connect(this.thrusterOscFilter);
    this.thrusterOscFilter.connect(this.thrusterOscGain);
    this.thrusterOscGain.connect(this.masterGain);

    if (this.thrusterNoise) {
      this.thrusterNoise.connect(this.thrusterNoiseFilter);
      this.thrusterNoiseFilter.connect(this.thrusterNoiseGain);
      this.thrusterNoiseGain.connect(this.masterGain);
    }

    // Start running nodes
    this.thrusterOsc.start(now);
    this.thrusterLFO.start(now);
    if (this.thrusterNoise) {
      this.thrusterNoise.start(now);
    }
  }

  /**
   * Modulates the continuous thruster engine loop settings based on speed/boost.
   * @param {number} throttle - Throttle amount from 0.0 (idle) to 1.0 (max).
   * @param {boolean} isBoosting - True if afterburner/boost is engaged.
   * @param {Object} [position] - Coordinate object {x, y} of the thruster.
   */
  setThrusterState(throttle, isBoosting, _position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.thrusterOsc) {
      return;
    }
    const now = this.ctx.currentTime;

    let targetFreq;
    let oscGainVal;
    let noiseFilterFreq;
    let noiseGainVal;
    let lfoFreqMod;
    let lfoAmpMod;

    if (isBoosting) {
      targetFreq = 180;
      oscGainVal = 0.45;
      noiseFilterFreq = 800; // Higher components
      noiseGainVal = 0.15; // Higher noise rumble
      lfoFreqMod = 15; // frequency rumble offset
      lfoAmpMod = 0.08; // amplitude modulation rumble depth
    } else {
      // Linear interpolation between idle and max throttle
      targetFreq = 55 + (110 - 55) * throttle;
      oscGainVal = 0.05 + (0.2 - 0.05) * throttle;
      noiseFilterFreq = 150 + (300 - 150) * throttle;
      noiseGainVal = 0.01 + (0.05 - 0.01) * throttle;
      lfoFreqMod = 0;
      lfoAmpMod = 0;
    }

    const t = 0.1; // Smooth transitions over 0.1s to prevent clicks
    this.thrusterOsc.frequency.setTargetAtTime(targetFreq, now, t / 3);
    if (this.thrusterOscGain) {
      this.thrusterOscGain.gain.setTargetAtTime(oscGainVal, now, t / 3);
    }
    if (this.thrusterOscFilter) {
      this.thrusterOscFilter.frequency.setTargetAtTime(
        targetFreq * 2.5,
        now,
        t / 3,
      );
    }
    if (this.thrusterNoiseFilter) {
      this.thrusterNoiseFilter.frequency.setTargetAtTime(
        noiseFilterFreq,
        now,
        t / 3,
      );
    }
    if (this.thrusterNoiseGain) {
      this.thrusterNoiseGain.gain.setTargetAtTime(noiseGainVal, now, t / 3);
    }
    if (this.thrusterLFOGainFreq) {
      this.thrusterLFOGainFreq.gain.setTargetAtTime(lfoFreqMod, now, t / 3);
    }
    if (this.thrusterLFOGainAmp) {
      this.thrusterLFOGainAmp.gain.setTargetAtTime(lfoAmpMod, now, t / 3);
    }
  }

  /**
   * Triggers a one-shot warp gate jump audio sweep.
   * @param {Object} [position] - Coordinate object {x, y} of warp gate.
   */
  playWarpJump(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // Phase 1: Charge up (0.0s to 1.5s)
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(2500, now + 1.5);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(5000, now + 1.5);

    let chargeNoise = null;
    try {
      chargeNoise = this._createNoiseNode();
    } catch (_e) {
      // Ignore mock node errors in tests
    }

    const phase1Gain = this.ctx.createGain();
    phase1Gain.gain.setValueAtTime(0.0, now);
    phase1Gain.gain.linearRampToValueAtTime(0.4, now + 1.5);
    phase1Gain.gain.setValueAtTime(0.4, now + 1.5);
    phase1Gain.gain.linearRampToValueAtTime(0.0, now + 1.6); // Fast cut-off at transition point

    osc.connect(phase1Gain);
    if (chargeNoise) {
      chargeNoise.connect(noiseFilter);
      noiseFilter.connect(phase1Gain);
    }
    this._route(phase1Gain, position);

    // Phase 2: Transition / Blast (1.5s to 2.0s) & Phase 3: Decrescendo (2.0s to 2.5s)
    let blastNoise = null;
    try {
      blastNoise = this._createNoiseNode();
    } catch (_e) {
      // Ignore mock node errors in tests
    }

    const blastFilter = this.ctx.createBiquadFilter();
    blastFilter.type = "highpass";
    blastFilter.frequency.setValueAtTime(2000, now + 1.5);

    const blastGain = this.ctx.createGain();
    blastGain.gain.setValueAtTime(0.0, now);
    blastGain.gain.setValueAtTime(0.0, now + 1.5 - 0.01);
    blastGain.gain.linearRampToValueAtTime(0.6, now + 1.5);
    blastGain.gain.setValueAtTime(0.6, now + 2.0);
    blastGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

    if (blastNoise) {
      blastNoise.connect(blastFilter);
      blastFilter.connect(blastGain);
    }
    this._route(blastGain, position);

    // Start / stop scheduling
    osc.start(now);
    osc.stop(now + 1.6);
    if (chargeNoise) {
      chargeNoise.start(now);
      chargeNoise.stop(now + 1.6);
    }

    if (blastNoise) {
      blastNoise.start(now + 1.5);
      blastNoise.stop(now + 2.5);
    }
  }

  /**
   * Triggers a weapon fire sound effect.
   * @param {"laser"|"plasma"|"neutron"|"ion"} type - The weapon type.
   * @param {Object} [position] - Coordinate object {x, y} of the shooter.
   */
  playWeapon(type, position = null) {
    if (type === "plasma") {
      this.playPlasma(position);
    } else if (type === "neutron") {
      this.playNeutron(position);
    } else if (type === "ion") {
      this.playIon(position);
    } else {
      this.playLaser(position);
    }
  }

  /**
   * Synthesizes a laser weapon discharge (rapid pitch ramp down, sine sweep).
   * @param {Object} [position] - Coordinate object {x, y} of the source.
   */
  playLaser(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0, now);
    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gainNode);
    this._route(gainNode, position);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Synthesizes a plasma weapon discharge (square sweep/lowpass filter).
   * @param {Object} [position] - Coordinate object {x, y} of the source.
   */
  playPlasma(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(filter);
    filter.connect(gainNode);
    this._route(gainNode, position);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  /**
   * Synthesizes a neutron weapon discharge (bass tone with pitch decay).
   * @param {Object} [position] - Coordinate object {x, y} of the source.
   */
  playNeutron(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    const carrier = this.ctx.createOscillator();
    carrier.type = "sawtooth";
    carrier.frequency.setValueAtTime(220, now);
    carrier.frequency.exponentialRampToValueAtTime(55, now + 0.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.2);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.35, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    carrier.connect(filter);
    filter.connect(gainNode);
    this._route(gainNode, position);

    carrier.start(now);
    carrier.stop(now + 0.2);
  }

  /**
   * Synthesizes an ion weapon discharge (high-voltage crackling sound).
   * @param {Object} [position] - Coordinate object {x, y} of the source.
   */
  playIon(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.12);

    let noise = null;
    let noiseGain = null;

    try {
      noise = this._createNoiseNode();
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(2000, now);
      noiseFilter.Q.setValueAtTime(2.0, now);

      noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.12, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
    } catch (_err) {
      // Graceful fallback if noise nodes fail in JSDom/headless
    }

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.15, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    const outputGain = this.ctx.createGain();
    outputGain.gain.setValueAtTime(1.0, now);

    osc.connect(oscGain);
    oscGain.connect(outputGain);

    if (noiseGain) {
      noiseGain.connect(outputGain);
    }

    this._route(outputGain, position);

    osc.start(now);
    osc.stop(now + 0.12);

    if (noise) {
      try {
        noise.start(now);
        noise.stop(now + 0.12);
      } catch (_err) {
        // Safe fallback if noise start throws
      }
    }
  }

  /**
   * Synthesizes a shield impact sound (harmonic chime).
   * @param {Object} [position] - Coordinate object {x, y} of impact.
   */
  playShieldImpact(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const frequencies = [800, 1200, 1600];

    frequencies.forEach((f) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.35 / 3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

      osc.connect(gainNode);
      this._route(gainNode, position);

      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  /**
   * Synthesizes an armor impact sound (filtered low thud).
   * @param {Object} [position] - Coordinate object {x, y} of impact.
   */
  playArmorImpact(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // Decaying sine oscillator (90Hz)
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now);

    // Noise burst
    let noise = null;
    try {
      noise = this._createNoiseNode();
    } catch (_e) {
      // Ignore mock node errors in tests
    }

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(250, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gainNode);
    if (noise) {
      noise.connect(filter);
      filter.connect(gainNode);
    }
    this._route(gainNode, position);

    osc.start(now);
    osc.stop(now + 0.25);
    if (noise) {
      noise.start(now);
      noise.stop(now + 0.25);
    }
  }

  /**
   * Triggers a low shield alert pulse beep.
   * @param {Object} [position] - Coordinate object {x, y}.
   */
  playLowShieldBeep(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.08);
    gainNode.gain.linearRampToValueAtTime(0.0, now + 0.1);

    osc.connect(gainNode);
    this._route(gainNode, position);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Triggers a low armor alert pulse warning.
   * @param {Object} [position] - Coordinate object {x, y}.
   */
  playLowArmorBeep(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // Tone A (0.15s)
    const oscA = this.ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.setValueAtTime(330, now);

    const gainA = this.ctx.createGain();
    gainA.gain.setValueAtTime(0.2, now);
    gainA.gain.linearRampToValueAtTime(0.2, now + 0.13);
    gainA.gain.linearRampToValueAtTime(0.0, now + 0.15);

    oscA.connect(gainA);
    this._route(gainA, position);

    // Tone B (0.15s, starts after tone A)
    const oscB = this.ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.setValueAtTime(380, now + 0.15);

    const gainB = this.ctx.createGain();
    gainB.gain.setValueAtTime(0.0, now);
    gainB.gain.setValueAtTime(0.2, now + 0.15);
    gainB.gain.linearRampToValueAtTime(0.2, now + 0.28);
    gainB.gain.linearRampToValueAtTime(0.0, now + 0.3);

    oscB.connect(gainB);
    this._route(gainB, position);

    oscA.start(now);
    oscA.stop(now + 0.15);

    oscB.start(now + 0.15);
    oscB.stop(now + 0.3);
  }

  /**
   * Triggers a reactor overheat alarm sweep.
   * @param {Object} [position] - Coordinate object {x, y}.
   */
  playOverheatSweep(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
    osc.frequency.linearRampToValueAtTime(880, now + 0.6);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.15, now);

    osc.connect(gainNode);
    this._route(gainNode, position);

    osc.start(now);
    osc.stop(now + 0.6);
  }

  /**
   * Updates warning alarm loop cycles based on client alert triggers.
   * @param {Object} alarms - States of alarms.
   * @param {boolean} alarms.lowShield - True if low shield.
   * @param {boolean} alarms.lowArmor - True if low armor.
   * @param {boolean} alarms.overheat - True if overheating.
   */
  updateAlarms({ lowShield, lowArmor, overheat }) {
    if (!this.ctx || this.ctx.state === "suspended") {
      return;
    }
    const nowMs = performance.now();

    // Low Shield Alert Loop
    if (lowShield) {
      if (!this._lowShieldActive) {
        this._lowShieldActive = true;
        this.lastLowShieldTime = 0; // Trigger immediately on first activation frame
      }
      if (nowMs - this.lastLowShieldTime >= 500) {
        this.lastLowShieldTime = nowMs;
        this.playLowShieldBeep();
      }
    } else {
      this._lowShieldActive = false;
    }

    // Low Armor Alert Loop
    if (lowArmor) {
      if (!this._lowArmorActive) {
        this._lowArmorActive = true;
        this.lastLowArmorTime = 0; // Trigger immediately
      }
      if (nowMs - this.lastLowArmorTime >= 800) {
        this.lastLowArmorTime = nowMs;
        this.playLowArmorBeep();
      }
    } else {
      this._lowArmorActive = false;
    }

    // Overheat Alert Loop
    if (overheat) {
      if (!this._overheatActive) {
        this._overheatActive = true;
        this.lastOverheatTime = 0; // Trigger immediately
      }
      if (nowMs - this.lastOverheatTime >= 600) {
        this.lastOverheatTime = nowMs;
        this.playOverheatSweep();
      }
    } else {
      this._overheatActive = false;
    }
  }

  /**
   * Synthesizes a cargo pickup sound effect (pleasant ascending dual-tone chime).
   * @param {Object} [position] - Coordinate object {x, y} of pickup.
   */
  playCargoPickup(position = null) {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // Tone 1
    const osc1 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(600, now);

    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    osc1.connect(gain1);
    this._route(gain1, position);

    // Tone 2 (starts slightly after tone 1)
    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(900, now + 0.08);

    const gain2 = this.ctx.createGain();
    gain2.gain.setValueAtTime(0.0, now);
    gain2.gain.setValueAtTime(0.15, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc2.connect(gain2);
    this._route(gain2, position);

    osc1.start(now);
    osc1.stop(now + 0.1);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.22);
  }

  /**
   * Synthesizes a spaceport landing/docking sound (heavy mechanical latch + steam hiss).
   */
  playDock() {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // 1. Heavy mechanical clank/thud
    const clankOsc = this.ctx.createOscillator();
    clankOsc.type = "triangle";
    clankOsc.frequency.setValueAtTime(80, now);
    clankOsc.frequency.linearRampToValueAtTime(40, now + 0.15);

    const clankGain = this.ctx.createGain();
    clankGain.gain.setValueAtTime(0.4, now);
    clankGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    clankOsc.connect(clankGain);
    this._route(clankGain); // Local cockpit sound

    // 2. Steam depressurization hiss
    try {
      const steamNoise = this._createNoiseNode();
      const steamFilter = this.ctx.createBiquadFilter();
      steamFilter.type = "bandpass";
      steamFilter.frequency.setValueAtTime(1000, now);
      steamFilter.frequency.exponentialRampToValueAtTime(600, now + 0.8);
      steamFilter.Q.setValueAtTime(1.0, now);

      const steamGain = this.ctx.createGain();
      steamGain.gain.setValueAtTime(0.0, now);
      steamGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      steamGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      steamNoise.connect(steamFilter);
      steamFilter.connect(steamGain);
      this._route(steamGain);

      steamNoise.start(now);
      steamNoise.stop(now + 0.8);
    } catch (_err) {
      // Safe fallback
    }

    clankOsc.start(now);
    clankOsc.stop(now + 0.2);
  }

  /**
   * Synthesizes a spaceport launching/undocking sound (latch release + engine puff).
   */
  playUndock() {
    if (!this.ctx || this.ctx.state === "suspended" || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // 1. Latch release thud
    const latchOsc = this.ctx.createOscillator();
    latchOsc.type = "triangle";
    latchOsc.frequency.setValueAtTime(120, now);
    latchOsc.frequency.linearRampToValueAtTime(80, now + 0.1);

    const latchGain = this.ctx.createGain();
    latchGain.gain.setValueAtTime(0.3, now);
    latchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    latchOsc.connect(latchGain);
    this._route(latchGain); // Local cockpit sound

    // 2. Thruster engine puff
    try {
      const puffNoise = this._createNoiseNode();
      const puffFilter = this.ctx.createBiquadFilter();
      puffFilter.type = "lowpass";
      puffFilter.frequency.setValueAtTime(300, now);
      puffFilter.frequency.exponentialRampToValueAtTime(100, now + 0.4);

      const puffGain = this.ctx.createGain();
      puffGain.gain.setValueAtTime(0.0, now);
      puffGain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      puffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      puffNoise.connect(puffFilter);
      puffFilter.connect(puffGain);
      this._route(puffGain);

      puffNoise.start(now);
      puffNoise.stop(now + 0.4);
    } catch (_err) {
      // Safe fallback
    }

    latchOsc.start(now);
    latchOsc.stop(now + 0.12);
  }
}
