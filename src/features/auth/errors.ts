import type { AuthError, AuthErrorCode } from "./types";

/**
 * Codes accepted from a server body. Client-only codes (`no_access`) and codes that signal a bug or
 * misconfiguration (`app_header_required`, `origin_not_allowed`, `audience_mismatch`) are not in it.
 */
export const SERVER_AUTH_ERROR_CODES: readonly AuthErrorCode[] = [
  "invalid_credentials",
  "email_unverified",
  "not_member",
  "session_invalid",
  "turnstile_required",
  "turnstile_failed",
  "rate_limited",
  "email_taken",
  "weak_password",
  "validation_error",
  "token_invalid",
  "email_already_verified",
];

const RETRY_MAX_SECONDS = 86400;

function parseSeconds(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,9}$/.test(value.trim())
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.ceil(n), RETRY_MAX_SECONDS);
}

export const networkError = (): AuthError => ({ code: "network" });

/** Normalises a server error response. Never throws; never echoes server-provided text. */
export function toAuthError(_status: number, headers: Headers | null, json: unknown): AuthError {
  try {
    const err = (json as { error?: { code?: unknown; details?: unknown } } | null)?.error;
    const raw = err?.code;
    const code: AuthErrorCode =
      typeof raw === "string" && (SERVER_AUTH_ERROR_CODES as readonly string[]).includes(raw)
        ? (raw as AuthErrorCode)
        : "unknown";
    const out: AuthError = { code };
    if (code === "rate_limited") {
      const details = err?.details as { retry_after?: unknown } | null | undefined;
      const wait = parseSeconds(headers?.get("Retry-After")) ?? parseSeconds(details?.retry_after);
      if (wait !== undefined) out.retryAfterSeconds = wait;
    }
    if (code === "weak_password") {
      const reasons = (err?.details as { reasons?: unknown } | null | undefined)?.reasons;
      if (Array.isArray(reasons)) {
        const ok = reasons.filter(
          (r): r is "too_short" | "too_common" => r === "too_short" || r === "too_common",
        );
        if (ok.length) out.reasons = ok;
      }
    }
    return out;
  } catch {
    return { code: "unknown" };
  }
}
