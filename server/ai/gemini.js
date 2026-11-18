// @ts-check
// Gemini adapter: key check (GET v1beta/models/{id}, no tokens spent) and photo tagging (generateContent).
// A pure adapter: no store, KEK, user or logging. The key goes only into the x-goog-api-key header of a request to
// the pinned host, never into the URL. Error bodies are read capped and only an allowlisted reason is kept.
import { geminiReasonOf, mapGeminiError } from "./providerErrors.js";
import { readCapped } from "./readCapped.js";
import { buildTagSchema, TAG_FIELDS } from "./tagging.js";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_ERROR_BYTES = 8 * 1024;
const MAX_OUTPUT_TOKENS = 2048;

/** Per-model thinking settings (F-701.1 plan A3); one entry per catalog id, enforced by gemini.test.ts. */
export const GEMINI_THINKING = /** @type {Record<string, Record<string, number | string>>} */ ({
  "gemini-2.5-flash": { thinkingBudget: 0 },
  "gemini-2.5-flash-lite": { thinkingBudget: 0 },
  "gemini-2.5-pro": { thinkingBudget: 128 },
});

export const GEMINI_TAG_INSTRUCTION =
  "Look at the clothing item in the photo and describe it as one JSON object with these fields.\n" +
  TAG_FIELDS;

/**
 * A JSON schema in Gemini's responseSchema dialect: uppercase types, `nullable` instead of a null type, no null
 * in enums, no additionalProperties or maxLength.
 * @param {unknown} schema
 * @returns {Record<string, unknown>}
 */
export function toGeminiSchema(schema) {
  /** @param {any} s @returns {any} */
  const walk = (s) => {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === "additionalProperties" || k === "maxLength") continue;
      if (k === "type") {
        const types = Array.isArray(v) ? v : [v];
        const real = types.filter((t) => t !== "null");
        out.type = String(real[0]).toUpperCase();
        if (real.length !== types.length) out.nullable = true;
      } else if (k === "enum") {
        out.enum = v.filter((/** @type {unknown} */ x) => x !== null);
      } else if (k === "items") {
        out.items = walk(v);
      } else if (k === "properties") {
        out.properties = Object.fromEntries(Object.entries(v).map(([p, ps]) => [p, walk(ps)]));
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return walk(schema);
}

/** buildTagSchema() in Gemini's dialect. @returns {Record<string, unknown>} */
export function buildGeminiSchema() {
  return toGeminiSchema(buildTagSchema());
}

/** @param {Response} res */
async function errorCode(res) {
  return mapGeminiError(res.status, geminiReasonOf(await readCapped(res, MAX_ERROR_BYTES)));
}

/**
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, timeoutMs?: number }} p
 * @returns {Promise<{ ok: true } | { ok: false, code: ReturnType<typeof mapGeminiError> }>}
 */
export async function checkGeminiKey({ fetch, key, model, timeoutMs = 10_000 }) {
  /** @type {Response | undefined} */
  let res;
  try {
    res = await fetch(GEMINI_BASE + encodeURIComponent(model), {
      method: "GET",
      headers: { "x-goog-api-key": key },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? { ok: true } : { ok: false, code: await errorCode(res) };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    await res?.body?.cancel().catch(() => {});
  }
}

/**
 * One generateContent call with a JSON response schema. Returns the raw parsed object. No retries, no logging;
 * response text and reasons are never returned.
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, parts: unknown[], schema: Record<string, unknown>, temperature?: number, signal?: AbortSignal, timeoutMs: number }} p
 * @returns {Promise<{ ok: true, input: Record<string, unknown> } | { ok: false, code: ReturnType<typeof mapGeminiError> | "provider_bad_response" }>}
 */
async function geminiJsonCall({
  fetch,
  key,
  model,
  parts,
  schema,
  temperature,
  signal,
  timeoutMs,
}) {
  /** @type {Response | undefined} */
  let res;
  try {
    const thinking = Object.hasOwn(GEMINI_THINKING, model) ? GEMINI_THINKING[model] : undefined;
    res = await fetch(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(temperature === undefined ? {} : { temperature }),
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
    });
    if (!res.ok) return { ok: false, code: await errorCode(res) };
    const data = /** @type {any} */ (await readCapped(res, MAX_RESPONSE_BYTES));
    const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : undefined;
    const outParts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = outParts
      .filter((/** @type {any} */ p) => typeof p?.text === "string" && p.thought !== true)
      .map((/** @type {any} */ p) => p.text)
      .join("");
    if (candidate?.finishReason !== "STOP" || text === "") {
      return { ok: false, code: "provider_bad_response" };
    }
    /** @type {unknown} */
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      return { ok: false, code: "provider_bad_response" };
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { ok: false, code: "provider_bad_response" };
    }
    return { ok: true, input: /** @type {Record<string, unknown>} */ (input) };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    await res?.body?.cancel().catch(() => {});
  }
}

/**
 * Tags a JPEG with a JSON response schema. Returns the raw (unsanitized) object; parseTagSuggestion validates it.
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, image: Buffer, signal?: AbortSignal, timeoutMs?: number }} p
 */
export function tagPhotoWithGemini({ fetch, key, model, image, signal, timeoutMs = 45_000 }) {
  return geminiJsonCall({
    fetch,
    key,
    model,
    signal,
    timeoutMs,
    temperature: 0,
    schema: buildGeminiSchema(),
    parts: [
      { inline_data: { mime_type: "image/jpeg", data: image.toString("base64") } },
      { text: GEMINI_TAG_INSTRUCTION },
    ],
  });
}

/**
 * Picks outfits from a text-only prompt (F-704.3): one text part, no image. No `temperature`, so the model
 * default applies and repeated calls vary.
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, prompt: string, schema: unknown, signal?: AbortSignal, timeoutMs?: number }} p
 */
export function suggestWithGemini({
  fetch,
  key,
  model,
  prompt,
  schema,
  signal,
  timeoutMs = 30_000,
}) {
  return geminiJsonCall({
    fetch,
    key,
    model,
    signal,
    timeoutMs,
    schema: toGeminiSchema(schema),
    parts: [{ text: prompt }],
  });
}
