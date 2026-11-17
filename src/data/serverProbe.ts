export type ProbeResult = "ok" | "unreachable";

type Once = "yes" | "no" | "error";

/** Only the Node server answers /healthz with JSON {status:"ok"}; SPA hosts answer with HTML. */
async function probeOnce(fetchFn: typeof fetch, timeoutMs: number): Promise<Once> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // manual: a redirect is never followed; it is not the Node server's JSON, so it counts as "no"
    const res = await fetchFn("/healthz", {
      cache: "no-store",
      redirect: "manual",
      signal: ctrl.signal,
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("application/json")) {
      return "no";
    }
    const body = (await res.json()) as { status?: string } | null;
    return body?.status === "ok" ? "yes" : "no";
  } catch (e) {
    // a body that is not JSON is a definite "no"; anything else (network, abort) may be transient
    return e instanceof SyntaxError ? "no" : "error";
  } finally {
    clearTimeout(timer);
  }
}

/** "ok" only when the Node server answers; one retry after a transient failure. Never falls back to anything (D44). */
export async function probeServer({
  fetchFn = (...a: Parameters<typeof fetch>) => fetch(...a),
  timeoutMs = 2000,
}: { fetchFn?: typeof fetch; timeoutMs?: number } = {}): Promise<ProbeResult> {
  let r = await probeOnce(fetchFn, timeoutMs);
  if (r === "error") r = await probeOnce(fetchFn, timeoutMs);
  return r === "yes" ? "ok" : "unreachable";
}
