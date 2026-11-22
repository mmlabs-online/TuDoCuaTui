// @ts-check
// Model price table, token ceilings, spend cap and no-charge rules (F-706.2, D53).
// Pure logic, no I/O.
import { vnToday } from "../validate.js";

export const PRICE_VERSION = "2026-11-22";

/** App-wide monthly AI spend cap ($20 in micro-USD). */
export const MONTHLY_CAP_MICRO_USD = 20_000_000;

/**
 * Worst-case input tokens for one photo under MAX_BYTES (2 MiB, any dimensions).
 * Gemini bills 258 tokens per 768x768 tile; Claude bills ~w*h/750 after downscale.
 */
export const IMAGE_TOKENS_MAX = 10_000;

/**
 * Pessimistic token ceilings per operation kind.
 * Output: Gemini MAX_OUTPUT_TOKENS (2048) + largest thinking budget (128). Claude max_tokens (1024) is lower.
 * Suggest input: UTF-8 bytes of largest prompt + schema (40 candidates today, 20 after F-707.2).
 * Photo fill input: IMAGE_TOKENS_MAX + largest tag instruction bytes + tag schema JSON + 1000 margin.
 * sticker: null means priced per image only.
 */
export const KIND_CEILINGS = Object.freeze({
  photo_fill: Object.freeze({ inputTokens: 16_000, outputTokens: 2_176 }),
  suggest: Object.freeze({ inputTokens: 32_000, outputTokens: 2_176 }),
  sticker: null,
});

/**
 * Prices in integer micro-USD per million tokens or per image.
 * Snapshot as of 2026-11-22; recheck before F-706.4 release (M-45).
 */
export const PRICES = Object.freeze({
  "gemini:gemini-2.5-flash": Object.freeze({
    inMicroUsdPerMTok: 300_000,
    outMicroUsdPerMTok: 2_500_000,
  }),
  "gemini:gemini-2.5-flash-lite": Object.freeze({
    inMicroUsdPerMTok: 100_000,
    outMicroUsdPerMTok: 400_000,
  }),
  "gemini:gemini-2.5-pro": Object.freeze({
    inMicroUsdPerMTok: 1_250_000,
    outMicroUsdPerMTok: 10_000_000,
  }),
  "claude:claude-haiku-5-5": Object.freeze({
    inMicroUsdPerMTok: 100_000,
    outMicroUsdPerMTok: 500_000,
  }),
  "claude:claude-sonnet-5-5": Object.freeze({
    inMicroUsdPerMTok: 2_000_000,
    outMicroUsdPerMTok: 10_000_000,
  }),
  "claude:claude-opus-5-5": Object.freeze({
    inMicroUsdPerMTok: 4_000_000,
    outMicroUsdPerMTok: 20_000_000,
  }),
});

/**
 * Estimates cost in integer micro-USD. Returns null if unpriced.
 * @param {string} provider
 * @param {string} model
 * @param {string} kind
 * @param {Record<string, any>} [table]
 * @returns {number | null}
 */
export function estimateMicroUsd(provider, model, kind, table = PRICES) {
  const key = `${provider}:${model}`;
  if (!Object.hasOwn(table, key)) return null;
  const entry = table[key];
  if (!entry || typeof entry !== "object") return null;

  if (kind === "sticker") {
    if (typeof entry.microUsdPerImage === "number") {
      const inPart =
        typeof entry.inMicroUsdPerMTok === "number"
          ? Math.ceil((IMAGE_TOKENS_MAX * entry.inMicroUsdPerMTok) / 1e6)
          : 0;
      return Math.ceil(entry.microUsdPerImage + inPart);
    }
    return null;
  }

  if (Object.hasOwn(KIND_CEILINGS, kind)) {
    const c = KIND_CEILINGS[/** @type {keyof typeof KIND_CEILINGS} */ (kind)];
    if (!c) return null;
    if (
      typeof entry.inMicroUsdPerMTok !== "number" ||
      typeof entry.outMicroUsdPerMTok !== "number"
    ) {
      return null;
    }
    const inCost = Math.ceil((c.inputTokens * entry.inMicroUsdPerMTok) / 1e6);
    const outCost = Math.ceil((c.outputTokens * entry.outMicroUsdPerMTok) / 1e6);
    return inCost + outCost;
  }

  return null;
}

/**
 * Outcomes confirmed by provider HTTP response to have incurred zero provider charge.
 * not_sent: request aborted or not sent
 * 401/403/404/429 HTTP statuses before generation
 */
export const NO_CHARGE_OUTCOMES = Object.freeze([
  "not_sent",
  "invalid_key",
  "key_forbidden",
  "model_unavailable",
  "provider_rate_limited",
]);

/**
 * @param {unknown} outcome
 * @returns {boolean}
 */
export function isConfirmedNoCharge(outcome) {
  return typeof outcome === "string" && NO_CHARGE_OUTCOMES.includes(outcome);
}

/**
 * Period string 'YYYY-MM' in Asia/Ho_Chi_Minh (UTC+7, D53).
 * @param {number} [nowMs]
 * @returns {string}
 */
export function spendPeriod(nowMs) {
  return vnToday(nowMs ?? Date.now()).slice(0, 7);
}
