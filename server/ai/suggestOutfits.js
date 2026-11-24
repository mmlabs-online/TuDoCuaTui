// @ts-check
// POST /api/ai/suggest-outfits: candidate item ids -> up to 3 AI-picked outfits (DB ids only), using the shared key
// (F-706.4). The candidates are reloaded from the DB (own, active, outfit categories), so a foreign or unknown id
// never reaches the provider. Text only: no photos. A paid call (suggest) unless fewer than 2 candidates remain,
// which answers [] for free. The Idempotency-Key header is required. Logs carry fixed fields only: never the key,
// names or reasons.
import { dbLogFields, mapDbError } from "../errors.js";
import { readJson, sendError, sendJson } from "../http.js";
import { loadSuggestCandidates } from "../items.js";
import { rejectUnread } from "../photos.js";
import { vnToday } from "../validate.js";
import { suggestWithGemini } from "./gemini.js";
import {
  buildSuggestPrompt,
  buildSuggestSchema,
  parseSuggestBody,
  SUGGEST_CATEGORIES,
  SUGGEST_LIMITS,
  validateSuggestions,
} from "./outfitSuggest.js";
import { hashJson, parseOpKey, runPaidCall } from "./paidCall.js";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ ai: import("./routes.js").AiContext | null, pool: import("../items.js").Pool | null, userId: import("../user.js").UserId, id: string, log: (entry: Record<string, unknown>) => void, now: () => number }} ctx
 */
export async function handleSuggestOutfits(req, res, { ai, pool, userId, id, log, now }) {
  const started = Date.now();
  /** @param {string} code */
  const done = (code) => log({ event: "ai_suggest", id, code, ms: Date.now() - started });
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
  // Acquire before the limiter and before any await: a busy answer never consumes quota.
  const release = ai.suggestSlots.tryAcquire(userId);
  if (!release) return reject(503, "ai_busy", { "Retry-After": "5" });
  try {
    const key = parseOpKey(req.headers);
    if (!key.ok) return reject(400, "bad_request");
    const body = await readJson(req, {
      limit: SUGGEST_LIMITS.bodyBytes,
      timeouts: ai.bodyTimeouts,
    });
    if (!body.ok) {
      if (body.status === 413) return reject(413, body.code);
      return fail(body.status, body.code);
    }
    const parsed = parseSuggestBody(body.value);
    if (!parsed.ok) return fail(400, parsed.code);
    if (!pool) return fail(503, "db_unavailable");
    const { candidateIds, season, weather, avoidIds } = parsed.value;
    const rows = await loadSuggestCandidates(pool, userId, candidateIds, SUGGEST_CATEGORIES);
    if (rows.length < 2) {
      done("ok");
      if (!res.destroyed) sendJson(res, 200, { outfits: [] });
      return;
    }
    if (!ai.limiter.check(userId, "suggest")) return fail(429, "rate_limited");
    const { prompt, aliases } = buildSuggestPrompt(rows, {
      season,
      weather,
      avoidIds,
      today: vnToday(now()),
    });
    const categories = new Map(rows.map((x) => [x.id, x.category]));
    await runPaidCall({
      ai,
      userId,
      opKey: key.opKey,
      kind: "suggest",
      res,
      log,
      id,
      unread: () => false,
      reject,
      fail,
      done,
      getInput: async () => ({
        ok: true,
        hash: hashJson({ candidateIds, season, weather, avoidIds }),
        input: null,
      }),
      call: async ({ key: apiKey, model, signal }) => {
        const r = await suggestWithGemini({
          fetch: ai.fetch,
          key: apiKey,
          model,
          prompt,
          schema: buildSuggestSchema(aliases),
          signal,
        });
        if (!r.ok) return { ok: false, code: r.code };
        const valid = validateSuggestions(r.input, aliases, categories);
        if (!valid.ok) return { ok: false, code: valid.code };
        return { ok: true, result: { outfits: valid.outfits } };
      },
    });
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, route: "/api/ai/suggest-outfits", ...dbLogFields(err) });
    done(mapped.code);
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    if (!res.destroyed) sendError(res, mapped.status, mapped.code, extra);
  } finally {
    release();
  }
}
