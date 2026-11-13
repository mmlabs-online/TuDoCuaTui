// @ts-check
// In-memory rolling window (single process, single user behind Access). A restart resets it.

const HOUR_MS = 60 * 60 * 1000;

/** @typedef {"save" | "test"} CallKind */

/** @type {Record<CallKind, { max: number, windowMs: number }>} */
export const LIMITS = {
  test: { max: 20, windowMs: HOUR_MS },
  save: { max: 30, windowMs: HOUR_MS },
};

/** @param {{ now?: () => number }} [opts] */
export function createLimiter({ now = () => Date.now() } = {}) {
  /** @type {Record<CallKind, number[]>} */
  const calls = { save: [], test: [] };
  return {
    /**
     * Counts an attempt. Returns false (and records nothing) at the limit.
     * @param {CallKind} kind
     */
    check(kind) {
      const { max, windowMs } = LIMITS[kind];
      const t = now();
      calls[kind] = calls[kind].filter((c) => c > t - windowMs);
      if (calls[kind].length >= max) return false;
      calls[kind].push(t);
      return true;
    },
  };
}
