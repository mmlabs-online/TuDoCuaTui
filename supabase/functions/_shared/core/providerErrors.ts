import type { AiServerErrorCode } from "../ai/errors.ts";

export type ProviderErrorCode = Extract<
  AiServerErrorCode,
  | "invalid_key"
  | "key_forbidden"
  | "model_unavailable"
  | "provider_rate_limited"
  | "provider_unavailable"
>;

export type TestResult = { ok: true } | { ok: false; code: ProviderErrorCode; status?: number };

function byStatus(status: number | undefined): ProviderErrorCode {
  if (status === 401) return "invalid_key";
  if (status === 403) return "key_forbidden";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "provider_rate_limited";
  return "provider_unavailable";
}

/** Anthropic SDK errors carry an HTTP `status`; timeouts and network errors have none. */
export function mapClaudeError(status: number | undefined): ProviderErrorCode {
  return byStatus(status);
}

/**
 * Google API errors: HTTP status plus a structured `error.details[].reason` (e.g. API_KEY_INVALID).
 * Only the status and that reason are read, never the message text.
 */
export function mapGeminiError(
  status: number | undefined,
  reason: string | undefined,
): ProviderErrorCode {
  if (reason === "API_KEY_INVALID") return "invalid_key";
  return byStatus(status);
}

export function geminiReasonOf(body: unknown): string | undefined {
  const details = (body as { error?: { details?: unknown } } | null)?.error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    const reason = (d as { reason?: unknown } | null)?.reason;
    if (typeof reason === "string") return reason;
  }
  return undefined;
}
