// @ts-check
// Per-user photo quotas (T-019.14): a stored-photo cap (checked in photos.js against item_photos) and an in-memory
// rolling daily upload count (one process; a restart resets it). A rejected reserve records nothing.

/** Per user. The stored cap also bounds bytes: cap x 2 MiB. */
export const PHOTO_LIMITS = { storedMax: 500, dailyMax: 50, windowMs: 24 * 60 * 60 * 1000 };

const SWEEP_EVERY = 256;
const SWEEP_SIZE = 1024;

/**
 * The photos already on the target item are replaced, so a replace is net zero.
 * @param {{ total: number, onItem: number, cap: number | null }} p
 */
export function storedAllows({ total, onItem, cap }) {
  return cap === null || total - onItem < cap;
}

/**
 * `exempt` (the owner sub, from config, never the request) is limited by neither count.
 * @param {{ storedMax: number, dailyMax: number, windowMs: number, now?: () => number, exempt?: string | null }} opts
 */
export function createPhotoQuota({
  storedMax,
  dailyMax,
  windowMs,
  now = () => Date.now(),
  exempt = null,
}) {
  /** @type {Map<string, number[]>} */
  const users = new Map();
  let calls = 0;
  /** @param {string} userId */
  const isExempt = (userId) => exempt !== null && userId === exempt;

  /** @param {number} t */
  function sweep(t) {
    for (const [id, stamps] of users) {
      const live = stamps.filter((s) => s > t - windowMs);
      if (live.length === 0) users.delete(id);
      else users.set(id, live);
    }
  }

  return {
    /** @param {string} userId @returns {number | null} null = no cap */
    storedCap: (userId) => (isExempt(userId) ? null : storedMax),
    /**
     * Counts an upload. No `await`: check and record are one step.
     * @param {string} userId
     * @returns {{ ok: true, refund: () => void } | { ok: false, retryAfterSec: number }}
     */
    reserve(userId) {
      if (isExempt(userId)) return { ok: true, refund: () => {} };
      const t = now();
      if (++calls % SWEEP_EVERY === 0 || users.size > SWEEP_SIZE) sweep(t);
      const mine = (users.get(userId) ?? []).filter((s) => s > t - windowMs);
      if (mine.length >= dailyMax) {
        if (mine.length === 0) users.delete(userId);
        else users.set(userId, mine);
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((mine[0] + windowMs - t) / 1000)),
        };
      }
      mine.push(t);
      users.set(userId, mine);
      let done = false;
      return {
        ok: true,
        refund() {
          if (done) return;
          done = true;
          const list = users.get(userId);
          const i = list ? list.indexOf(t) : -1;
          if (!list || i < 0) return;
          list.splice(i, 1);
          if (list.length === 0) users.delete(userId);
        },
      };
    },
    /** Number of users with an entry (tests only). */
    size: () => users.size,
    /** Run the idle sweep now (tests only). */
    sweepNow: () => sweep(now()),
  };
}
