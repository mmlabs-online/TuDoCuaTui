// @ts-check
// POST /api/ai/tag-photo: raw JPEG body -> suggested item fields (DB ids only), using the user's own saved key.
// Logs carry fixed fields only: never the image, the key, the suggestion or an error object.
import { dbLogFields, mapDbError } from "../errors.js";
import { sendError, sendJson } from "../http.js";
import { MAX_BYTES, readBody, rejectUnread } from "../photos.js";
import { AI_ERROR_STATUS } from "./catalog.js";
import { tagPhotoWithClaude } from "./claude.js";
import { tagPhotoWithGemini } from "./gemini.js";
import { loadSettingsKey } from "./routes.js";
import { parseTagSuggestion } from "./tagging.js";

/** @type {Record<import("./catalog.js").AiProvider, typeof tagPhotoWithClaude | typeof tagPhotoWithGemini>} */
const TAGGERS = { claude: tagPhotoWithClaude, gemini: tagPhotoWithGemini };

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ ai: import("./routes.js").AiContext | null, userId: string, id: string, log: (entry: Record<string, unknown>) => void }} ctx
 */
export async function handleTagPhoto(req, res, { ai, userId, id, log }) {
  const started = Date.now();
  /** @param {string} code */
  const done = (code) => log({ event: "ai_tag", id, code, ms: Date.now() - started });
  /** @param {number} status @param {string} code @param {Record<string, string>} [headers] */
  const reject = (status, code, headers) => {
    done(code);
    return rejectUnread(req, res, status, code, headers);
  };
  /** @param {number} status @param {string} code */
  const fail = (status, code) => {
    done(code);
    if (!res.destroyed) sendError(res, status, code);
  };

  if (!ai) return reject(503, "server_misconfigured");
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg") return reject(415, "unsupported_media_type");
  if (Number(req.headers["content-length"]) > MAX_BYTES) return reject(413, "payload_too_large");
  // Acquire before the limiter and before any await: a busy answer never consumes quota.
  const release = ai.tagSlots.tryAcquire(userId);
  if (!release) return reject(503, "ai_busy", { "Retry-After": "5" });
  try {
    if (!ai.limiter.check(userId, "tag")) return reject(429, "rate_limited");
    const store = ai.store;
    if (!store) return reject(503, "db_unavailable");
    // Decrypts before the body is read, so no_key / invalid_model never make the client upload 2 MB.
    const s = await loadSettingsKey({ ...ai, store }, userId);
    if (!s.ok) return reject(s.status, s.code);
    const body = await readBody(req, ai.bodyTimeouts);
    if (!body.ok) {
      return body.status === 400 ? fail(400, "invalid_photo") : reject(body.status, body.code);
    }
    const b = body.bytes;
    if (b.length < 3 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) {
      return fail(400, "invalid_photo");
    }
    const ctl = new AbortController();
    res.once("close", () => ctl.abort());
    const r = await TAGGERS[s.provider]({
      fetch: ai.fetch,
      key: s.key,
      model: s.model,
      image: b,
      signal: ctl.signal,
    });
    if (!r.ok) return fail(AI_ERROR_STATUS[r.code], r.code);
    const parsed = parseTagSuggestion(r.input);
    if (!parsed.ok) return fail(AI_ERROR_STATUS[parsed.code], parsed.code);
    done("ok");
    if (!res.destroyed) sendJson(res, 200, { suggestion: parsed.value });
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, route: "/api/ai/tag-photo", ...dbLogFields(err) });
    done(mapped.code);
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    if (!res.destroyed) sendError(res, mapped.status, mapped.code, extra);
  } finally {
    release();
  }
}
