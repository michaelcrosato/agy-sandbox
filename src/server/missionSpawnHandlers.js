import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";
import { AIController } from "../engine/ai/AIController.js";

/**
 * Registers callback handlers on a player's missionManager to handle storylines,
 * bounties, and escort target spawns within the player's active sector room.
 * @param {Object} clientObj
 * @param {Function} getRoom - Function to retrieve a room instance by ID
 */
export function registerMissionSpawnHandlers(clientObj, getRoom) {
  clientObj.missionManager.onStorylineStageAdvanced = (mission) => {
    const room = getRoom(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 220;
    const spawnPos = destPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
    );

    let bossShip;
    if (mission.stage === 2) {
      bossShip = new Ship({
        name: mission.targetName,
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 500,
        maxArmor: 300,
        thrustPower: 26000,
        turnRate: 2.8,
        weaponDamage: 30,
        weaponCooldown: 0.2,
      });
    } else if (mission.stage === 3) {
      bossShip = new Ship({
        name: mission.targetName,
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 1500,
        maxArmor: 1000,
        thrustPower: 35000,
        turnRate: 1.2,
        weaponDamage: 60,
        weaponCooldown: 0.4,
      });
    }

    if (bossShip) {
      const controller = new AIController(bossShip, "pirate", {
        useUtilityAdvisor: true,
        factionPolicy: room.factionRegistry
          ? room.factionRegistry.factionPolicy()
          : null,
        standingPolicy: room.factionRegistry
          ? room.factionRegistry.standingPolicy()
          : null,
      });
      room.engine.addEntity(bossShip);
      room.ais.push(controller);
    }

    clientObj.send({
      type: "notification",
      message: `STORY ALERT: ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error",
    });
  };

  clientObj.missionManager.onBountyAccepted = (mission) => {
    const room = getRoom(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 200;
    const spawnPos = destPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
    );

    const bossShip = new Ship({
      name: mission.targetName,
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 700,
      maxArmor: 450,
      thrustPower: 22000,
      turnRate: 2.2,
      weaponDamage: 40,
      weaponCooldown: 0.22,
    });

    const controller = new AIController(bossShip, "pirate", {
      useUtilityAdvisor: true,
      factionPolicy: room.factionRegistry
        ? room.factionRegistry.factionPolicy()
        : null,
      standingPolicy: room.factionRegistry
        ? room.factionRegistry.standingPolicy()
        : null,
    });
    room.engine.addEntity(bossShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `ALERT: Wanted threat ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error",
    });
  };

  clientObj.missionManager.onEscortAccepted = (mission) => {
    const room = getRoom(clientObj.roomId);
    if (!room) return;
    const originPlanet = room.planets.find((p) => p.name === mission.origin);
    if (!originPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = originPlanet.landingRadius + 180;
    const spawnPos = originPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
    );

    const transportShip = new Ship({
      name: "Diplomatic Transport",
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 400,
      maxArmor: 300,
      thrustPower: 12000,
      turnRate: 2.0,
      weaponDamage: 10,
      weaponCooldown: 0.5,
    });
    transportShip.role = "escort";
    transportShip.faction = mission.faction;

    const controller = new AIController(transportShip, "escort", {
      useUtilityAdvisor: true,
      factionPolicy: room.factionRegistry
        ? room.factionRegistry.factionPolicy()
        : null,
      standingPolicy: room.factionRegistry
        ? room.factionRegistry.standingPolicy()
        : null,
    });
    controller.flagship = clientObj.ship;
    controller.escortMode = "follow";

    room.engine.addEntity(transportShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message:
        "ESCORT ACTIVE: Keep the Diplomatic Transport safe on the way to destination!",
      style: "success",
    });
  };
}
