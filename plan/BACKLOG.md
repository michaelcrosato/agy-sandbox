# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- **NPC Smuggler Fleets & Underworld Trader AI (P5 - Goal-Driven NPCs):**
  Configure Goal-Driven UtilityAI merchants to occasionally smuggle contraband cargo between Rogue's Hollow and major faction worlds, selecting evasion maneuvers and using decoy jammers if pursued by security guards.

- **Dynamic Trade Profit Metric in AI Perception (P5):**
  Feed actual, live standings-adjusted market price spreads directly into `buildPerception`'s `tradeProfit` (currently a flat 0.6) so that NPC traders actively seek and run the top-yielding sector trade routes.

- **Stargate Navigation NAV-computer Overlay (P8 - Presentation & Game Feel):**
  Add a navigation map helper tab inside the cockpit HUD calculating the shortest stargate pathfinding route between sectors, highlighting stargates dynamically on the navigation HUD.
