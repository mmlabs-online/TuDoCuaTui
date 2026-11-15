import type { Runtime } from "@/data/mode";

const VERIFY_PATH = "/verify-email";

/**
 * Must run synchronously before any fetch: copies `location.hash` on `/verify-email` and removes it from the
 * address bar at once (D36). Returns the copied hash (`"#token=…"`) or null.
 */
export function takeVerifyHash(
  loc: Pick<Location, "pathname" | "hash"> = location,
  hist: Pick<History, "replaceState"> = history,
): string | null {
  if (loc.pathname !== VERIFY_PATH || !loc.hash) return null;
  const hash = loc.hash;
  hist.replaceState(null, "", VERIFY_PATH);
  return hash;
}

/** The auth chunk loads for the identity gate, or for a verify-email visit in api mode (identity or access). */
export function needsAuth({ mode, auth }: Runtime, verifyHash: string | null): boolean {
  if (mode !== "api") return false;
  return auth === "identity" || verifyHash !== null;
}
