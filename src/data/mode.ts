export type DataMode = "local" | "api";

/** api (served by the Node server) or local (localStorage + demo data). */
export const pickMode = (apiAvailable: boolean): DataMode => (apiAvailable ? "api" : "local");

export type AuthKind = "identity" | "access" | null;
type Probe = { result: "yes" | "no" | "error"; auth: AuthKind };
const probe = (result: Probe["result"], auth: AuthKind = null): Probe => ({ result, auth });

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
    if (res.type === "opaqueredirect") return probe("yes");
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("application/json")) {
      return probe("no");
    }
    const body = (await res.json()) as { status?: string; auth?: unknown } | null;
    if (body?.status !== "ok") return probe("no");
    return probe("yes", body.auth === "identity" || body.auth === "access" ? body.auth : null);
  } catch (e) {
    // a body that is not JSON is a definite "no"; anything else (network, abort) may be transient
    return probe(e instanceof SyntaxError ? "no" : "error");
  } finally {
    clearTimeout(timer);
  }
}

export interface Runtime {
  mode: DataMode;
  /** `/healthz` `auth` field; null when absent, unknown, or not api mode. */
  auth: AuthKind;
}

export async function detectRuntime({
  fetchFn = (...a: Parameters<typeof fetch>) => fetch(...a),
  dev = import.meta.env.DEV,
  timeoutMs = 2000,
}: {
  fetchFn?: typeof fetch;
  dev?: boolean;
  timeoutMs?: number;
} = {}): Promise<Runtime> {
  if (dev) return { mode: pickMode(false), auth: null };
  let r = await probeOnce(fetchFn, timeoutMs);
  if (r.result === "error") r = await probeOnce(fetchFn, timeoutMs);
  return { mode: pickMode(r.result === "yes"), auth: r.result === "yes" ? r.auth : null };
}

export async function detectMode(
  opts: Parameters<typeof detectRuntime>[0] = {},
): Promise<DataMode> {
  return (await detectRuntime(opts)).mode;
}
