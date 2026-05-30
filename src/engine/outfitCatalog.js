/**
 * outfitCatalog (spec 020) — the single source of truth for the default outfit
 * catalogue. Previously this array was duplicated inline in both `Planet`'s
 * constructor and the server's salvage handler (and the salvage copy was a stale
 * subset missing the EW pierce/ramscoop/fuel/miner outfits). Both now import this.
 *
 * Each entry carries an optional `mass` (kg) that the server bolts onto the hull
 * on install (handling tradeoff). Frozen so the shared reference can't be mutated.
 */
export const DEFAULT_OUTFITS = Object.freeze([
  { name: "Heavy Shields", cost: 1200, type: "shield", value: 350, mass: 800 },
  {
    name: "Aegis Shield Matrix",
    cost: 4500,
    type: "shield",
    value: 800,
    mass: 1500,
  },
  {
    name: "Overcharged Engines",
    cost: 1500,
    type: "engine",
    value: 12000,
    mass: 200,
  },
  {
    name: "Hyper-Drive Thrusters",
    cost: 3800,
    type: "engine",
    value: 25000,
    mass: 400,
  },
  { name: "Plasma Cannon", cost: 1800, type: "weapon", value: 25, mass: 300 },
  { name: "Neutron Blaster", cost: 4200, type: "weapon", value: 55, mass: 600 },
  {
    name: "Ion Disruptor Array",
    cost: 5200,
    type: "pierce",
    value: 0.5,
    mass: 250,
    description:
      "Tunes weapon discharges to phase through shields: 50% of weapon damage strikes hull armor directly, ignoring shields.",
  },
  {
    name: "Expanded Cargo Holds",
    cost: 1000,
    type: "cargo",
    value: 15,
    mass: 500,
  },
  {
    name: "Sub-space Cargo Compressor",
    cost: 2800,
    type: "cargo",
    value: 45,
    mass: 1200,
  },
  {
    name: "Tractor Beam Matrix",
    cost: 2500,
    type: "tractor",
    value: 250,
    mass: 200,
    description:
      "Emits a high-frequency gravimetric tether that automatically pulls floating cargo pods within 250u towards the ship's bay.",
  },
  {
    name: "Cold-Fusion Reactor",
    cost: 3000,
    type: "reactor",
    value: 30,
    mass: 350,
    description:
      "Deep-space cold-fusion energy generator. Restores ship energy by +30 units/sec.",
  },
  {
    name: "Cryo-Cooling Radiator",
    cost: 2200,
    type: "radiator",
    value: 15,
    mass: 250,
    description:
      "Super-conductive helium radiator. Boosts heat dissipation by +15 units/sec.",
  },
  {
    name: "Supercapacitor Cells",
    cost: 1600,
    type: "capacitor",
    value: 100,
    mass: 200,
    description:
      "Nanotech storage bank cells. Increases max energy capacity by +100 units.",
  },
  {
    name: "Ramscoop Collector",
    cost: 2600,
    type: "ramscoop",
    value: 4,
    mass: 200,
    description:
      "Interstellar hydrogen funnel. Passively regenerates +4 hyperdrive fuel per second so you are never stranded between stargates.",
  },
  {
    name: "Auxiliary Fuel Cells",
    cost: 1800,
    type: "fuel",
    value: 50,
    mass: 300,
    description:
      "Reinforced cryo-fuel bunkerage. Increases maximum hyperdrive fuel by +50 units (and tops off the tank on install).",
  },
  {
    name: "Mining Laser",
    cost: 2400,
    type: "miner",
    value: 1,
    mass: 250,
    description:
      "Focused extraction beam. Doubles the cargo recovered from asteroids you shatter (+1.0 mining yield multiplier).",
  },
  {
    name: "Shielded Cargo Holds",
    cost: 3500,
    type: "jammer",
    value: 0.6,
    mass: 600,
    description:
      "Lead-shielded cargo containment. Reduces planetary security scan contraband detection probability by 60%.",
  },
  {
    name: "Security Decoy Jammer",
    cost: 5000,
    type: "jammer",
    value: 0.9,
    mass: 400,
    description:
      "Active military-grade scanner decoy. Reduces planetary security scan contraband detection probability by 90%.",
  },
]);
