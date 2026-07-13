/**
 * logger (spec 010) — a tiny structured (JSON-line) logger with level filtering
 * and no dependencies. Each call emits one `{level, ts, msg, ...fields}` line via
 * an injectable sink (defaults to `console.log`). Resilient: if `fields` can't be
 * serialized it falls back to a bare line rather than throwing on the hot path.
 */

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/**
 * @param {Object} [options]
 * @param {("debug"|"info"|"warn"|"error")} [options.level="info"] - Minimum level emitted.
 * @param {() => string} [options.now] - Timestamp source (ISO string).
 * @param {(line: string) => void} [options.sink] - Where lines go.
 * @returns {{debug:Function, info:Function, warn:Function, error:Function}}
 */
export function createLogger({
  level = "info",
  now = () => new Date().toISOString(),
  sink = (line) => console.log(line),
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function emit(lvl, msg, fields) {
    if ((LEVELS[lvl] ?? 0) < threshold) return;
    let line;
    try {
      line = JSON.stringify({ level: lvl, ts: now(), msg, ...(fields || {}) });
    } catch {
      line = JSON.stringify({ level: lvl, ts: now(), msg: String(msg) });
    }
    sink(line);
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}
