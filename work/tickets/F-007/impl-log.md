## Attempt 1 — 2026-11-08

### Files touched
| File | Required because |
|---|---|
| `.node-version` | New, content `22`; Pages reads it to pick Node (AC5; matches `.mise.toml` and CI). |
| `README.md` | New "Deploy (Cloudflare Pages)" section (AC2). "Set up Supabase" step 3 now adds only `http://localhost:8443` and links to Deploy for the prod URL. Deploy step 8 targets the shared **stoktok** project (Auth → URL Configuration), exact URL with no wildcard, Site URL unchanged (D17); prerequisite points to M-1. T-004's other text is untouched. |

### Tests added / changed
- None (plan: no logic added).

### Checks (actual output summary)
Run with `npx pnpm@10.34.3`.
- typecheck: exit 0 (`tsc --noEmit`)
- format:check: exit 0, "All matched files use the correct format."
- test: exit 0, 5 files / 74 tests passed
- test:coverage: exit 0, statements 27.61%, lines 29.23%
- build: exit 0, `dist/` has index.html, robots.txt, favicon.png, assets/; no `dist/404.html`
- AC3 grep over `git diff` (JWT prefix, `supabase.co`, `sb_publishable_`/`sb_secret_`, `VITE_SUPABASE_* =`): no hits. No `.env*` in the diff.

AC1 evidence (`npx --yes wrangler@4 pages dev dist --port 8788`, no `_redirects`, no `public/` change):
- `curl -i /` -> `HTTP/1.1 200 OK`, body contains `id="root"`
- `curl -i /any/deep/link` -> `HTTP/1.1 200 OK`; `diff` of body vs `/` -> identical
- `curl -i /robots.txt` -> 200, `Content-Type: text/plain; charset=utf-8`, body has `Disallow: /`
- `curl -I /assets/index-BjeA0vVW.js` -> 200, `Content-Type: application/javascript`
- Contingency (`_redirects`) not needed. Wrangler stopped afterwards (process tree killed; port 8788 free, no workerd left; local `.wrangler/` deleted).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `public/_headers` (nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy) and adding `.node-version` / `_headers` to High in `.github/risk-tiers.yml`.
- README "Set up Supabase" step 5 still says `gen types --linked`; D11 says `--local` (it already says `--local` after T-004, so likely resolved).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: README +39 / -2, `.node-version` +1.
