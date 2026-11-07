# Consult — software-architect — F-007 (2026-11-07)

**Findings**
- No client router (no Router / `pushState` / `<Route` in `src`); the only path that matters is `/`. `emailRedirectTo = origin + pathname`, so magic links return to `https://<project>.pages.dev/`.
- `public/` holds only `favicon.png` and `.gitattributes`; there is no `404.html`. `site.json` has `robots.index:false`, so the build emits a disallow-all `robots.txt` and a noindex meta tag.
- Node is pinned only in `.mise.toml` (node 22, pnpm 10.34.3); `package.json` has `packageManager: pnpm@10.34.3` and no `engines`; there is no `.node-version`.
- `risk-tiers.yml` marks `public/_redirects` and `wrangler.toml` High; `.node-version`, `public/_headers` and `README.md` default to Medium.
- `vite.config.ts` reads `FIGMA_PUBLIC_URL`, which Pages does not set; no edit is needed (R10).

**Recommendations** (Cloudflare details from knowledge as of about mid-2026; verify against the Pages docs)
1. Build settings (AC2): framework preset None, build command `pnpm build`, output `dist`, root `/`.
   - Build image v3 detects `pnpm-lock.yaml` and runs `pnpm install` itself, so an explicit install would install twice.
   - Add `.node-version` with `22`. Pages v3 reads `.node-version` / `.nvmrc` / `NODE_VERSION`; if a major-only value fails, use the full version.
   - Not confident that v3 honours `packageManager` via corepack: Ming sets `PNPM_VERSION=10.34.3` in Production and Preview (a plain value, not a secret).
2. SPA fallback (AC1): Pages already serves `index.html` for unknown paths when there is no top-level `404.html`. `/* /index.html 200` is redundant, and Pages/wrangler likely flag it as an infinite loop and ignore it. Recommendation: **drop `_redirects`** and document why in the README. This is a scope change, so the plan must flag it for Ming's approval; if Ming wants it kept, it is harmless but High.
3. Previews without Supabase (D5): Pages has separate Production and Preview variable sets.
   - `VITE_SUPABASE_*` go in Production only. They are build-time values, so changing them needs a redeploy ("Retry deployment").
   - Supabase: Site URL `https://<project>.pages.dev`. Redirect URLs, exact only: `https://<project>.pages.dev/` and `http://localhost:8443/`.
   - Ming copies the real subdomain, which may get a suffix if the name is taken.
4. Local check (AC1): `pnpm build` then `npx wrangler pages dev dist` (fetched on demand, not a dependency), which emulates Pages routing.
   - `curl -i localhost:8788/any/deep/link` → 200 with the index body.
   - `/robots.txt` returns the text file.
   - `npx serve -s dist` only proves serve's own rewrite, so it is a weaker check.
5. Optional `public/_headers` (Medium) for `/*`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: geolocation=(), microphone=()`. No CSP (Figma Make `customScripts` / GA slots make it brittle). Cut this first if scope is tight.

**Risks**
- With SPA fallback, a missing `/assets/*.js` chunk returns `index.html` with status 200, so tabs open across a redeploy fail with a MIME error instead of a 404; a reload fixes it. Acceptable.
- Prod hash URLs (`<hash>.<project>.pages.dev`) carry the prod env, but Supabase rejects them as redirect targets and falls back to the Site URL: safe, but a login started there lands on the main URL.
- Preview URLs are public, but they run local mode with demo data only.
- The Cloudflare dashboard now pushes Workers first. The README must say "Workers & Pages → Create → **Pages** tab → Connect to Git".
- pnpm 10 blocks dependency build scripts; local builds pass, so this is likely fine. Confirm in the first Pages build log.
- `.node-version` and mise can drift; note in the README that Pages reads `.node-version`.

**Open questions (defaults)**
1. Drop `_redirects` and rely on Pages' default SPA mode? **Yes**, documented in the README.
2. Build command `pnpm build`, or install + build? **`pnpm build`**.
3. Include `public/_headers`? **Yes**: four headers, no CSP.
4. Add `.node-version` / `_headers` to High in `risk-tiers.yml`? **No**: editing that file is High and out of scope; raise a follow-up.
5. Pages project name? **`tudocuatui`** → `tudocuatui.pages.dev`; Ming copies the real URL into Supabase.
