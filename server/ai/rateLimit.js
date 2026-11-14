// @ts-check
// In-memory rolling windows, per user and a global ceiling per kind (one process; a restart resets them).
// A rejected call records nothing. Entries exist only for users with a call inside the window.

const HOUR_MS = 60 * 60 * 1000;
const SWEEP_EVERY = 256;
const SWEEP_SIZE = 1024;

/** @typedef {"save" | "test" | "tag"} CallKind */

/** Per user. @type {Record<CallKind, { max: number, windowMs: number }>} */
export const LIMITS = {
  test: { max: 20, windowMs: HOUR_MS },
  save: { max: 30, windowMs: HOUR_MS },
  tag: { max: 100, windowMs: 24 * HOUR_MS },
};

/** All users together: bounds outbound calls and `/test` as a key-validity oracle (A4). */
export const GLOBAL_LIMITS = {
  test: { max: 300, windowMs: HOUR_MS },
  save: { max: 600, windowMs: HOUR_MS },
  tag: { max: 2000, windowMs: 24 * HOUR_MS },
};

const KINDS = /** @type {CallKind[]} */ (["save", "test", "tag"]);

/** @param {{ now?: () => number }} [opts] */
export function createLimiter({ now = () => Date.now() } = {}) {
  /** @type {Map<string, Record<CallKind, number[]>>} */
  const users = new Map();
  /** @type {Record<CallKind, number[]>} */
  const global = { save: [], test: [], tag: [] };
  let checks = 0;

  /** @param {Record<CallKind, number[]>} calls @param {number} t */
  function prune(calls, t) {
    for (const k of KINDS) {
      const cut = t - LIMITS[k].windowMs;
      calls[k] = calls[k].filter((c) => c > cut);
    }
    return KINDS.every((k) => calls[k].length === 0);
  }

  /** @param {number} t */
  function sweep(t) {
    for (const [id, calls] of users) if (prune(calls, t)) users.delete(id);
  }

  return {
    /**
     * Counts an attempt. Returns false (and records nothing) at the user's or the global limit.
     * @param {string} userId
     * @param {CallKind} kind
     */
    check(userId, kind) {
      const t = now();
      if (++checks % SWEEP_EVERY === 0 || users.size > SWEEP_SIZE) sweep(t);
      const mine = users.get(userId) ?? { save: [], test: [], tag: [] };
      prune(mine, t);
      const gl = GLOBAL_LIMITS[kind];
      global[kind] = global[kind].filter((c) => c > t - gl.windowMs);
      if (mine[kind].length >= LIMITS[kind].max || global[kind].length >= gl.max) {
        if (prune(mine, t)) users.delete(userId);
        return false;
      }
      mine[kind].push(t);
      global[kind].push(t);
      users.set(userId, mine);
      return true;
    },
    /** Number of users with an entry (tests only). */
    size: () => users.size,
  };
}
