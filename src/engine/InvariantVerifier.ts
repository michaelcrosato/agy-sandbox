import { getOutfitCategory, removeOutfitStats } from "./Outfitting.js";
import { DEFAULT_OUTFITS } from "./outfitCatalog.js";

/**
 * Authoritative Game Invariant Verifier & Self-Healing Loop (SPEC-091).
 * Audits credit, cargo, physics, and fittings invariants of game entities and self-heals anomalies.
 */
export class InvariantVerifier {
  /**
   * Verifies and heals all entities inside a GameInstance.
   * @param {Object} gameInstance - The GameInstance containing entities to audit.
   * @param {Object} [logger] - Structured JSON logger to record healing operations.
   * @returns {number} The count of healed anomalies.
   */
  static verify(gameInstance, logger = null) {
    if (
      !gameInstance ||
      !gameInstance.engine ||
      !Array.isArray(gameInstance.engine.entities)
    ) {
      return 0;
    }

    let healedCount = 0;

    for (const ent of gameInstance.engine.entities) {
      if (!ent) continue;

      // 1. Physics Boundaries (apply to all physical entities)
      if (ent.position && ent.velocity) {
        if (
          typeof ent.position.x !== "number" ||
          isNaN(ent.position.x) ||
          !isFinite(ent.position.x) ||
          typeof ent.position.y !== "number" ||
          isNaN(ent.position.y) ||
          !isFinite(ent.position.y)
        ) {
          const oldX = ent.position.x;
          const oldY = ent.position.y;
          ent.position.x = 0;
          ent.position.y = 0;
          healedCount++;
          if (logger) {
            logger.warn("healed_physics_position_anomaly", {
              entityId: ent.id,
              entityType: ent.type,
              oldX,
              oldY,
              newX: 0,
              newY: 0,
            });
          }
        }

        if (
          typeof ent.velocity.x !== "number" ||
          isNaN(ent.velocity.x) ||
          !isFinite(ent.velocity.x) ||
          typeof ent.velocity.y !== "number" ||
          isNaN(ent.velocity.y) ||
          !isFinite(ent.velocity.y)
        ) {
          const oldVx = ent.velocity.x;
          const oldVy = ent.velocity.y;
          ent.velocity.x = 0;
          ent.velocity.y = 0;
          healedCount++;
          if (logger) {
            logger.warn("healed_physics_velocity_anomaly", {
              entityId: ent.id,
              entityType: ent.type,
              oldVx,
              oldVy,
              newVx: 0,
              newVy: 0,
            });
          }
        }
      }

      // 2. Ship-specific Invariants (apply to entities of type "ship")
      if (ent.type === "ship") {
        // A. Credit Integrity
        if (ent.credits !== undefined) {
          if (
            typeof ent.credits !== "number" ||
            isNaN(ent.credits) ||
            !isFinite(ent.credits) ||
            ent.credits < 0
          ) {
            const oldCredits = ent.credits;
            ent.credits = 0;
            healedCount++;
            if (logger) {
              logger.warn("healed_credit_anomaly", {
                shipId: ent.id,
                shipName: ent.name,
                oldCredits,
                newCredits: 0,
              });
            }
          }
        }

        // B. Cargo Constraints
        if (ent.cargo && typeof ent.cargoCapacity === "number") {
          let cargoAnomaly = false;
          let totalWeight = 0;

          // Normalize and check negative/non-finite cargo
          for (const key of Object.keys(ent.cargo)) {
            const amount = ent.cargo[key];
            if (
              typeof amount !== "number" ||
              isNaN(amount) ||
              !isFinite(amount) ||
              amount < 0
            ) {
              ent.cargo[key] = 0;
              cargoAnomaly = true;
            } else {
              totalWeight += amount;
            }
          }

          if (cargoAnomaly) {
            healedCount++;
            if (logger) {
              logger.warn("healed_cargo_format_anomaly", {
                shipId: ent.id,
                shipName: ent.name,
              });
            }
          }

          // Prune overflowing cargo if exceeds capacity
          if (totalWeight > ent.cargoCapacity) {
            let excess = totalWeight - ent.cargoCapacity;
            const keys = Object.keys(ent.cargo).sort();
            for (const key of keys) {
              if (excess <= 0) break;
              const amt = ent.cargo[key];
              if (amt > 0) {
                const pruneAmt = Math.min(amt, excess);
                ent.cargo[key] -= pruneAmt;
                excess -= pruneAmt;
                healedCount++;
                if (logger) {
                  logger.warn("healed_cargo_overflow", {
                    shipId: ent.id,
                    shipName: ent.name,
                    commodity: key,
                    prunedAmount: pruneAmt,
                  });
                }
              }
            }
          }
        }

        // C. Fittings Caps slot classifications
        if (Array.isArray(ent.outfits)) {
          const counts = { weapon: 0, shield: 0, utility: 0 };
          const keptOutfits = [];
          const overflowed = [];

          for (const name of ent.outfits) {
            let catEntry = DEFAULT_OUTFITS.find((o) => o.name === name);
            if (name === "Basic Laser" && !catEntry) {
              catEntry = {
                name: "Basic Laser",
                cost: 0,
                type: "weapon",
                value: 5,
                mass: 100,
              };
            }

            if (catEntry) {
              const category = getOutfitCategory(catEntry.type);
              if (category === "general") {
                keptOutfits.push(name);
              } else {
                const limit = category === "weapon" ? 2 : 1;
                if (counts[category] < limit) {
                  counts[category]++;
                  keptOutfits.push(name);
                } else {
                  overflowed.push(catEntry);
                }
              }
            } else {
              keptOutfits.push(name);
            }
          }

          if (overflowed.length > 0) {
            for (const outfit of overflowed) {
              removeOutfitStats(ent, outfit);
              healedCount++;
              if (logger) {
                logger.warn("healed_fitting_overflow", {
                  shipId: ent.id,
                  shipName: ent.name,
                  outfitName: outfit.name,
                });
              }
            }
            ent.outfits = keptOutfits;
          }
        }
      }
    }

    return healedCount;
  }
}
