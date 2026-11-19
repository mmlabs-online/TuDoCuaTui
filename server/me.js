// @ts-check
// GET /api/auth/me body (T-028.4): the verified token identity; no DB, nothing stored (D50).

/**
 * @param {{ userId: import("./user.js").UserId, email: string | null, ownerSub: import("./user.js").UserId | string | null }} p
 * @returns {{ id: string, email: string | null, role: "owner" | "user" }}
 */
export function meBody({ userId, email, ownerSub }) {
  return { id: userId, email, role: ownerSub !== null && userId === ownerSub ? "owner" : "user" };
}
