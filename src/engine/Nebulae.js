/**
 * Technical configuration for the active Space Tactical Nebula zones.
 * Coordinates are positioned strategically in intermediate zones between planetary sectors.
 */
export const NEBULAE = [
  {
    id: "nebula_crimson",
    name: "Crimson Veil Nebula",
    description: "A thick crimson dust cloud causing strong static friction and medium drag. Cloaks all ship signatures.",
    position: { x: 1000, y: 300 },
    radius: 450,
    color: "rgba(255, 48, 48, 0.15)",
    particleColor: "rgba(255, 48, 48, 0.4)",
    dragMultiplier: 2.2,
    hazardType: "friction"
  },
  {
    id: "nebula_azure",
    name: "Azure Abyss Nebula",
    description: "A chilling cryogenic vapor field causing massive engine drag. Dampens shield emissions.",
    position: { x: -1000, y: -800 },
    radius: 500,
    color: "rgba(0, 191, 255, 0.12)",
    particleColor: "rgba(0, 191, 255, 0.35)",
    dragMultiplier: 2.6,
    hazardType: "shield_dampen"
  },
  {
    id: "nebula_shadow",
    name: "Shadow Veil Nebula",
    description: "An ultra-dense dark matter fog. Provides extreme stealth capabilities, cutting off visual cues completely.",
    position: { x: 0, y: 1500 },
    radius: 400,
    color: "rgba(147, 112, 219, 0.13)",
    particleColor: "rgba(147, 112, 219, 0.4)",
    dragMultiplier: 1.8,
    hazardType: "stealth"
  }
];
