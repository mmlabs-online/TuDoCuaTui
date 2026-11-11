// @ts-check
// Maps database/driver errors to a safe HTTP status and code. Never reads message text (except one exact match).

const BAD_INPUT = new Set(["22P02", "22001", "22003", "22021", "22007", "22008", "23502", "23514"]);
const CONFLICT = new Set(["23505", "40001", "40P01"]);
const UNAVAILABLE = new Set([
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "57014",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
// pg-pool 3.x rejects with this code-less error when no connection is available in time.
const POOL_TIMEOUT = "timeout exceeded when trying to connect";

/** @param {unknown} err @returns {{ status: number, code: string }} */
export function mapDbError(err) {
  const e = /** @type {{ code?: unknown, message?: unknown } | null} */ (err);
  const code = typeof e?.code === "string" ? e.code : "";
  if (BAD_INPUT.has(code)) return { status: 400, code: "invalid_input" };
  if (code === "23503") return { status: 404, code: "not_found" };
  if (CONFLICT.has(code)) return { status: 409, code: "conflict" };
  if (code.startsWith("08") || UNAVAILABLE.has(code) || e?.message === POOL_TIMEOUT) {
    return { status: 503, code: "db_unavailable" };
  }
  return { status: 500, code: "internal" };
}

/** Log-safe fields only. @param {unknown} err */
export function dbLogFields(err) {
  const e = /** @type {Record<string, unknown> | null} */ (err);
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of ["code", "constraint", "routine"]) {
    const v = e?.[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
