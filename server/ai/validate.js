// @ts-check
// Server copy of src/shared/ai/validate.ts (parity.test.ts), with a REST body parser instead of parseRequest.
import { AI_MODELS, AI_PROVIDERS } from "./catalog.js";

export const MAX_BODY_BYTES = 4096;

/** @param {unknown} value @returns {value is import("./catalog.js").AiProvider} */
export function isAllowedProvider(value) {
  return (
    typeof value === "string" && /** @type {readonly string[]} */ (AI_PROVIDERS).includes(value)
  );
}

/**
 * Exact match only: no trimming, no case folding.
 * @param {import("./catalog.js").AiProvider} provider
 * @param {unknown} model
 */
export function isAllowedModel(provider, model) {
  return typeof model === "string" && AI_MODELS[provider].some((m) => m.id === model);
}

/**
 * Trimmed, 20-256 printable ASCII characters, no inner whitespace.
 * @param {unknown} raw
 * @returns {{ ok: true, key: string } | { ok: false }}
 */
export function validateApiKeyFormat(raw) {
  if (typeof raw !== "string") return { ok: false };
  const key = raw.trim();
  if (!/^[!-~]{20,256}$/.test(key)) return { ok: false };
  return { ok: true, key };
}

/**
 * Shape check for PUT /api/ai-settings. Values are validated by the route. Unknown fields are rejected.
 * @param {unknown} body
 * @returns {{ ok: true, value: { provider: string, model: string, apiKey?: string } } | { ok: false, code: "bad_request" }}
 */
export function parseSettingsBody(body) {
  const bad = /** @type {const} */ ({ ok: false, code: "bad_request" });
  if (typeof body !== "object" || body === null || Array.isArray(body)) return bad;
  const b = /** @type {Record<string, unknown>} */ (body);
  if (!Object.keys(b).every((k) => k === "provider" || k === "model" || k === "apiKey")) return bad;
  if (typeof b.provider !== "string" || typeof b.model !== "string") return bad;
  if (b.apiKey !== undefined && typeof b.apiKey !== "string") return bad;
  /** @type {{ provider: string, model: string, apiKey?: string }} */
  const value = { provider: b.provider, model: b.model };
  if (b.apiKey !== undefined) value.apiKey = b.apiKey;
  return { ok: true, value };
}
