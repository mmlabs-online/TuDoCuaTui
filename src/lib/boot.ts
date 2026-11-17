import { TOKEN_PAGES, tokenPageOf, type TokenPage } from "@/shared/tokenPages";

export type TokenLink = { page: TokenPage; hash: string };

/**
 * Must run synchronously before any fetch: copies `location.hash` on a token page (/verify-email,
 * /reset-password) and removes it from the address bar at once (D36). Returns the page and the copied hash
 * (`"#token=…"`) or null.
 */
export function takeTokenHash(
  loc: Pick<Location, "pathname" | "hash"> = location,
  hist: Pick<History, "replaceState"> = history,
): TokenLink | null {
  const page = tokenPageOf(loc.pathname);
  if (!page || !loc.hash) return null;
  const hash = loc.hash;
  hist.replaceState(null, "", TOKEN_PAGES[page]);
  return { page, hash };
}
