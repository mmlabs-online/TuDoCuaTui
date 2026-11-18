// @ts-check
// In-memory rolling windows, per user and a global ceiling per kind (one process; a restart resets them).
// A rejected call records nothing. Entries exist only for users with a call inside the window.

const HOUR_MS = 60 * 60 * 1000;
const SWEEP_EVERY = 256;
const SWEEP_SIZE = 1024;

/** @typedef {string} CallKind */
/** @typedef {Record<string, { max: number, windowMs: number }>} Limits */

/** Per user. @type {Limits} */
export const LIMITS = {
  test: { max: 20, windowMs: HOUR_MS },
  save: { max: 30, windowMs: HOUR_MS },
  tag: { max: 100, windowMs: 24 * HOUR_MS },
  suggest: { max: 30, windowMs: 24 * HOUR_MS },
};

/** All users together: bounds outbound calls and `/test` as a key-validity oracle (A4). */
/** @type {Limits} */
export const GLOBAL_LIMITS = {
  test: { max: 300, windowMs: HOUR_MS },
  save: { max: 600, windowMs: HOUR_MS },
  tag: { max: 2000, windowMs: 24 * HOUR_MS },
  suggest: { max: 600, windowMs: 24 * HOUR_MS },
};

/**
 * `ownerSub` (from config, never the request) skips the global ceilings and is not counted in them;
 * the per-user limits still apply to it. `limits` / `globalLimits` default to the AI ones (F-602 passes its own).
 * @param {{ now?: () => number, ownerSub?: string | null, limits?: Limits, globalLimits?: Limits }} [opts]
 */
export function createLimiter({
  now = () => Date.now(),
  ownerSub = null,
  limits = LIMITS,
  globalLimits = GLOBAL_LIMITS,
} = {}) {
  const KINDS = Object.keys(limits);
  const blank = () =>
    /** @type {Record<CallKind, number[]>} */ (Object.fromEntries(KINDS.map((k) => [k, []])));
  /** @type {Map<string, Record<CallKind, number[]>>} */
  const users = new Map();
  const global = blank();
  let checks = 0;

  /** @param {Record<CallKind, number[]>} calls @param {number} t */
  function prune(calls, t) {
    for (const k of KINDS) {
      const cut = t - limits[k].windowMs;
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
      const mine = users.get(userId) ?? blank();
      prune(mine, t);
      const gl = globalLimits[kind];
      global[kind] = global[kind].filter((c) => c > t - gl.windowMs);
      const owner = ownerSub !== null && userId === ownerSub;
      if (mine[kind].length >= limits[kind].max || (!owner && global[kind].length >= gl.max)) {
        if (prune(mine, t)) users.delete(userId);
        return false;
      }
      mine[kind].push(t);
      if (!owner) global[kind].push(t);
      users.set(userId, mine);
      return true;
    },
    /** Number of users with an entry (tests only). */
    size: () => users.size,
  };
}
