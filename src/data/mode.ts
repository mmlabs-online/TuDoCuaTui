import { supabase } from "@/lib/supabase";

export type DataMode = "local" | "supabase" | "api";

/** api (served by the Node server) beats supabase (env set) beats local. */
export const pickMode = (apiAvailable: boolean, hasSupabase: boolean): DataMode =>
  apiAvailable ? "api" : hasSupabase ? "supabase" : "local";

type Probe = "yes" | "no" | "error";

/** Only the Node server answers /healthz with JSON {status:"ok"}; SPA hosts answer with HTML. */
async function probeOnce(fetchFn: typeof fetch, timeoutMs: number): Promise<Probe> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn("/healthz", { cache: "no-store", signal: ctrl.signal });
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
  hasSupabase = !!supabase,
  dev = import.meta.env.DEV,
  timeoutMs = 2000,
}: {
  fetchFn?: typeof fetch;
  hasSupabase?: boolean;
  dev?: boolean;
  timeoutMs?: number;
} = {}): Promise<DataMode> {
  if (dev) return pickMode(false, hasSupabase);
  let r = await probeOnce(fetchFn, timeoutMs);
  if (r === "error") r = await probeOnce(fetchFn, timeoutMs);
  return pickMode(r === "yes", hasSupabase);
}
