// @ts-check
// Claude HTTP status -> AiErrorCode. The Gemini half is F-701's or later.

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
