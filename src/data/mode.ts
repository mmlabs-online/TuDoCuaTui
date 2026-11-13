export type DataMode = "local" | "api";

/** api (served by the Node server) or local (localStorage + demo data). */
export const pickMode = (apiAvailable: boolean): DataMode => (apiAvailable ? "api" : "local");

type Probe = "yes" | "no" | "error";

/** Only the Node server answers /healthz with JSON {status:"ok"}; SPA hosts answer with HTML. */
async function probeOnce(fetchFn: typeof fetch, timeoutMs: number): Promise<Probe> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // manual: an expired Cloudflare Access session redirects to the Access login, which must not
    // look like an SPA host (that would fall back to local mode instead of API mode)
    const res = await fetchFn("/healthz", {
      cache: "no-store",
      redirect: "manual",
      signal: ctrl.signal,
    });
    if (res.type === "opaqueredirect") return "yes";
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

export async function detectMode({
  fetchFn = (...a: Parameters<typeof fetch>) => fetch(...a),
  dev = import.meta.env.DEV,
  timeoutMs = 2000,
}: {
  fetchFn?: typeof fetch;
  dev?: boolean;
  timeoutMs?: number;
} = {}): Promise<DataMode> {
  if (dev) return pickMode(false);
  let r = await probeOnce(fetchFn, timeoutMs);
  if (r === "error") r = await probeOnce(fetchFn, timeoutMs);
  return pickMode(r === "yes");
}
