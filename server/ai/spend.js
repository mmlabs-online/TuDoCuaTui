// @ts-check
// App-wide monthly spend meter (F-706.2, D53).
// Manages reservations, settlement and monthly budget against MONTHLY_CAP_MICRO_USD.
// Every operation runs in a short withSpendMeter transaction; no I/O inside.
// Business outcomes are returned as status values, never thrown.
import { withSpendMeter } from "../db.js";
import { toUserId } from "../user.js";
import {
  estimateMicroUsd,
  isConfirmedNoCharge,
  KIND_CEILINGS,
  MONTHLY_CAP_MICRO_USD,
  PRICE_VERSION,
  spendPeriod,
} from "./spendPrices.js";

/**
 * @typedef {{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> }} Pool
 * @typedef {"reserved" | "charged" | "released"} SpendState
 * @typedef {{
 *   reserve(opts: { provider: string, model: string, kind: string }): Promise<
 *     | { status: "reserved", spendId: string, estimateMicroUsd: number, period: string }
 *     | { status: "cap_reached", spentMicroUsd: number, capMicroUsd: number, period: string }
 *     | { status: "unpriced" }
 *   >,
 *   settle(spendId: string, outcome: string): Promise<
 *     | { status: "charged" }
 *     | { status: "released" }
 *     | { status: "noop", state: SpendState }
 *     | { status: "not_found" }
 *   >,
 *   status(): Promise<{
 *     period: string,
 *     capMicroUsd: number,
 *     spentMicroUsd: number,
 *     remainingMicroUsd: number,
 *     priceVersion: string,
 *   }>
 * }} SpendMeter
 */

const ALLOWED_RESERVE_KEYS = new Set(["provider", "model", "kind"]);

/**
 * @param {Pool} pool
 * @param {{ now?: () => number }} [opts]
 * @returns {SpendMeter}
 */
export function createSpendMeter(pool, { now = Date.now } = {}) {
  return {
    async reserve(opts) {
      if (!opts || typeof opts !== "object" || Array.isArray(opts)) {
        throw new Error("reserve requires options object");
      }
      for (const k of Object.keys(opts)) {
        if (!ALLOWED_RESERVE_KEYS.has(k)) {
          throw new Error(`unexpected key in reserve options: ${k}`);
        }
      }
      const { provider, model, kind } = opts;
      if (typeof provider !== "string" || typeof model !== "string") {
        throw new Error("provider and model must be strings");
      }
      if (typeof kind !== "string" || !Object.hasOwn(KIND_CEILINGS, kind)) {
        throw new Error("unknown kind");
      }

      const est = estimateMicroUsd(provider, model, kind);
      if (est === null) {
        return { status: "unpriced" };
      }

      return await withSpendMeter(pool, async (/** @type {any} */ client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended('ai-spend', 0))");
        const period = spendPeriod(now());
        const res = await client.query(
          "select coalesce(sum(estimate_micro_usd), 0)::bigint::text as spent from ai_spend_ops where period = $1 and state <> 'released'",
          [period],
        );
        const spent = Number(res.rows[0].spent);
        if (spent + est > MONTHLY_CAP_MICRO_USD) {
          return {
            status: "cap_reached",
            spentMicroUsd: spent,
            capMicroUsd: MONTHLY_CAP_MICRO_USD,
            period,
          };
        }

        const ins = await client.query(
          `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state)
           values ($1, $2, $3, $4, $5, $6, 'reserved')
           returning id`,
          [period, provider, model, kind, PRICE_VERSION, est],
        );

        return {
          status: "reserved",
          spendId: ins.rows[0].id,
          estimateMicroUsd: est,
          period,
        };
      });
    },

    async settle(spendId, outcome) {
      const sid = toUserId(spendId);
      if (!sid || sid !== spendId) {
        throw new Error("spendId must be a canonical UUID");
      }
      if (typeof outcome !== "string") {
        throw new Error("outcome must be a string");
      }

      /** @type {SpendState} */
      const nextState = isConfirmedNoCharge(outcome) ? "released" : "charged";

      return await withSpendMeter(pool, async (/** @type {any} */ client) => {
        const upd = await client.query(
          "update ai_spend_ops set state = $2, settled_at = now() where id = $1 and state = 'reserved' returning state",
          [sid, nextState],
        );
        if (upd.rowCount > 0) {
          return { status: nextState };
        }

        const check = await client.query("select state from ai_spend_ops where id = $1", [sid]);
        if (check.rowCount === 0) {
          return { status: "not_found" };
        }
        return { status: "noop", state: check.rows[0].state };
      });
    },

    async status() {
      return await withSpendMeter(
        pool,
        async (/** @type {any} */ client) => {
          const period = spendPeriod(now());
          const res = await client.query(
            "select coalesce(sum(estimate_micro_usd), 0)::bigint::text as spent from ai_spend_ops where period = $1 and state <> 'released'",
            [period],
          );
          const spent = Number(res.rows[0].spent);
          return {
            period,
            capMicroUsd: MONTHLY_CAP_MICRO_USD,
            spentMicroUsd: spent,
            remainingMicroUsd: Math.max(MONTHLY_CAP_MICRO_USD - spent, 0),
            priceVersion: PRICE_VERSION,
          };
        },
        { readOnly: true },
      );
    },
  };
}
