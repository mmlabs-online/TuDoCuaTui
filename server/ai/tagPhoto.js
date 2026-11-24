// @ts-check
// POST /api/ai/tag-photo: raw JPEG body -> suggested item fields (DB ids only), using the shared key (F-706.4).
// A paid call (photo_fill): credits and the spend cap are reserved before the body is read, so a request that
// cannot be served never uploads 2 MB. The Idempotency-Key header is required. Logs carry fixed fields only:
// never the image, the key, the suggestion or an error object.
import { dbLogFields, mapDbError } from "../errors.js";
import { sendError } from "../http.js";
import { MAX_BYTES, readBody, rejectUnread } from "../photos.js";
import { tagPhotoWithGemini } from "./gemini.js";
import { hashBytes, parseOpKey, runPaidCall } from "./paidCall.js";
import { parseTagSuggestion } from "./tagging.js";

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
  /** @param {number} status @param {string} code @param {Record<string, string>} [headers] */
  const fail = (status, code, headers) => {
    done(code);
    if (!res.destroyed) sendError(res, status, code, {}, headers);
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
    const key = parseOpKey(req.headers);
    if (!key.ok) return reject(400, "bad_request");
    let bodyRead = false;
    await runPaidCall({
      ai,
      userId,
      opKey: key.opKey,
      kind: "photo_fill",
      res,
      log,
      id,
      unread: () => !bodyRead,
      reject,
      fail,
      done,
      getInput: async () => {
        const body = await readBody(req, ai.bodyTimeouts);
        bodyRead = true;
        if (!body.ok) {
          return body.status === 400
            ? { ok: false, status: 400, code: "invalid_photo" }
            : { ok: false, status: body.status, code: body.code, close: true };
        }
        const b = body.bytes;
        if (b.length < 3 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) {
          return { ok: false, status: 400, code: "invalid_photo" };
        }
        return { ok: true, hash: hashBytes(b), input: b };
      },
      call: async ({ key: apiKey, model, input, signal }) => {
        const r = await tagPhotoWithGemini({
          fetch: ai.fetch,
          key: apiKey,
          model,
          image: input,
          signal,
        });
        if (!r.ok) return { ok: false, code: r.code };
        const parsed = parseTagSuggestion(r.input);
        if (!parsed.ok) return { ok: false, code: parsed.code };
        return { ok: true, result: { suggestion: parsed.value } };
      },
    });
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
