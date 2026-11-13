// @ts-check
// /api/ai-settings: GET (view), PUT (save provider, model, optional key), DELETE /key.
// The key and its ciphertext never leave this module: responses carry the masked hint only, and logs carry
// fixed fields only (never the body, the key, the hint or an error object).
import { dbLogFields, mapDbError } from "../errors.js";
import { readJson, sendError, sendJson } from "../http.js";
import { AI_MODELS } from "./catalog.js";
import { sealKey } from "./crypto.js";
import { keyHintOf, maskHint } from "./mask.js";
import {
  isAllowedModel,
  isAllowedProvider,
  MAX_BODY_BYTES,
  parseSettingsBody,
  validateApiKeyFormat,
} from "./validate.js";

/** @typedef {import("./store.js").AiStore} AiStore */
/** @typedef {{ kek: import("./crypto.js").AiKek, store: AiStore | null, limiter: { check(kind: "save" | "test"): boolean } }} AiContext */

/** @param {import("./store.js").AiSettingsRow} row @returns {import("./catalog.js").AiSettingsView} */
function toView(row) {
  const provider = /** @type {import("./catalog.js").AiProvider} */ (row.provider);
  return {
    provider,
    model: row.model,
    keyHint: maskHint(row.keyHint),
    hasKey: row.hasKey,
    modelSupported: AI_MODELS[provider]?.some((m) => m.id === row.model) ?? false,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   route: string, ai: AiContext | null, id: string,
 *   log: (entry: Record<string, unknown>) => void,
 * }} ctx
 */
export async function handleAiSettings(req, res, { route, ai, id, log }) {
  if (!ai) return sendError(res, 503, "server_misconfigured");
  const method = req.method ?? "";
  const action = method === "PUT" ? "save" : method === "DELETE" ? "deleteKey" : "get";
  /** @param {number} status @param {string} code */
  const fail = (status, code) => {
    log({ event: "ai_settings", id, action, code });
    return sendError(res, status, code);
  };

  /** @type {{ provider: string, model: string, sealed: { ciphertext: string, hint: string } | null } | null} */
  let input = null;
  if (method === "PUT") {
    if (!ai.limiter.check("save")) return fail(429, "rate_limited");
    const body = await readJson(req, { limit: MAX_BODY_BYTES });
    if (!body.ok) {
      /** @type {Record<string, string>} */
      const headers = body.status === 413 ? { Connection: "close" } : {};
      if (body.status === 413) res.once("finish", () => req.socket.destroy());
      log({ event: "ai_settings", id, action, code: body.code });
      return sendError(res, body.status, body.code, {}, headers);
    }
    const parsed = parseSettingsBody(body.value);
    if (!parsed.ok) return fail(400, parsed.code);
    const { provider, model, apiKey } = parsed.value;
    if (!isAllowedProvider(provider)) return fail(400, "invalid_provider");
    if (!isAllowedModel(provider, model)) return fail(400, "invalid_model");
    let key = null;
    if (apiKey !== undefined) {
      const k = validateApiKeyFormat(apiKey);
      if (!k.ok) return fail(400, "invalid_key_format");
      key = k.key;
    }
    input = { provider, model, sealed: null };
    if (key !== null && ai.store) {
      input.sealed = { ciphertext: await sealKey(ai.kek, provider, key), hint: keyHintOf(key) };
    }
  }
  if (!ai.store) return fail(503, "db_unavailable");

  try {
    if (input) {
      const r = await ai.store.save(input);
      if (!r.ok) return fail(400, r.code);
      return sendJson(res, 200, { settings: toView(r.row) });
    }
    const row = method === "DELETE" ? await ai.store.clearKey() : await ai.store.get();
    return sendJson(res, 200, { settings: row ? toView(row) : null });
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, route, ...dbLogFields(err) });
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    return sendError(res, mapped.status, mapped.code, extra);
  }
}
