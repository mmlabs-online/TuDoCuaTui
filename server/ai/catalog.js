// @ts-check
// Server copy of src/shared/ai/{catalog,errors}.ts (JS: the image has no src/ and no build step).
// server/ai/parity.test.ts enforces equality with the TypeScript tree.

export const AI_PROVIDERS = /** @type {const} */ (["claude", "gemini"]);

/** @typedef {(typeof AI_PROVIDERS)[number]} AiProvider */
/** @typedef {{ id: string, label: string, isDefault: boolean }} AiModel */
/** @typedef {{ provider: AiProvider, model: string, keyHint: string | null, hasKey: boolean, modelSupported: boolean, updatedAt: string }} AiSettingsView */

/** @type {Record<AiProvider, readonly AiModel[]>} */
export const AI_MODELS = {
  claude: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", isDefault: false },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", isDefault: false },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", isDefault: true },
  ],
  gemini: [],
};

export const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export const AI_ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  method_not_allowed: 405,
  payload_too_large: 413,
  invalid_json: 400,
  unsupported_media_type: 415,
  forbidden_origin: 403,
  db_unavailable: 503,
  invalid_provider: 400,
  invalid_model: 400,
  invalid_key_format: 400,
  key_required: 400,
  not_configured: 409,
  key_unreadable: 409,
  invalid_key: 422,
  key_forbidden: 422,
  model_unavailable: 422,
  provider_rate_limited: 429,
  provider_unavailable: 502,
  rate_limited: 429,
  server_misconfigured: 503,
  internal: 500,
};

/** @param {AiProvider} provider @returns {string | null} */
export function defaultModelOf(provider) {
  return AI_MODELS[provider].find((m) => m.isDefault)?.id ?? null;
}
