// @ts-check
// Pure helpers for the credit ledger (D53). No I/O.
import { vnToday } from "../validate.js";

/** D53 prices. Price-0 actions (cached result, existing chibi) never reserve. */
export const CREDIT_PRICES = Object.freeze({ photo_fill: 1, suggest: 1, sticker: 10 });

/** How long a reserved op counts before it is treated as abandoned. */
export const RESERVATION_TTL_MS = 10 * 60_000;

/** @param {unknown} kind @returns {number | null} */
export function creditPrice(kind) {
  return typeof kind === "string" && Object.hasOwn(CREDIT_PRICES, kind)
    ? /** @type {Record<string, number>} */ (CREDIT_PRICES)[kind]
    : null;
}

/** Credit month 'YYYY-MM' in Asia/Ho_Chi_Minh (UTC+7, no DST). @param {number} nowMs */
export const vnMonth = (nowMs) => vnToday(nowMs).slice(0, 7);

/**
 * Monthly credits are spent first, the rest comes from the lasting pool (welcome + manual).
 * @param {number} price @param {number} monthlyAvail @param {number} lastingAvail
 * @returns {{ monthlyPart: number, lastingPart: number } | null} null when the balance is too small
 */
export function splitSpend(price, monthlyAvail, lastingAvail) {
  const monthly = Number.isFinite(monthlyAvail) ? Math.max(monthlyAvail, 0) : 0;
  const lasting = Number.isFinite(lastingAvail) ? Math.max(lastingAvail, 0) : 0;
  const monthlyPart = Math.min(price, monthly);
  const lastingPart = price - monthlyPart;
  return lastingPart > lasting ? null : { monthlyPart, lastingPart };
}

/**
 * Mirrors the SQL rule: committed, or reserved and not yet expired.
 * @param {{ state: string, expiresAt: number }} op @param {number} nowMs
 */
export const isLive = (op, nowMs) =>
  op.state === "committed" || (op.state === "reserved" && op.expiresAt > nowMs);

/** @param {unknown} s */
export const isValidOpKey = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s);
