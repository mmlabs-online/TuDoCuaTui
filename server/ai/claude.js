// @ts-check
// Claude key check: GET /v1/models/{id} (no tokens spent). A pure adapter: no store, KEK, user or logging.
// The key goes only into the x-api-key header of a request to the pinned host. Only the status is read.
import { mapClaudeError } from "./providerErrors.js";

export const CLAUDE_MODELS_URL = "https://api.anthropic.com/v1/models/";

/**
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, timeoutMs?: number }} p
 * @returns {Promise<{ ok: true } | { ok: false, code: ReturnType<typeof mapClaudeError> }>}
 */
export async function checkClaudeKey({ fetch, key, model, timeoutMs = 10_000 }) {
  /** @type {Response | undefined} */
  let res;
  try {
    res = await fetch(CLAUDE_MODELS_URL + encodeURIComponent(model), {
      method: "GET",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? { ok: true } : { ok: false, code: mapClaudeError(res.status) };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    await res?.body?.cancel().catch(() => {});
  }
}
