/**
 * GalacticChronicle (P1 / P2).
 *
 * A persistent ledger recording macro simulation events in the living galaxy
 * (e.g., commodity shortages, faction clashes, stargate interdictions).
 * Exposes chronicle history dynamically to the observability dashboard.
 *
 * Uses the active Store instance to persist history under the key 'chronicle'.
 * Implements standard memory caching and an ordered write queue to prevent
 * concurrent file/database race conditions.
 */
export class GalacticChronicle {
  /**
   * @param {Object} [config]
   * @param {import("./Store.js").Store} [config.store] - The backing store instance.
   * @param {number} [config.maxEvents=200] - Maximum history capacity before pruning.
   */
  constructor({ store, maxEvents = 200 } = {}) {
    if (!store) {
      throw new TypeError("GalacticChronicle: a Store instance is required");
    }
    this.store = store;
    this.maxEvents = maxEvents;
    this.events = [];
    this.key = "chronicle";
    this._writeQueue = Promise.resolve();
  }

  /**
   * Loads the chronicle from the backing store.
   * @returns {Promise<Array<Object>>} Resolved array of chronicle events.
   */
  async load() {
    try {
      const data = await this.store.load(this.key);
      if (Array.isArray(data)) {
        this.events = data;
      } else {
        this.events = [];
      }
    } catch (err) {
      // Defensively fallback to empty if store fails or has corrupt payload
      this.events = [];
    }
    return this.events;
  }

  /**
   * Records a new macro event, prepending it to show newest-first,
   * prunes older events beyond max capacity, and triggers an async queued write.
   *
   * @param {Object} [eventData]
   * @param {string} [eventData.sector] - Sector where the event took place.
   * @param {string} [eventData.category] - Category (e.g. 'economy', 'combat', 'system').
   * @param {string} [eventData.title] - Concise title of the event.
   * @param {string} [eventData.description] - Detailed description.
   * @param {Object} [eventData.impactMetrics] - Impact metadata (e.g., price multipliers, ship count).
   * @returns {Promise<Object>} The newly recorded event object.
   */
  async recordEvent({
    sector,
    category,
    title,
    description,
    impactMetrics,
  } = {}) {
    const event = {
      timestamp: Date.now(),
      sector: sector || "Unknown",
      category: category || "general",
      title: title || "Simulation Event",
      description: description || "",
      impactMetrics: impactMetrics || {},
    };

    this.events.unshift(event);

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    await this.save();
    return event;
  }

  /**
   * Enqueues a write task to persist the current events list.
   * @returns {Promise<void>} Resolves when this write (and all preceding queued ones) finishes.
   */
  async save() {
    this._writeQueue = this._writeQueue
      .then(async () => {
        await this.store.save(this.key, this.events);
      })
      .catch((_err) => {
        // Suppress and log store errors to avoid crashing game loop ticks
      });
    return this._writeQueue;
  }

  /**
   * Returns the current events in memory.
   * @returns {Array<Object>}
   */
  getEvents() {
    return this.events;
  }

  /**
   * Clears the current event list in memory and on disk. Primarily used for tests.
   * @returns {Promise<void>}
   */
  async clear() {
    this.events = [];
    await this.save();
  }
}
