// @ts-check
// The caller's identity (mmlabs `sub`). `toUserId` is the only producer of a UserId in production code.

/** @typedef {string & { readonly __brand: "UserId" }} UserId */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Trims, lowercases and validates a canonical non-nil UUID.
 * @param {string | undefined} raw
 * @returns {UserId | null}
 */
export function toUserId(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  if (!UUID_RE.test(v) || v === NIL) return null;
  return /** @type {UserId} */ (v);
}
