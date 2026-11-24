// @ts-check
// Credit ledger (D53): reserve -> commit | refund, balance computed from grants and ops (R5). All SQL for the
// credit tables lives here. Every call is one short withUser transaction under a per-user advisory lock and does
// no I/O inside it. Business outcomes are returned as statuses, never thrown, so the pooled connection survives;
// programmer errors (bad user id, op key or kind) throw before the pool is touched. There is no owner path (D38).
import { withUser } from "../db.js";
import { toUserId } from "../user.js";
import {
  creditPrice,
  isLive,
  isValidOpKey,
  RESERVATION_TTL_MS,
  splitSpend,
  vnMonth,
} from "./creditMath.js";

export { CREDIT_PRICES, isValidOpKey } from "./creditMath.js";

/** @typedef {{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> }} Pool */
/** @typedef {{ opKey: string, kind: string, credits: number, monthlyPart: number, lastingPart: number, period: string, state: string, expiresAt: string, expired: boolean, requestHash: string | null, result: any, errorCode: string | null }} CreditOp */
/** @typedef {{ period: string, monthly: number, lasting: number, total: number, welcome: "approved" | "pending" }} CreditBalance */

/** @param {string} userId */
function needUser(userId) {
  if (typeof userId !== "string" || toUserId(userId) !== userId) throw new Error("userId required");
}

/** @param {string} opKey */
function needKey(opKey) {
  if (!isValidOpKey(opKey)) throw new Error("invalid opKey");
}

/** @param {Record<string, any>} r @param {number} nowMs @returns {CreditOp} */
function toOp(r, nowMs) {
  return {
    opKey: r.op_key,
    kind: r.kind,
    credits: r.credits,
    monthlyPart: r.monthly_part,
    lastingPart: r.lasting_part,
    period: r.period,
    requestHash: r.request_hash ?? null,
    result: r.result ?? null,
    errorCode: r.error_code ?? null,
    state: r.state,
    expiresAt: r.expires_at.toISOString(),
    expired:
      r.state === "reserved" &&
      !isLive({ state: r.state, expiresAt: r.expires_at.getTime() }, nowMs),
  };
}

/** Lazy grants (D50: no users table). Under the per-user lock; a new welcome row stays pending. */
async function ensureGrants(
  /** @type {any} */ c,
  /** @type {string} */ userId,
  /** @type {string} */ period,
  /** @type {string} */ nowIso,
) {
  // Monthly credits count at once (D53 gates only the welcome grant), so they are created approved.
  await c.query(
    `insert into credit_grants (user_id, bucket, period, amount, approved_at)
     select $1::uuid, 'monthly', $2::text, monthly_amount, $3::timestamptz from credit_settings
     on conflict (user_id, period) where bucket = 'monthly' do nothing`,
    [userId, period, nowIso],
  );
  await c.query(
    `insert into credit_grants (user_id, bucket, amount)
     select $1::uuid, 'welcome', welcome_amount from credit_settings
     on conflict (user_id) where bucket = 'welcome' do nothing`,
    [userId],
  );
}

const LIVE = "(state = 'committed' or (state = 'reserved' and expires_at > $3::timestamptz))";

/** @returns {Promise<CreditBalance & { welcomePending: boolean }>} */
async function computeBalance(
  /** @type {any} */ c,
  /** @type {string} */ userId,
  /** @type {string} */ period,
  /** @type {string} */ nowIso,
) {
  const r = (
    await c.query(
      `select
         greatest(
           coalesce((select sum(amount) from credit_grants
                      where user_id = $1 and bucket = 'monthly' and period = $2), 0)
           - coalesce((select sum(monthly_part) from credit_ops
                        where user_id = $1 and period = $2 and ${LIVE}), 0), 0)::int as monthly,
         greatest(
           coalesce((select sum(amount) from credit_grants
                      where user_id = $1 and (bucket = 'manual'
                            or (bucket = 'welcome' and approved_at is not null))), 0)
           - coalesce((select sum(lasting_part) from credit_ops
                        where user_id = $1 and ${LIVE}), 0), 0)::int as lasting,
         exists (select 1 from credit_grants
                  where user_id = $1 and bucket = 'welcome' and approved_at is null) as pending`,
      [userId, period, nowIso],
    )
  ).rows[0];
  return {
    period,
    monthly: r.monthly,
    lasting: r.lasting,
    total: r.monthly + r.lasting,
    welcome: r.pending ? "pending" : "approved",
    welcomePending: r.pending,
  };
}

/** @param {any} c @param {string} userId */
const lock = (c, userId) =>
  c.query("select pg_advisory_xact_lock(hashtextextended('credits:' || $1::text, 0))", [userId]);

const OP_COLUMNS =
  "op_key, kind, credits, monthly_part, lasting_part, period, state, expires_at, request_hash, result, error_code";

/** @param {any} c @param {string} userId @param {string} opKey */
const findOp = async (c, userId, opKey) =>
  (
    await c.query(`select ${OP_COLUMNS} from credit_ops where user_id = $1 and op_key = $2`, [
      userId,
      opKey,
    ])
  ).rows[0];

/** @param {Pool} pool @param {{ now?: () => number }} [opts] */
export function createCreditLedger(pool, { now = Date.now } = {}) {
  /**
   * Moves a reserved op to `state`; a no-op result when it is already settled.
   * `extra` stores the replay data in the same UPDATE: the request hash and result on a commit, the error code on
   * a refund.
   * @param {string} userId @param {string} opKey @param {"committed" | "refunded"} state
   * @param {{ requestHash?: string | null, result?: unknown, errorCode?: string | null }} [extra]
   */
  async function settle(userId, opKey, state, extra = {}) {
    needUser(userId);
    needKey(opKey);
    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    return withUser(pool, userId, async (c) => {
      await lock(c, userId);
      // A commit needs a live reservation; a refund works on any reserved op, expired or not.
      const done = await c.query(
        `update credit_ops set state = $3, settled_at = $4::timestamptz,
                request_hash = $5::text, result = $6::jsonb, error_code = $7::text
          where user_id = $1 and op_key = $2 and state = 'reserved'
            and ($3 = 'refunded' or expires_at > $4::timestamptz)
          returning ${OP_COLUMNS}`,
        [
          userId,
          opKey,
          state,
          nowIso,
          extra.requestHash ?? null,
          extra.result === undefined ? null : JSON.stringify(extra.result),
          extra.errorCode ?? null,
        ],
      );
      if (done.rows[0]) return { status: state, op: toOp(done.rows[0], nowMs) };
      const row = await findOp(c, userId, opKey);
      if (!row) return { status: /** @type {const} */ ("not_found") };
      const op = toOp(row, nowMs);
      return {
        status: op.expired ? /** @type {const} */ ("expired") : /** @type {const} */ ("noop"),
        op,
      };
    });
  }

  return {
    /**
     * Reserves the price of `kind` for `opKey`. The same key never reserves twice for a user (replay), and a
     * refunded or expired key stays terminal.
     * @param {string} userId @param {string} opKey @param {string} kind
     */
    async reserve(userId, opKey, kind) {
      needUser(userId);
      needKey(opKey);
      const price = creditPrice(kind);
      if (price === null) throw new Error("unknown kind");
      const nowMs = now();
      const nowIso = new Date(nowMs).toISOString();
      const period = vnMonth(nowMs);
      return withUser(pool, userId, async (c) => {
        await lock(c, userId);
        const existing = await findOp(c, userId, opKey);
        if (existing) {
          return existing.kind === kind
            ? { status: /** @type {const} */ ("replay"), op: toOp(existing, nowMs) }
            : { status: /** @type {const} */ ("op_key_mismatch") };
        }
        await ensureGrants(c, userId, period, nowIso);
        const { welcomePending, ...balance } = await computeBalance(c, userId, period, nowIso);
        const split = splitSpend(price, balance.monthly, balance.lasting);
        if (!split) {
          return {
            status: welcomePending
              ? /** @type {const} */ ("welcome_pending")
              : /** @type {const} */ ("insufficient"),
            balance,
          };
        }
        const ins = await c.query(
          `insert into credit_ops (user_id, op_key, kind, credits, monthly_part, lasting_part, period, state, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7, 'reserved', $8::timestamptz)
           on conflict (user_id, op_key) do nothing
           returning ${OP_COLUMNS}`,
          [
            userId,
            opKey,
            kind,
            price,
            split.monthlyPart,
            split.lastingPart,
            period,
            new Date(nowMs + RESERVATION_TTL_MS).toISOString(),
          ],
        );
        const row = ins.rows[0] ?? (await findOp(c, userId, opKey));
        return ins.rows[0]
          ? { status: /** @type {const} */ ("reserved"), op: toOp(row, nowMs) }
          : { status: /** @type {const} */ ("replay"), op: toOp(row, nowMs) };
      });
    },

    /**
     * @param {string} userId @param {string} opKey
     * @param {{ requestHash?: string, result?: unknown }} [data] stored for replay (F-706.4)
     */
    commit: (userId, opKey, data) => settle(userId, opKey, "committed", data),

    /**
     * @param {string} userId @param {string} opKey
     * @param {{ errorCode?: string }} [data] stored for replay (F-706.4)
     */
    refund: (userId, opKey, data) => settle(userId, opKey, "refunded", data),

    /**
     * Applies the lazy grants (a write transaction on purpose) and returns the balance.
     * @param {string} userId @returns {Promise<CreditBalance>}
     */
    async balance(userId) {
      needUser(userId);
      const nowMs = now();
      const nowIso = new Date(nowMs).toISOString();
      const period = vnMonth(nowMs);
      return withUser(pool, userId, async (c) => {
        await lock(c, userId);
        await ensureGrants(c, userId, period, nowIso);
        const { welcomePending: _pending, ...balance } = await computeBalance(
          c,
          userId,
          period,
          nowIso,
        );
        return balance;
      });
    },
  };
}
