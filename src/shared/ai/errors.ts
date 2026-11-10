// Source of truth: src/shared/ai; mirrored to supabase/functions/_shared/ai; mirror.test.ts enforces equality.

/** Codes returned by the Edge Function, with their HTTP status. */
export const AI_ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  method_not_allowed: 405,
  payload_too_large: 413,
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
} as const;

export type AiServerErrorCode = keyof typeof AI_ERROR_STATUS;

/** Codes only the browser wrapper produces (no HTTP status). */
export const AI_CLIENT_ERROR_CODES = ["not_available", "network"] as const;
export type AiClientErrorCode = (typeof AI_CLIENT_ERROR_CODES)[number];

export type AiErrorCode = AiServerErrorCode | AiClientErrorCode;

export function isServerErrorCode(value: unknown): value is AiServerErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AI_ERROR_STATUS, value);
}
