// @ts-check
// The per-user credit advisory lock (D53), shared by credits.js and creditAdmin.js (F-706.5).

/** @param {any} c @param {string} userId */
export const lockCreditUser = (c, userId) =>
  c.query("select pg_advisory_xact_lock(hashtextextended('credits:' || $1::text, 0))", [userId]);
