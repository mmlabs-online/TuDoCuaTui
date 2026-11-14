// @ts-check
// In-flight counter with a per-user and a total cap (photo uploads, T-019.2).

/**
 * @param {{ perUser: number, total: number }} caps
 */
export function createInFlight({ perUser, total }) {
  /** @type {Map<string, number>} */
  const byUser = new Map();
  let all = 0;
  return {
    /** @param {string} userId @returns {(() => void) | null} */
    tryAcquire(userId) {
      const n = byUser.get(userId) ?? 0;
      if (n >= perUser || all >= total) return null;
      byUser.set(userId, n + 1);
      all++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        all--;
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
