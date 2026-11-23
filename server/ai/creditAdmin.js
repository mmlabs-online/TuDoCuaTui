// @ts-check
// Owner-only credit admin (F-706.5, D53): grant settings, pending welcome approvals, manual credits. The credit-table
// SQL for the admin path lives here (user-side SQL is in credits.js). The only caller of withCreditAdmin.
// Business outcomes are returned as statuses; programmer errors (bad user id) throw before the pool is touched.
// Approve and manual add take the same per-user advisory lock as credits.js, so they serialise with a reserve.
import { withCreditAdmin } from "../db.js";
import { toUserId } from "../user.js";
import { lockCreditUser } from "./creditLock.js";

/** @typedef {{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> }} Pool */

/** @param {string} userId */
function needUser(userId) {
  if (typeof userId !== "string" || toUserId(userId) !== userId) throw new Error("userId required");
}

/** @param {Date} d */
const iso = (d) => d.toISOString();

/**
 * @param {Pool} pool
 * @param {{ now?: () => number }} [opts]
 */
export function createCreditAdmin(pool, { now = Date.now } = {}) {
  const nowIso = () => new Date(now()).toISOString();
  return {
    /** @returns {Promise<{ welcomeAmount: number, monthlyAmount: number, updatedAt: string }>} */
    getSettings: () =>
      withCreditAdmin(
        pool,
        async (c) => {
          const r = (
            await c.query("select welcome_amount, monthly_amount, updated_at from credit_settings")
          ).rows[0];
          return {
            welcomeAmount: r.welcome_amount,
            monthlyAmount: r.monthly_amount,
            updatedAt: iso(r.updated_at),
          };
        },
        { readOnly: true },
      ),

    /**
     * Applies to grants created afterwards; existing grant rows keep their amount.
     * @param {{ welcomeAmount: number, monthlyAmount: number }} s
     * @returns {Promise<{ welcomeAmount: number, monthlyAmount: number, updatedAt: string }>}
     */
    updateSettings: ({ welcomeAmount, monthlyAmount }) =>
      withCreditAdmin(pool, async (c) => {
        const r = await c.query(
          `update credit_settings set welcome_amount = $1, monthly_amount = $2, updated_at = $3::timestamptz
           returning welcome_amount, monthly_amount, updated_at`,
          [welcomeAmount, monthlyAmount, nowIso()],
        );
        if (r.rowCount !== 1) throw new Error("credit settings not updated");
        const row = r.rows[0];
        return {
          welcomeAmount: row.welcome_amount,
          monthlyAmount: row.monthly_amount,
          updatedAt: iso(row.updated_at),
        };
      }),

    /** @param {{ limit?: number }} [opts] @returns {Promise<{ userId: string, amount: number, createdAt: string }[]>} */
    listPending: ({ limit = 200 } = {}) =>
      withCreditAdmin(
        pool,
        async (c) =>
          (
            await c.query(
              `select user_id, amount, created_at from credit_grants
                where bucket = 'welcome' and approved_at is null
                order by created_at, user_id limit $1`,
              [limit],
            )
          ).rows.map((/** @type {Record<string, any>} */ r) => ({
            userId: r.user_id,
            amount: r.amount,
            createdAt: iso(r.created_at),
          })),
        { readOnly: true },
      ),

    /**
     * Sets approved_at on the user's pending welcome row; the stored amount is kept.
     * @param {string} userId
     */
    async approveWelcome(userId) {
      needUser(userId);
      const at = nowIso();
      return withCreditAdmin(pool, async (c) => {
        await lockCreditUser(c, userId);
        const done = await c.query(
          `update credit_grants set approved_at = $2::timestamptz
            where user_id = $1 and bucket = 'welcome' and approved_at is null
            returning amount, approved_at`,
          [userId, at],
        );
        if (done.rows[0]) {
          return {
            status: /** @type {const} */ ("approved"),
            amount: /** @type {number} */ (done.rows[0].amount),
            approvedAt: iso(done.rows[0].approved_at),
          };
        }
        const row = (
          await c.query(
            "select amount, approved_at from credit_grants where user_id = $1 and bucket = 'welcome'",
            [userId],
          )
        ).rows[0];
        return row
          ? {
              status: /** @type {const} */ ("already_approved"),
              amount: /** @type {number} */ (row.amount),
              approvedAt: iso(row.approved_at),
            }
          : { status: /** @type {const} */ ("not_found") };
      });
    },

    /**
     * Adds a manual (never expiring) grant for a user the ledger already knows. The same key and amount replay.
     * @param {string} userId @param {number} amount @param {string} grantKey
     */
    async addManual(userId, amount, grantKey) {
      needUser(userId);
      const at = nowIso();
      return withCreditAdmin(pool, async (c) => {
        await lockCreditUser(c, userId);
        const known = (
          await c.query("select exists (select 1 from credit_grants where user_id = $1) as known", [
            userId,
          ])
        ).rows[0].known;
        if (!known) return { status: /** @type {const} */ ("unknown_user") };
        const ins = await c.query(
          `insert into credit_grants (user_id, bucket, amount, approved_at, grant_key)
           values ($1, 'manual', $2, $3::timestamptz, $4)
           on conflict (user_id, grant_key) where grant_key is not null do nothing
           returning id, amount, created_at`,
          [userId, amount, at, grantKey],
        );
        const created = ins.rows[0];
        const row =
          created ??
          (
            await c.query(
              "select id, amount, created_at from credit_grants where user_id = $1 and grant_key = $2",
              [userId, grantKey],
            )
          ).rows[0];
        if (!created && row.amount !== amount) {
          return { status: /** @type {const} */ ("grant_key_mismatch") };
        }
        return {
          status: created ? /** @type {const} */ ("created") : /** @type {const} */ ("replay"),
          grant: {
            id: /** @type {string} */ (row.id),
            userId,
            amount: /** @type {number} */ (row.amount),
            createdAt: iso(row.created_at),
          },
        };
      });
    },
  };
}
