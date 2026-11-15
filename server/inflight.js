// @ts-check
// In-flight counter with a per-user and a total cap (photo uploads, T-019.2).

/**
 * `exempt` (a user id) ignores the total cap and is not counted in it; `perUser` still applies.
 * @param {{ perUser: number, total: number, exempt?: string | null }} caps
 */
export function createInFlight({ perUser, total, exempt = null }) {
  /** @type {Map<string, number>} */
  const byUser = new Map();
  let all = 0;
  return {
    /** @param {string} userId @returns {(() => void) | null} */
    tryAcquire(userId) {
      const n = byUser.get(userId) ?? 0;
      const free = exempt !== null && userId === exempt;
      if (n >= perUser || (!free && all >= total)) return null;
      byUser.set(userId, n + 1);
      if (!free) all++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (!free) all--;
        const left = (byUser.get(userId) ?? 1) - 1;
        if (left <= 0) byUser.delete(userId);
        else byUser.set(userId, left);
      };
    },
    /** @param {string} userId */
    count: (userId) => byUser.get(userId) ?? 0,
    total: () => all,
  };
}
