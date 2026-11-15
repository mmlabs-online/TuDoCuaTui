/**
 * Pages whose URL carries a one-time token in the fragment (D35, D36). Mirrored by `NO_REFERRER_PATHS` in
 * `server/static.js` (the runtime image has no `src/`); `server/tokenPages.parity.test.ts` pins them equal.
 */
export const TOKEN_PAGES = { verify: "/verify-email", reset: "/reset-password" } as const;
export type TokenPage = keyof typeof TOKEN_PAGES;

/** Exact path or exactly one trailing `/`, case-sensitive (same rule as the server's referrerPolicyFor). */
export function tokenPageOf(pathname: string): TokenPage | null {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const page of Object.keys(TOKEN_PAGES) as TokenPage[]) {
    if (TOKEN_PAGES[page] === p) return page;
  }
  return null;
}
