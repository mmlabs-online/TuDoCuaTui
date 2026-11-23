// @ts-check
// Owner-only admin API routes for shared AI keys (F-706.3, D52).
// Endpoints:
//   GET    /api/admin/ai-keys               - list configured shared keys (masked hints only)
//   PUT    /api/admin/ai-keys/:provider     - store or replace key
//   DELETE /api/admin/ai-keys/:provider     - delete key
//   POST   /api/admin/ai-keys/:provider/test- test key with provider
//
// Every route enforces that the caller is the owner (userId === ownerSub). Non-owners receive 403 immediately.
// Plaintext keys are never echoed or returned. Logs carry fixed events only.
import { readJson, sendError, sendJson } from "../http.js";
import { isOwner } from "../me.js";
import { parseTestBody } from "./validate.js";

const MAX_BODY_BYTES = 4096;

/**
 * Parses the body for PUT /api/admin/ai-keys/:provider. Requires exactly { apiKey: string }.
 * @param {unknown} body
 * @returns {{ ok: true, apiKey: string } | { ok: false, code: "bad_request" }}
 */
function parsePutKeyBody(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, code: "bad_request" };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  if (!Object.keys(b).every((k) => k === "apiKey")) return { ok: false, code: "bad_request" };
  if (typeof b.apiKey !== "string") return { ok: false, code: "bad_request" };
  return { ok: true, apiKey: b.apiKey };
}

/**
 * Handles /api/admin/ai-keys routes.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   parts: string[],
 *   userId: string,
 *   ownerSub: string | null,
 *   appKeys: ReturnType<typeof import("./appKeys.js").createAppKeyStore> | null,
 *   id: string,
 *   log: (entry: Record<string, unknown>) => void,
 * }} ctx
 */
export async function handleAdminAiKeys(req, res, { parts, userId, ownerSub, appKeys, id, log }) {
  if (!isOwner(userId, ownerSub)) {
    log({ event: "admin_ai_keys", id, action: "auth", code: "forbidden" });
    return sendError(res, 403, "forbidden");
  }

  if (!appKeys) {
    log({ event: "admin_ai_keys", id, action: "init", code: "db_unavailable" });
    return sendError(res, 503, "db_unavailable");
  }

  const method = req.method ?? "";

  // GET /api/admin/ai-keys
  if (parts.length === 4 && method === "GET") {
    try {
      const keys = await appKeys.list();
      log({ event: "admin_ai_keys", id, action: "list", code: "ok" });
      return sendJson(res, 200, { keys });
    } catch {
      log({ event: "admin_ai_keys", id, action: "list", code: "db_unavailable" });
      return sendError(res, 503, "db_unavailable");
    }
  }

  const provider = parts[4];

  // PUT /api/admin/ai-keys/:provider
  if (parts.length === 5 && method === "PUT") {
    const body = await readJson(req, { limit: MAX_BODY_BYTES });
    if (!body.ok) {
      log({ event: "admin_ai_keys", id, action: "put", provider, code: body.code });
      return sendError(res, body.status, body.code);
    }
    const parsed = parsePutKeyBody(body.value);
    if (!parsed.ok) {
      log({ event: "admin_ai_keys", id, action: "put", provider, code: parsed.code });
      return sendError(res, 400, parsed.code);
    }
    const result = await appKeys.put(provider, parsed.apiKey);
    if (!result.ok) {
      log({ event: "admin_ai_keys", id, action: "put", provider, code: result.code });
      return sendError(res, result.status, result.code);
    }
    log({ event: "admin_ai_keys", id, action: "put", provider, code: "ok" });
    return sendJson(res, 200, { ok: true, keyHint: result.keyHint });
  }

  // DELETE /api/admin/ai-keys/:provider
  if (parts.length === 5 && method === "DELETE") {
    const result = await appKeys.delete(provider);
    if (!result.ok) {
      log({ event: "admin_ai_keys", id, action: "delete", provider, code: result.code });
      return sendError(res, result.status, result.code);
    }
    log({ event: "admin_ai_keys", id, action: "delete", provider, code: "ok" });
    return sendJson(res, 200, { ok: true });
  }

  // POST /api/admin/ai-keys/:provider/test
  if (parts.length === 6 && parts[5] === "test" && method === "POST") {
    const body = await readJson(req, { limit: MAX_BODY_BYTES });
    if (!body.ok) {
      log({ event: "admin_ai_keys", id, action: "test", provider, code: body.code });
      return sendError(res, body.status, body.code);
    }
    const parsed = parseTestBody(body.value);
    if (!parsed.ok) {
      log({ event: "admin_ai_keys", id, action: "test", provider, code: parsed.code });
      return sendError(res, 400, parsed.code);
    }
    const result = await appKeys.test(provider);
    if (!result.ok) {
      log({ event: "admin_ai_keys", id, action: "test", provider, code: result.code });
      return sendError(res, result.status, result.code);
    }
    log({ event: "admin_ai_keys", id, action: "test", provider, code: "ok" });
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, "not_found");
}
