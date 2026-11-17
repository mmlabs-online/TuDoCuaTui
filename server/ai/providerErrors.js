// @ts-check
// Provider HTTP status (and, for Gemini, an allowlisted google.rpc reason) -> AiErrorCode.

/** @param {number} status @returns {"invalid_key" | "key_forbidden" | "model_unavailable" | "provider_rate_limited" | "provider_unavailable"} */
export function mapClaudeError(status) {
  switch (status) {
    case 401:
      return "invalid_key";
    case 403:
      return "key_forbidden";
    case 404:
      return "model_unavailable";
    case 429:
      return "provider_rate_limited";
    default:
      return "provider_unavailable";
  }
}

const GEMINI_REASONS = new Set([
  "API_KEY_INVALID",
  "API_KEY_SERVICE_BLOCKED",
  "SERVICE_DISABLED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
]);
const GEMINI_STATUSES = new Set(["FAILED_PRECONDITION"]);

/**
 * Allowlisted reason from a Google error body: the first google.rpc.ErrorInfo detail decides; otherwise the rpc
 * status. Never reads `message`; never throws. Anything unknown is "other".
 * @param {unknown} body
 * @returns {string}
 */
export function geminiReasonOf(body) {
  const error = /** @type {any} */ (body)?.error;
  if (typeof error !== "object" || error === null) return "other";
  if (Array.isArray(error.details)) {
    const info = error.details.find(
      (/** @type {any} */ d) =>
        typeof d?.["@type"] === "string" && d["@type"].endsWith("google.rpc.ErrorInfo"),
    );
    if (info) {
      return typeof info.reason === "string" && GEMINI_REASONS.has(info.reason)
        ? info.reason
        : "other";
    }
  }
  return typeof error.status === "string" && GEMINI_STATUSES.has(error.status)
    ? error.status
    : "other";
}

/** @param {number} status @param {string} reason @returns {ReturnType<typeof mapClaudeError>} */
export function mapGeminiError(status, reason) {
  switch (status) {
    case 400:
      if (reason === "API_KEY_INVALID") return "invalid_key";
      return reason === "FAILED_PRECONDITION" || GEMINI_REASONS.has(reason)
        ? "key_forbidden"
        : "provider_unavailable";
    case 401:
      return "invalid_key";
    case 403:
      return "key_forbidden";
    case 404:
      return "model_unavailable";
    case 429:
      return "provider_rate_limited";
    default:
      return "provider_unavailable";
  }
}
