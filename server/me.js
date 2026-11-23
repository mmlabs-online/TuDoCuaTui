// @ts-check
// GET /api/auth/me body (T-028.4): the verified token identity; no DB, nothing stored (D50).

/** @param {string | null | undefined} userId @param {string | null | undefined} ownerSub */
export function isOwner(userId, ownerSub) {
  return ownerSub !== null && ownerSub !== undefined && userId === ownerSub;
}

/**
 * @param {{ userId: import("./user.js").UserId, email: string | null, ownerSub: import("./user.js").UserId | string | null }} p
 * @returns {{ id: string, email: string | null, role: "owner" | "user" }}
 */
export function meBody({ userId, email, ownerSub }) {
  return { id: userId, email, role: isOwner(userId, ownerSub) ? "owner" : "user" };
}
