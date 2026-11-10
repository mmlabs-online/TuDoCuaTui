import { geminiReasonOf, mapGeminiError, type TestResult } from "./providerErrors.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

/**
 * Cheap key check: GET on the model resource (no tokens). The key goes in a header, never the URL.
 * Endpoint and error shape are NOT yet verified against Google's docs; Gemini has no models in the
 * catalog, so this path is unreachable until a verified model list is added.
 */
export async function testGeminiKey(
  fetchFn: typeof fetch,
  key: string,
  model: string,
  timeoutMs = 10_000,
): Promise<TestResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(BASE + encodeURIComponent(model), {
      method: "GET",
      headers: { "x-goog-api-key": key },
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true };
    let reason: string | undefined;
    try {
      reason = geminiReasonOf(await res.json());
    } catch {
      reason = undefined;
    }
    return { ok: false, code: mapGeminiError(res.status, reason), status: res.status };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
