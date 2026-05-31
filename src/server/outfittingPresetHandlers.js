import { applyOutfitStats, removeOutfitStats } from "../engine/Outfitting.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";
import { canLoadPreset, getPresetOutfits } from "../engine/LoadoutManager.js";

/**
 * Saves current outfitting configuration to a custom preset slot.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} presetIndex - Index of the preset to save (0, 1, or 2).
 * @param {string|null} [presetName=null] - Custom name for the preset.
 */
export function handlePresetSave(clientObj, presetIndex, presetName = null) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded) return;

  if (typeof presetIndex !== "number" || presetIndex < 0 || presetIndex > 2) {
    clientObj.send({
      type: "notification",
      message: "Invalid preset slot (0-2)!",
      style: "error",
    });
    return;
  }

  if (!Array.isArray(clientObj.presets)) {
    clientObj.presets = [null, null, null];
  }

  const name =
    typeof presetName === "string" && presetName.trim()
      ? presetName.trim()
      : `Preset Slot ${presetIndex + 1}`;

  clientObj.presets[presetIndex] = {
    name: name,
    outfits: [...clientObj.ship.outfits],
  };

  clientObj.send({
    type: "notification",
    message: `Saved Preset: "${name}"!`,
    style: "success",
  });
}

/**
 * Loads a custom preset configuration, enforcing transactions, slots, power constraints, and stock availability.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} presetIndex - Index of the preset to load (0, 1, or 2).
 * @param {Object} targetPlanet - The planet entity player is landed on.
 * @param {Object|null} [room=null] - Dynamic GameInstance room.
 */
export function handlePresetLoad(
  clientObj,
  presetIndex,
  targetPlanet,
  room = null,
) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded || !targetPlanet)
    return;

  if (typeof presetIndex !== "number" || presetIndex < 0 || presetIndex > 2) {
    clientObj.send({
      type: "notification",
      message: "Invalid preset slot (0-2)!",
      style: "error",
    });
    return;
  }

  if (!Array.isArray(clientObj.presets) || !clientObj.presets[presetIndex]) {
    clientObj.send({
      type: "notification",
      message: `No preset saved in slot ${presetIndex + 1}!`,
      style: "error",
    });
    return;
  }

  const preset = clientObj.presets[presetIndex];
  const ship = clientObj.ship;
  const factionRegistry = room ? room.factionRegistry : null;
  const sectorId = room && room.sectorId ? room.sectorId : null;

  // Run comprehensive validation via LoadoutManager
  const check = canLoadPreset(
    ship,
    preset,
    targetPlanet,
    clientObj.id,
    factionRegistry,
    sectorId,
    DEFAULT_OUTFITS,
  );

  if (!check.allowed) {
    clientObj.send({
      type: "notification",
      message: check.reason,
      style: "error",
    });
    return;
  }

  const { netCreditsChange } = check.details;

  // Uninstall current equipped outfits
  const originalOutfits = [...ship.outfits];
  for (const name of originalOutfits) {
    let outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (!outfit && name === "Basic Laser") {
      outfit = {
        name: "Basic Laser",
        cost: 0,
        type: "weapon",
        value: 0,
        mass: 0,
      };
    }
    if (outfit) {
      removeOutfitStats(ship, outfit);
    }
  }
  ship.outfits = [];

  // Install target preset outfits
  const targetPresetOutfits = getPresetOutfits(preset);
  for (const name of targetPresetOutfits) {
    ship.outfits.push(name);
    let outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (!outfit && name === "Basic Laser") {
      outfit = {
        name: "Basic Laser",
        cost: 0,
        type: "weapon",
        value: 0,
        mass: 0,
      };
    }
    if (outfit) {
      applyOutfitStats(ship, outfit);
    }
  }

  // Adjust player credits
  ship.credits += netCreditsChange;

  const presetNameText =
    typeof preset === "object" && preset.name
      ? `"${preset.name}"`
      : `${presetIndex + 1}`;

  clientObj.send({
    type: "notification",
    message: `Loaded Preset ${presetNameText}! Net Transaction: ${netCreditsChange >= 0 ? "+" : ""}${netCreditsChange.toLocaleString()} CR`,
    style: "success",
  });
  clientObj.sendStats();
}

/**
 * Deletes a custom preset from a slot.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} presetIndex - Index of the preset to delete (0, 1, or 2).
 */
export function handlePresetDelete(clientObj, presetIndex) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded) return;

  if (typeof presetIndex !== "number" || presetIndex < 0 || presetIndex > 2) {
    clientObj.send({
      type: "notification",
      message: "Invalid preset slot (0-2)!",
      style: "error",
    });
    return;
  }

  if (!Array.isArray(clientObj.presets)) {
    clientObj.presets = [null, null, null];
  }

  const name = clientObj.presets[presetIndex]
    ? clientObj.presets[presetIndex].name
    : `Preset Slot ${presetIndex + 1}`;

  clientObj.presets[presetIndex] = null;

  clientObj.send({
    type: "notification",
    message: `Deleted Preset: "${name}"!`,
    style: "success",
  });
}
