import { describe, it, expect, beforeEach, vi } from "vitest";
import SoundEngine from "../audio/SoundEngine.js";

// Mock implementation of Web Audio API classes
class MockAudioParam {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.setValueAtTime = vi.fn().mockImplementation((val, _time) => {
      this.value = val;
      return this;
    });
    this.linearRampToValueAtTime = vi.fn().mockReturnThis();
    this.exponentialRampToValueAtTime = vi.fn().mockReturnThis();
    this.setTargetAtTime = vi
      .fn()
      .mockImplementation((val, _time, _constant) => {
        this.value = val;
        return this;
      });
  }
}

class MockAudioNode {
  constructor() {
    this.connect = vi.fn().mockReturnValue(this);
    this.disconnect = vi.fn();
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1.0);
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor() {
    super();
    this.pan = new MockAudioParam(0.0);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type = "sine";
    this.frequency = new MockAudioParam(440);
    this.start = vi.fn();
    this.stop = vi.fn();
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = "lowpass";
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1.0);
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.start = vi.fn();
    this.stop = vi.fn();
  }
}

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channelData = new Float32Array(length);
  }
  getChannelData() {
    return this.channelData;
  }
}

class MockAudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 10.0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode();

    this.createGain = vi.fn().mockImplementation(() => new MockGainNode());
    this.createStereoPanner = vi
      .fn()
      .mockImplementation(() => new MockStereoPannerNode());
    this.createOscillator = vi
      .fn()
      .mockImplementation(() => new MockOscillatorNode());
    this.createBiquadFilter = vi
      .fn()
      .mockImplementation(() => new MockBiquadFilterNode());
    this.createBufferSource = vi
      .fn()
      .mockImplementation(() => new MockAudioBufferSourceNode());
    this.createBuffer = vi
      .fn()
      .mockImplementation(
        (ch, len, rate) => new MockAudioBuffer(ch, len, rate),
      );
    this.resume = vi.fn().mockImplementation(() => {
      this.state = "running";
      return Promise.resolve();
    });
    this.suspend = vi.fn().mockImplementation(() => {
      this.state = "suspended";
      return Promise.resolve();
    });
  }
}

describe("SoundEngine", () => {
  let engine;

  beforeEach(() => {
    vi.spyOn(performance, "now").mockReturnValue(10000);
    // Set up mock globally before each test
    global.AudioContext = MockAudioContext;
    global.window = {
      AudioContext: MockAudioContext,
    };
    engine = new SoundEngine();
  });

  describe("Lifecycle & Deferral", () => {
    it("should defer AudioContext initialization until start is called", () => {
      expect(engine.ctx).toBeNull();
      engine.start();
      expect(engine.ctx).not.toBeNull();
      expect(engine.ctx.createGain).toHaveBeenCalled();
    });

    it("should resume the context on subsequent start calls if suspended", () => {
      engine.start();
      const resumeSpy = vi.spyOn(engine.ctx, "resume");
      engine.ctx.state = "suspended";
      engine.start();
      expect(resumeSpy).toHaveBeenCalled();
    });

    it("should not create a new context on subsequent start calls if running", () => {
      engine.start();
      const firstCtx = engine.ctx;
      engine.ctx.state = "running";
      engine.start();
      expect(engine.ctx).toBe(firstCtx);
    });

    it("should initialize as muted if constructed with muted options", () => {
      const mutedEngine1 = new SoundEngine(true);
      expect(mutedEngine1.muted).toBe(true);

      const mutedEngine2 = new SoundEngine({ muted: true });
      expect(mutedEngine2.muted).toBe(true);

      const unmutedEngine = new SoundEngine({ muted: false });
      expect(unmutedEngine.muted).toBe(false);
    });
  });

  describe("Master Volume & Muting", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should initialize with default volume", () => {
      expect(engine.volume).toBe(0.5);
      expect(engine.masterGain.gain.value).toBe(0.5);
    });

    it("should change volume and respect bounds", () => {
      engine.setVolume(0.8);
      expect(engine.volume).toBe(0.8);
      expect(engine.masterGain.gain.value).toBe(0.8);

      engine.setVolume(1.5); // should clamp to 1.0
      expect(engine.volume).toBe(1.0);

      engine.setVolume(-0.5); // should clamp to 0.0
      expect(engine.volume).toBe(0.0);
    });

    it("should mute and unmute master gain", () => {
      engine.mute();
      expect(engine.muted).toBe(true);
      expect(engine.masterGain.gain.value).toBe(0.0);

      engine.unmute();
      expect(engine.muted).toBe(false);
      expect(engine.masterGain.gain.value).toBe(engine.volume);
    });
  });

  describe("Spatial Panning & Proximity Volume Decay", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should track listener position and default to 0,0", () => {
      expect(engine.listenerX).toBe(0);
      expect(engine.listenerY).toBe(0);

      engine.setListenerPosition(100, -200);
      expect(engine.listenerX).toBe(100);
      expect(engine.listenerY).toBe(-200);
    });

    it("should apply correct panning and decay based on relative position", () => {
      const pannerSpy = vi.spyOn(engine.ctx, "createStereoPanner");
      const gainSpy = vi.spyOn(engine.ctx, "createGain");

      // Listener at (0, 0), source at (1500, 0) -> dx = 1500, distance = 1500
      // pan = 1500 / 1500 = 1.0
      // gainScale = 1 - 1500 / 3000 = 0.5
      engine.setListenerPosition(0, 0);
      engine.playWeapon("laser", { x: 1500, y: 0 });

      expect(pannerSpy).toHaveBeenCalled();
      const mockPanner = pannerSpy.mock.results[0].value;
      expect(mockPanner.pan.value).toBeCloseTo(1.0);

      const mockGains = gainSpy.mock.results.map((r) => r.value);
      const spatialGain = mockGains.find(
        (g) => g !== engine.masterGain && g.gain.value === 0.5,
      );
      expect(spatialGain).toBeDefined();
    });

    it("should clamp panning to [-1.0, 1.0] for large dx values", () => {
      const pannerSpy = vi.spyOn(engine.ctx, "createStereoPanner");

      engine.setListenerPosition(100, 100);
      // dx = 3000 - 100 = 2900 -> pan = 2900 / 1500 = 1.93 -> clamp to 1.0
      engine.playWeapon("laser", { x: 3000, y: 100 });

      const mockPanner = pannerSpy.mock.results[0].value;
      expect(mockPanner.pan.value).toBe(1.0);

      // dx = -3000 - 100 = -3100 -> pan = -3100 / 1500 = -2.06 -> clamp to -1.0
      engine.playWeapon("plasma", { x: -3000, y: 100 });
      const mockPanner2 = pannerSpy.mock.results[1].value;
      expect(mockPanner2.pan.value).toBe(-1.0);
    });

    it("should decay gainScale to 0 for distance >= 3000", () => {
      const gainSpy = vi.spyOn(engine.ctx, "createGain");

      engine.setListenerPosition(0, 0);
      // distance = 3000 -> gainScale = 1 - 3000 / 3000 = 0
      engine.playWeapon("laser", { x: 0, y: 3000 });

      const mockGains = gainSpy.mock.results.map((r) => r.value);
      const spatialGain = mockGains.find(
        (g) => g !== engine.masterGain && g.gain.value === 0,
      );
      expect(spatialGain).toBeDefined();
    });

    it("should route nodes properly: SourceNode -> StereoPannerNode -> SpatialGainNode -> masterGain", () => {
      const pannerSpy = vi.spyOn(engine.ctx, "createStereoPanner");
      const gainSpy = vi.spyOn(engine.ctx, "createGain");

      engine.setListenerPosition(0, 0);
      engine.playWeapon("laser", { x: 150, y: 150 });

      const mockPanner = pannerSpy.mock.results[0].value;
      const mockGains = gainSpy.mock.results.map((r) => r.value);
      // The first gain is the laser envelope gain, the second is the spatial gain.
      const spatialGain = mockGains[1];

      expect(mockPanner.connect).toHaveBeenCalledWith(spatialGain);
      expect(spatialGain.connect).toHaveBeenCalledWith(engine.masterGain);
    });
  });

  describe("Thruster Sound Modulation", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should update thruster variables for idle state", () => {
      engine.setThrusterState(0.0, false);
      expect(engine.thrusterOsc.frequency.value).toBe(55);
      expect(engine.thrusterOscGain.gain.value).toBe(0.05);
      expect(engine.thrusterLFOGainFreq.gain.value).toBe(0);
    });

    it("should update thruster variables for max throttle state", () => {
      engine.setThrusterState(1.0, false);
      expect(engine.thrusterOsc.frequency.value).toBe(110);
      expect(engine.thrusterOscGain.gain.value).toBe(0.2);
    });

    it("should update thruster variables for boost state", () => {
      engine.setThrusterState(1.0, true);
      expect(engine.thrusterOsc.frequency.value).toBe(180);
      expect(engine.thrusterOscGain.gain.value).toBe(0.45);
      expect(engine.thrusterLFOGainFreq.gain.value).toBe(15);
      expect(engine.thrusterLFOGainAmp.gain.value).toBe(0.08);
    });
  });

  describe("Warp Jump (One-shot)", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should trigger warp jump nodes and automate frequencies", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const noiseSpy = vi.spyOn(engine.ctx, "createBufferSource");
      engine.playWarpJump();

      expect(oscSpy).toHaveBeenCalled();
      expect(noiseSpy).toHaveBeenCalled();
    });
  });

  describe("Weapon Fires (One-shot)", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should trigger laser sound", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      engine.playWeapon("laser");
      expect(oscSpy).toHaveBeenCalled();
      const osc = oscSpy.mock.results[0].value;
      expect(osc.type).toBe("sine");
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });

    it("should trigger plasma sound", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const filterSpy = vi.spyOn(engine.ctx, "createBiquadFilter");
      engine.playWeapon("plasma");

      expect(oscSpy).toHaveBeenCalled();
      const osc = oscSpy.mock.results[0].value;
      expect(osc.type).toBe("square");
      expect(filterSpy).toHaveBeenCalled();
      const filter = filterSpy.mock.results[0].value;
      expect(filter.type).toBe("lowpass");
    });

    it("should trigger neutron sound", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const filterSpy = vi.spyOn(engine.ctx, "createBiquadFilter");
      engine.playWeapon("neutron");

      expect(oscSpy).toHaveBeenCalled();
      const osc = oscSpy.mock.results[0].value;
      expect(osc.type).toBe("sawtooth");
      expect(filterSpy).toHaveBeenCalled();
      const filter = filterSpy.mock.results[0].value;
      expect(filter.type).toBe("lowpass");
    });

    it("should trigger ion sound", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const filterSpy = vi.spyOn(engine.ctx, "createBiquadFilter");
      engine.playWeapon("ion");

      expect(oscSpy).toHaveBeenCalled();
      const osc = oscSpy.mock.results[0].value;
      expect(osc.type).toBe("sine");
      expect(filterSpy).toHaveBeenCalled();
      const filter = filterSpy.mock.results[0].value;
      expect(filter.type).toBe("bandpass");
    });
  });

  describe("Shield & Armor Impacts (One-shot)", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should trigger shield hit chime using three harmonics", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      engine.playShieldImpact();
      expect(oscSpy).toHaveBeenCalledTimes(3);
    });

    it("should trigger armor low thud", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const noiseSpy = vi.spyOn(engine.ctx, "createBufferSource");
      engine.playArmorImpact();

      expect(oscSpy).toHaveBeenCalled();
      expect(noiseSpy).toHaveBeenCalled();
    });
  });

  describe("Cargo Pickup & Spaceport Dock/Undock (One-shot)", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should trigger cargo pickup chime with two oscillators", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      engine.playCargoPickup({ x: 100, y: 100 });
      expect(oscSpy).toHaveBeenCalledTimes(2);
      const osc1 = oscSpy.mock.results[0].value;
      const osc2 = oscSpy.mock.results[1].value;
      expect(osc1.type).toBe("sine");
      expect(osc2.type).toBe("sine");
      expect(osc1.start).toHaveBeenCalled();
      expect(osc2.start).toHaveBeenCalled();
    });

    it("should trigger docking mechanical clank and steam hiss", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const noiseSpy = vi.spyOn(engine.ctx, "createBufferSource");
      engine.playDock();
      expect(oscSpy).toHaveBeenCalled();
      expect(noiseSpy).toHaveBeenCalled();
      const osc = oscSpy.mock.results[0].value;
      expect(osc.type).toBe("triangle");
      expect(osc.start).toHaveBeenCalled();
    });

    it("should trigger undocking mechanical release and engine puff", () => {
      const oscSpy = vi.spyOn(engine.ctx, "createOscillator");
      const noiseSpy = vi.spyOn(engine.ctx, "createBufferSource");
      engine.playUndock();
      expect(oscSpy).toHaveBeenCalled();
      expect(noiseSpy).toHaveBeenCalled();
      const osc = oscSpy.mock.results[0].value;
      expect(osc.type).toBe("triangle");
      expect(osc.start).toHaveBeenCalled();
    });
  });

  describe("Periodic Alarms", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should trigger low shield warning beep when active", () => {
      const beepSpy = vi.spyOn(engine, "playLowShieldBeep");
      engine.updateAlarms({
        lowShield: true,
        lowArmor: false,
        overheat: false,
      });
      expect(beepSpy).toHaveBeenCalled();
    });

    it("should trigger low armor warning dual-tone when active", () => {
      const beepSpy = vi.spyOn(engine, "playLowArmorBeep");
      engine.updateAlarms({
        lowShield: false,
        lowArmor: true,
        overheat: false,
      });
      expect(beepSpy).toHaveBeenCalled();
    });

    it("should trigger reactor overheat sweep when active", () => {
      const sweepSpy = vi.spyOn(engine, "playOverheatSweep");
      engine.updateAlarms({
        lowShield: false,
        lowArmor: false,
        overheat: true,
      });
      expect(sweepSpy).toHaveBeenCalled();
    });
  });

  describe("Optimization & Teardown", () => {
    beforeEach(() => {
      engine.start();
      vi.clearAllMocks();
    });

    it("should cache the white noise AudioBuffer and reuse it on subsequent creations", () => {
      const createBufferSpy = vi.spyOn(engine.ctx, "createBuffer");

      const firstNode = engine._createNoiseNode();
      const secondNode = engine._createNoiseNode();

      expect(engine.sharedNoiseBuffer).not.toBeNull();
      expect(createBufferSpy).toHaveBeenCalledTimes(0);
      expect(firstNode.buffer).toBe(engine.sharedNoiseBuffer);
      expect(secondNode.buffer).toBe(engine.sharedNoiseBuffer);
    });

    it("should stop and disconnect all active nodes and nullify references when stop() is called", () => {
      expect(engine.thrusterOsc).not.toBeNull();
      expect(engine.thrusterLFO).not.toBeNull();
      expect(engine.thrusterNoise).not.toBeNull();

      const thrusterOscStopSpy = vi.spyOn(engine.thrusterOsc, "stop");
      const thrusterLFOStopSpy = vi.spyOn(engine.thrusterLFO, "stop");
      const thrusterNoiseStopSpy = vi.spyOn(engine.thrusterNoise, "stop");
      const masterGainDisconnectSpy = vi.spyOn(engine.masterGain, "disconnect");

      engine.ctx.close = vi.fn().mockResolvedValue(undefined);

      engine.stop();

      expect(thrusterOscStopSpy).toHaveBeenCalled();
      expect(thrusterLFOStopSpy).toHaveBeenCalled();
      expect(thrusterNoiseStopSpy).toHaveBeenCalled();
      expect(masterGainDisconnectSpy).toHaveBeenCalled();

      expect(engine.ctx).toBeNull();
      expect(engine.thrusterOsc).toBeNull();
      expect(engine.thrusterLFO).toBeNull();
      expect(engine.thrusterNoise).toBeNull();
      expect(engine.masterGain).toBeNull();
      expect(engine.sharedNoiseBuffer).toBeNull();
    });

    it("should support dispose() alias", () => {
      const stopSpy = vi.spyOn(engine, "stop");
      engine.dispose();
      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
