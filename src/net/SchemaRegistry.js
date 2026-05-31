/**
 * SchemaRegistry.js — a centralized registry for all core commodities dictionary
 * configurations and WebSocket network command structures (SPEC-099).
 *
 * This serves as the single source of truth to prevent drift between client and server.
 */

/**
 * The canonical commodities configuration details.
 * Defines mass, baseValue, illegal status, and category for each commodity.
 * Order of keys matches the historical wire order of commodities.
 * @type {Record<string, { mass: number, baseValue: number, illegal: boolean, category: string }>}
 */
export const COMMODITIES_METADATA = Object.freeze({
  food: {
    mass: 1.0,
    baseValue: 100,
    illegal: false,
    category: "basic",
  },
  electronics: {
    mass: 2.0,
    baseValue: 300,
    illegal: false,
    category: "tech",
  },
  minerals: {
    mass: 1.5,
    baseValue: 150,
    illegal: false,
    category: "raw",
  },
  luxuries: {
    mass: 1.0,
    baseValue: 600,
    illegal: false,
    category: "luxury",
  },
  contraband: {
    mass: 0.5,
    baseValue: 250,
    illegal: true,
    category: "contraband",
  },
  machinery: {
    mass: 3.0,
    baseValue: 100,
    illegal: false,
    category: "industrial",
  },
  ore: {
    mass: 2.5,
    baseValue: 90,
    illegal: false,
    category: "raw",
  },
});

/**
 * The canonical, frozen commodity list.
 * @type {ReadonlyArray<string>}
 */
export const COMMODITIES = Object.freeze(Object.keys(COMMODITIES_METADATA));

/**
 * The base market prices for each commodity per planet.
 * Used as a comparison baseline for economic simulation.
 * @type {Record<string, Record<string, number>>}
 */
export const BASE_MARKETS = Object.freeze({
  Sol: {
    food: 100,
    electronics: 300,
    minerals: 150,
    luxuries: 600,
    contraband: 250,
    machinery: 100,
    ore: 90,
  },
  "New Polaris": {
    food: 220,
    electronics: 320,
    minerals: 50,
    luxuries: 650,
    contraband: 300,
    machinery: 220,
    ore: 55,
  },
  "Sigma Draconis": {
    food: 120,
    electronics: 120,
    minerals: 250,
    luxuries: 500,
    contraband: 200,
    machinery: 160,
    ore: 130,
  },
  "Kaelis Colony": {
    food: 40,
    electronics: 420,
    minerals: 180,
    luxuries: 550,
    contraband: 280,
    machinery: 190,
    ore: 85,
  },
  "Aurelia Mining Hub": {
    food: 150,
    electronics: 290,
    minerals: 70,
    luxuries: 580,
    contraband: 260,
    machinery: 150,
    ore: 50,
  },
  "Tenebris Prime": {
    food: 160,
    electronics: 450,
    minerals: 200,
    luxuries: 220,
    contraband: 400,
    machinery: 240,
    ore: 95,
  },
  "Valkyrie Depot": {
    food: 110,
    electronics: 380,
    minerals: 190,
    luxuries: 520,
    contraband: 220,
    machinery: 80,
    ore: 125,
  },
  "Rogue's Hollow": {
    food: 250,
    electronics: 220,
    minerals: 160,
    luxuries: 450,
    contraband: 60,
    machinery: 180,
    ore: 80,
  },
});

/**
 * WebSocket message/command schemas used for inbound/outbound validation and sanitization.
 * @type {Record<string, Record<string, any>>}
 */
export const SCHEMAS = Object.freeze({
  join: {
    sessionToken: { type: "string", optional: true },
    nickname: { type: "string", optional: true, maxLength: 20 },
  },
  quick_join: {
    mode: { type: "string", optional: true },
    tags: { type: "array", optional: true, itemType: "string" },
  },
  create_room: {
    roomName: { type: "string", required: true, maxLength: 50 },
    mode: { type: "string", optional: true },
    tags: { type: "array", optional: true, itemType: "string" },
  },
  join_room: {
    roomId: { type: "string", required: true },
    nickname: { type: "string", optional: true, maxLength: 20 },
  },
  controls: {
    keys: { type: "object", optional: true },
    heading: { type: "number", optional: true, finite: true },
    warp: { type: "boolean", optional: true },
  },
  land: {
    planetName: { type: "string", required: true },
  },
  launch: {},
  trade: {
    planetName: { type: "string", required: true },
    commodity: { type: "string", required: true },
    amount: { type: "integer", required: true, min: 0 },
    buy: { type: "boolean", required: true },
  },
  port_service: {
    service: { type: "string", required: true },
  },
  port_refine: {},
  ore_refine: {},
  jettison: {
    commodity: { type: "string", required: true },
    amount: { type: "integer", required: true, min: 1 },
  },
  outfit_buy: {
    outfitKey: { type: "string", required: true },
  },
  outfit_sell: {
    outfitKey: { type: "string", required: true },
  },
  preset_save: {
    presetIndex: { type: "integer", optional: true, min: 0 },
    presetName: { type: "string", optional: true, maxLength: 30 },
  },
  preset_load: {
    presetIndex: { type: "integer", optional: true, min: 0 },
  },
  ship_buy: {
    hullKey: { type: "string", required: true },
  },
  squad_invite: {
    targetPlayerId: { type: "string", required: true },
  },
  squad_join: {
    squadId: { type: "string", required: true },
  },
  squad_leave: {},
  port_redeem_vouchers: {},
  mission_accept: {
    missionId: { type: "string", required: true },
  },
  mission_abandon: {
    missionId: { type: "string", required: true },
  },
  fleet_create: {
    fleetName: { type: "string", required: true, maxLength: 30 },
  },
  fleet_join: {
    fleetName: { type: "string", required: true, maxLength: 30 },
  },
  fleet_leave: {},
  chat: {
    text: { type: "string", required: true, maxLength: 100 },
    channel: { type: "string", optional: true },
  },
  warp_jump: {
    stargateId: { type: "string", required: true },
  },
  boarding_action: {
    targetId: { type: "string", required: true },
  },
  escort_command: {
    command: { type: "string", required: true },
  },
  escort_formation: {
    formation: { type: "string", required: true },
  },
  distress_beacon: {},
  ping: {},
  tutorial_complete: {},
});
