// @ts-check
// Owner-only admin API for credits and spend (F-706.5, D53).
//   GET  /api/admin/credits/settings                   - current welcome and monthly grant amounts
//   PUT  /api/admin/credits/settings                   - change them (applies to grants created afterwards)
//   GET  /api/admin/credits/pending                    - accounts waiting for welcome-credit approval
//   POST /api/admin/credits/pending/:userId/approve    - approve one (the stored welcome amount starts to count)
//   POST /api/admin/credits/users/:userId/grants       - add manual credits (never expire; requestKey = idempotency)
//   GET  /api/admin/spend                              - this month's spend against the app-wide cap
// The caller must be the owner: api.js checks the whole /api/admin prefix, and this is the second layer.
// Spend counts reserved plus charged estimates, the same figure the cap uses; the owner is not exempt from it (D53).
// Logs carry fixed fields only (no user ids, amounts or request keys).
import { readJson, sendError, sendJson } from "../http.js";
import { isOwner } from "../me.js";
import { parseManualGrantBody, parseSettingsBody, parseUserIdParam } from "./adminValidate.js";

const MAX_BODY_BYTES = 4096;

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   route: string,
 *   parts: string[],
 *   userId: string,
 *   ownerSub: string | null,
 *   creditAdmin: ReturnType<typeof import("./creditAdmin.js").createCreditAdmin> | null,
 *   spendMeter: import("./spend.js").SpendMeter | null,
 *   id: string,
 *   log: (entry: Record<string, unknown>) => void,
 * }} ctx
 */
export async function handleAdminCredits(
  req,
  res,
  { route, parts, userId, ownerSub, creditAdmin, spendMeter, id, log },
) {
  /** @param {string} action @param {string} code */
  const note = (action, code) => log({ event: "admin_credits", id, action, code });
  if (!isOwner(userId, ownerSub)) {
    note("auth", "forbidden");
    return sendError(res, 403, "forbidden");
  }
  if (!creditAdmin || !spendMeter) {
    note("init", "db_unavailable");
    return sendError(res, 503, "db_unavailable");
  }
  const method = req.method ?? "";
  /** @type {string} */
  let action = "unknown";
  try {
    if (route === "/api/admin/spend") {
      action = "spend";
      const status = await spendMeter.status();
      note(action, "ok");
      return sendJson(res, 200, status);
    }
    if (route === "/api/admin/credits/settings") {
      action = method === "GET" ? "settings_get" : "settings_put";
      if (method === "GET") {
        const settings = await creditAdmin.getSettings();
        note(action, "ok");
        return sendJson(res, 200, settings);
      }
      const body = await readJson(req, { limit: MAX_BODY_BYTES });
      if (!body.ok) {
        note(action, body.code);
        return sendError(res, body.status, body.code);
      }
      const parsed = parseSettingsBody(body.value);
      if (!parsed.ok) {
        note(action, "invalid_input");
        return sendError(res, 400, "invalid_input", { field: parsed.field, reason: parsed.reason });
      }
      const settings = await creditAdmin.updateSettings(parsed.value);
      note(action, "ok");
      return sendJson(res, 200, settings);
    }
    if (route === "/api/admin/credits/pending") {
      action = "pending";
      const accounts = await creditAdmin.listPending();
      note(action, "ok");
      return sendJson(res, 200, { accounts });
    }

    // Both remaining routes carry a user id in parts[5].
    const target = parseUserIdParam(parts[5]);
    if (route === "/api/admin/credits/pending/:userId/approve") {
      action = "approve";
      if (!target) {
        note(action, "invalid_input");
        return sendError(res, 400, "invalid_input", { field: "userId", reason: "idInvalid" });
      }
      const result = await creditAdmin.approveWelcome(target);
      if (result.status === "not_found") {
        note(action, "not_found");
        return sendError(res, 404, "not_found");
      }
      note(action, result.status);
      return sendJson(res, 200, {
        status: result.status,
        userId: target,
        amount: result.amount,
        approvedAt: result.approvedAt,
      });
    }
    // POST /api/admin/credits/users/:userId/grants
    action = "grant";
    if (!target) {
      note(action, "invalid_input");
      return sendError(res, 400, "invalid_input", { field: "userId", reason: "idInvalid" });
    }
    const body = await readJson(req, { limit: MAX_BODY_BYTES });
    if (!body.ok) {
      note(action, body.code);
      return sendError(res, body.status, body.code);
    }
    const parsed = parseManualGrantBody(body.value);
    if (!parsed.ok) {
      note(action, "invalid_input");
      return sendError(res, 400, "invalid_input", { field: parsed.field, reason: parsed.reason });
    }
    const result = await creditAdmin.addManual(
      target,
      parsed.value.amount,
      parsed.value.requestKey,
    );
    if (result.status === "unknown_user") {
      note(action, "unknown_user");
      return sendError(res, 404, "unknown_user");
    }
    if (result.status === "grant_key_mismatch") {
      note(action, "grant_key_mismatch");
      return sendError(res, 409, "grant_key_mismatch");
    }
    note(action, result.status);
    return result.status === "created"
      ? sendJson(res, 201, { grant: result.grant })
      : sendJson(res, 200, { grant: result.grant, replay: true });
  } catch {
    note(action, "db_unavailable");
    return sendError(res, 503, "db_unavailable");
  }
}
