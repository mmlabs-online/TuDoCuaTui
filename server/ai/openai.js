// @ts-check
// OpenAI key check: GET /v1/models (no tokens spent).
// A pure adapter: no store, KEK, user or logging. The key goes only into the Authorization header
// of a request to the pinned host. Only the status is read.

export const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

/**
 * Checks an OpenAI API key without spending tokens.
 * @param {{ fetch: typeof globalThis.fetch, key: string, timeoutMs?: number }} p
 * @returns {Promise<{ ok: true } | { ok: false, code: "invalid_key" | "provider_rate_limited" | "provider_unavailable" }>}
 */
export async function checkOpenAiKey({ fetch, key, timeoutMs = 10_000 }) {
  /** @type {Response | undefined} */
  let res;
  try {
    res = await fetch(OPENAI_MODELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, code: "invalid_key" };
    if (res.status === 429) return { ok: false, code: "provider_rate_limited" };
    return { ok: false, code: "provider_unavailable" };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    await res?.body?.cancel().catch(() => {});
  }
}
