// @ts-check
// Pure body and param parsers for the credit admin routes (F-706.5). Strict: exact keys, integers only.
import { toUserId } from "../user.js";

const MAX_AMOUNT = 100000;
const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @typedef {{ ok: false, field: string, reason: string }} Bad */

/** @param {unknown} v @param {string[]} keys @returns {Record<string, unknown> | null} */
function exactObject(v, keys) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const own = Object.keys(v);
  if (own.length !== keys.length || !keys.every((k) => Object.hasOwn(v, k))) return null;
  return /** @type {Record<string, unknown>} */ (v);
}

/** @param {unknown} n @returns {n is number} */
const isAmount = (n) =>
  Number.isInteger(n) && /** @type {number} */ (n) >= 1 && /** @type {number} */ (n) <= MAX_AMOUNT;

/** @param {unknown} body @returns {{ ok: true, value: { welcomeAmount: number, monthlyAmount: number } } | Bad} */
export function parseSettingsBody(body) {
  const b = exactObject(body, ["welcomeAmount", "monthlyAmount"]);
  if (!b) return { ok: false, field: "body", reason: "shape" };
  const { welcomeAmount, monthlyAmount } = b;
  if (!isAmount(welcomeAmount))
    return { ok: false, field: "welcomeAmount", reason: "amountInvalid" };
  if (!isAmount(monthlyAmount))
    return { ok: false, field: "monthlyAmount", reason: "amountInvalid" };
  return { ok: true, value: { welcomeAmount, monthlyAmount } };
}

/** @param {unknown} body @returns {{ ok: true, value: { amount: number, requestKey: string } } | Bad} */
export function parseManualGrantBody(body) {
  const b = exactObject(body, ["amount", "requestKey"]);
  if (!b) return { ok: false, field: "body", reason: "shape" };
  const { amount, requestKey } = b;
  if (!isAmount(amount)) return { ok: false, field: "amount", reason: "amountInvalid" };
  if (typeof requestKey !== "string" || !KEY_RE.test(requestKey)) {
    return { ok: false, field: "requestKey", reason: "keyInvalid" };
  }
  return { ok: true, value: { amount, requestKey } };
}

/** Canonical lowercase non-nil UUID only (the path is never decoded). @param {string | undefined} raw */
export function parseUserIdParam(raw) {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) return null;
  return toUserId(raw) === raw ? raw : null;
}
