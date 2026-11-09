Status: READY

# Plan — F-007: Deploy to production with per-PR previews

## Security summary
- **No values in the repo.** The diff adds a Node version file and README text only. Env vars and secrets are written
  **by name only** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); placeholders like `<project>` are used, never a real
  URL or key. The gitleaks hook runs on every commit; AC3 adds an explicit grep.
- **Previews cannot touch real data (D5).** The README tells Ming to set `VITE_SUPABASE_*` in the **Production**
  variable set only. Preview builds get no Supabase vars → local mode (localStorage + demo items, no login).
- **Only the anon key reaches the browser (R3).** Nothing else is added to any `VITE_*` variable. `PNPM_VERSION` and
  `NODE_VERSION` are plain build settings, not secrets.
- **Exact redirect URLs, no wildcard.** Supabase Redirect URLs get `https://<project>.pages.dev/` exactly (plus the
  existing `http://localhost:8443` entry). Production hash URLs (`<hash>.<project>.pages.dev`) are rejected by Supabase and
  fall back to the Site URL, so they cannot receive a login token.
- **Accepted risks:** preview URLs are public, but they serve demo data only. `site.json` keeps `robots.index:false`,
  so the build emits a disallow-all `robots.txt` and a noindex meta tag.
- **No auth code changes.** `src/features/auth/**` and `src/lib/supabase.ts` are untouched.

## Changes vs ticket scope
Ming delegated decisions (ticket notes, 2026-11-07), but this ticket has a plan-approval gate, so each change is listed
here for a conscious "yes".
1. **Drop `public/_redirects`.** Ticket scope says "SPA fallback (`public/_redirects`: `/* /index.html 200`)". Why drop it:
   - Cloudflare Pages already serves `index.html` for unknown paths when the build has no top-level `404.html`.
     `dist/` has no `404.html`.
   - Pages and wrangler treat `/* /index.html 200` as a likely infinite loop and may ignore it, so the file adds nothing.
   - The app has no client router. The only route is `/`, and magic links return to `origin + pathname`.
   - It is one fewer High-tier file (`public/_redirects` is High in `.github/risk-tiers.yml`).

   **Effect on AC1:** "`pnpm build` output plus `_redirects` serves deep links" becomes "`pnpm build` output (no
   `_redirects`) serves deep links from `index.html` under `wrangler pages dev`". The README records why there is no
   `_redirects`. **Contingency:** if the wrangler check returns 404 for a deep link, the implementer adds
   `public/_redirects` exactly as the ticket wrote it and records this in `impl-log.md`.
2. **Build command `pnpm build`, not `pnpm install --frozen-lockfile && pnpm build`.** Pages build image v3 detects
   `pnpm-lock.yaml` and installs dependencies itself, so the explicit install would run a second time. Both work. If the
   first Pages build log shows the install step was skipped, Ming switches to the ticket's original command (the README
   says so).
3. **`PNPM_VERSION` and `NODE_VERSION` as plain variables in both environments, plus `.node-version`.** The ticket names
   only `.node-version`. It is unclear whether Pages honours `packageManager` through corepack, so `PNPM_VERSION=10.34.3`
   pins pnpm. `NODE_VERSION=22` duplicates `.node-version` on purpose. These are dashboard steps for Ming, not repo
   changes.
4. **Not adopted: `public/_headers`** (from the consult, optional). It is not in the ticket or the feature list
   (planner rule 1, R7). It is a follow-up.

## Feature summary
`docs/feature-list.md` F-007:
> - Deploy to Vercel or Cloudflare Pages (owner decides); preview deploy per PR; env vars configured.
> - Add the production URL to the Supabase redirect URLs.
> - **AC:** the prod URL works with magic-link login on a phone.

`work/decisions.md`:
> D5 — **Cloudflare Pages** with Git integration. Only the production environment gets `VITE_SUPABASE_*`; previews run in local mode.

> D12 — Tickets contain agent work only. Steps only Ming can do are `M-n` items in `work/ming-todo.md`.

`work/ming-todo.md` M-4 (after F-007 is merged):
> follow README → "Deploy": connect the repo, set the production-only env vars `VITE_SUPABASE_URL` /
> `VITE_SUPABASE_ANON_KEY`, add the production URL to the Supabase Redirect URLs, then log in on a phone with a magic link.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `pnpm build` output serves deep links from `index.html` under Pages routing, with no `_redirects` (see "Changes vs ticket scope" 1). | `npx pnpm@10.34.3 build`, then start `npx --yes wrangler@4 pages dev dist --port 8788` in the background. Checks: `curl -i http://localhost:8788/` → 200 with `<div id="root">`. `curl -i http://localhost:8788/any/deep/link` → 200 with a body identical to `/` (compare with `diff`). `curl -i http://localhost:8788/robots.txt` → 200, text body containing `Disallow`. `curl -I` on one real `/assets/*.js` file from `dist/assets/` → 200 with a JavaScript content type. `dist/404.html` does not exist. **Stop the wrangler process afterwards.** The implementer pastes the commands and the status lines into `impl-log.md`. Fallback only if wrangler cannot run on Windows: record the error, run `npx --yes serve -s dist` with the same curl checks, and mark this as **weaker evidence**, because it proves serve's rewrite and not Pages routing. |
| 2 | The README "Deploy" section lists every dashboard step: project, build command, output dir, Node version, production-only env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and the Supabase redirect URL. | Read `README.md` → "Deploy" and check it against the step list in Approach step 3, item by item: every bullet is present, in order, with the exact values (`pnpm build`, `dist`, `/`, `22`, `10.34.3`, names only). |
| 3 | Nothing in the repo contains env values. | `git diff main...HEAD` contains no `supabase.co` host, no `eyJ` JWT prefix, no `sb_publishable_` / `sb_secret_` key, and no `=` assignment after a `VITE_SUPABASE_*` name. Run `git grep -nE "eyJ[A-Za-z0-9_-]{10,}\|[a-z0-9]{20}\.supabase\.co\|sb_(publishable\|secret)_"`: no new hits. The gitleaks pre-commit hook passed. No `.env*` file is in the diff. |
| 4 | Checks are green. | `npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build`: all exit 0. |
| 5 | `.node-version` matches the toolchain pin. | The file contains `22`, matching `.mise.toml` `node = "22"` and CI `node-version: 22`. |

## Ming verification after merge
M-4 in `work/ming-todo.md` (no new M-item is needed):
- The Pages production deployment succeeds. The build log shows Node 22 and pnpm 10.34.3, and pnpm did not block a needed
  dependency build script.
- On a phone, `https://<project>.pages.dev/` shows the login screen. A magic link sent from there opens the app logged in.
- A PR preview URL opens in local mode: demo items, no login screen.
- Optional: a deep link such as `https://<project>.pages.dev/x` loads the app.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `.node-version` | New, content `22` plus a newline. | Pages v3 reads it to pick the Node version (ticket technical notes). |
| `README.md` | Add a "Deploy (Cloudflare Pages)" section after "Set up Supabase". In "Set up Supabase" step 3, replace "add your dev and prod URLs" with the localhost entry plus a link to "Deploy" for the prod URL. | AC2. This is Ming's M-4 runbook. |

No file is created under `public/`. `vite.config.ts`, `.github/risk-tiers.yml`, `src/**` and `.mise.toml` are not touched.

## Tests to write
None. The diff adds no logic (a version file and docs). AC1 is verified with the wrangler/curl commands above, and the
existing test suite must stay green (R8).

## Approach
1. **Verify the fallback first (AC1).** Run `npx pnpm@10.34.3 install --frozen-lockfile` if needed, then
   `npx pnpm@10.34.3 build`. Confirm there is no `dist/404.html`. Run the wrangler checks from the AC table, then stop the
   wrangler process (kill the background job and confirm port 8788 is free). Use the contingency only if a deep link
   returns 404 (see "Changes vs ticket scope" 1). Never read `.env*`. Whether the local build ran in local or Supabase
   mode does not matter for routing.
2. **Add `.node-version`** with `22`.
3. **Write README → "Deploy (Cloudflare Pages)"**. It is short, numbered and English, uses names only, and never values.
   1. *Prerequisite:* M-1 is done (the hosted Supabase project exists).
   2. Cloudflare dashboard → **Workers & Pages** → **Create** → the **Pages** tab (not Workers) → **Connect to Git** →
      authorise GitHub → pick `mmlabs-online/TuDoCuaTui`.
   3. Project name `tudocuatui`. Production branch `main`.
   4. Build settings:
      - Framework preset **None**
      - Build command `pnpm build`
      - Build output directory `dist`
      - Root directory `/`
      - Note: Pages installs dependencies from `pnpm-lock.yaml` itself. If the build log shows no install step, use
        `pnpm install --frozen-lockfile && pnpm build`.
   5. Environment variables, as plain text:
      - **Production and Preview:** `NODE_VERSION` = `22`, `PNPM_VERSION` = `10.34.3`. These must match `.node-version`,
        `.mise.toml` and `package.json` → `packageManager`. Pages reads `.node-version`, not mise.
      - **Production only:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Copy them from Supabase → Project Settings →
        API, and use the anon/publishable key only, never the service role key (R3). Mark the anon key as encrypted if
        you like. Never add them to Preview: previews must stay in local mode (D5).
      - Never set `FIGMA_PUBLIC_URL`, because it changes Vite's `base`.
   6. Save and deploy. Because `VITE_*` values are baked in at build time, any later change to them needs
      Deployments → latest production → **Retry deployment**. This also applies if the variables were added after the
      first build.
   7. Copy the real production URL from the project page. It may be `tudocuatui-xxx.pages.dev` if the name was taken.
   8. Supabase → Authentication → URL Configuration:
      - **Site URL** = `https://<project>.pages.dev`
      - **Redirect URLs**: add exactly `https://<project>.pages.dev/` and keep `http://localhost:8443`.
      - No wildcards, and no preview or hash URLs.
   9. Phone check: open the production URL, request a magic link, open it on the same phone, and confirm you are logged in.
      Open a PR's preview URL and confirm local mode (demo items, no login).
   10. "Why there is no `_redirects`": Pages serves `index.html` for unknown paths when there is no `404.html`, and the
       app has no client routes. Do not add a top-level `404.html`, because it turns this fallback off.
   11. Not used: a custom domain, a staging Supabase project, `wrangler.toml`.
4. **Run checks** (AC4) and the AC3 grep. Write `impl-log.md` with the command evidence.

Rules:
- **R1:** local mode is unchanged, and previews depend on it.
- **R3:** names only, anon key only.
- **R7:** `_headers` and `risk-tiers.yml` changes go to follow-ups, not the diff.
- **R10:** `vite.config.ts` and `.figma/` are untouched.
- R2, R4, R5, R6 and R9 do not apply (no schema, photos, derived values, UI copy or UI).

## Specialist input used
`consult-software-architect.md`:
- **Adopted**
  - Rec 1 (build settings): preset None, `pnpm build`, `dist`, root `/`, `.node-version` = `22`, `PNPM_VERSION=10.34.3`.
    It also explains the double-install reason for "Changes vs ticket scope" 2.
  - Rec 2 / Q1 (drop `_redirects`): adopted with a wrangler-verified contingency. See "Changes vs ticket scope" 1.
  - Rec 3 (Production-only `VITE_SUPABASE_*`, Retry deployment, exact Redirect URLs, copy the real subdomain).
  - Rec 4 (local check with `wrangler pages dev`; `serve -s` as weaker evidence).
  - Risks: the README says "Pages tab, not Workers", and that Pages reads `.node-version` (mise drift). Ming checks the
    pnpm build-script warning in the first build log.
  - Q2 (`pnpm build`) and Q5 (`tudocuatui`).
- **Rejected**
  - Rec 5 / Q3 (`public/_headers`): not in the ticket or the feature list (planner rule 1, R7). It becomes a follow-up.
  - Q4 (do not edit `risk-tiers.yml`): agreed, no edit. Follow-up: consider adding `.node-version` and `public/_headers`
    to High in `.github/risk-tiers.yml`. That file is itself High and was reviewed by Ming (D10).
- **Noted, no action**
  - Stale asset chunks return `index.html` with 200 after a redeploy. A reload fixes it.
  - Prod hash URLs fall back to the Site URL.

## Assumptions
- Cloudflare behaviour (v3 image, SPA fallback, variable sets, dashboard labels) is as described in the consult, which
  is based on knowledge from about mid-2026. The wrangler check covers AC1 locally. The dashboard labels are confirmed
  by Ming during M-4. If a label differs, Ming follows the meaning, and a `/solo` README fix follows.
- Supabase matches `emailRedirectTo` (`https://<project>.pages.dev/`, with a trailing slash) against the exact Redirect
  URL entry. If the phone login lands on the Site URL instead, Ming also adds the URL without the trailing slash. The
  README states this in one line.
- `oxfmt` ignores `*.md` (`.prettierignore`), so README formatting does not affect `format:check`. `.node-version` is not
  formatted.
- Hotspots: no other open ticket edits `README.md` or `.node-version` (grep of `work/tickets/*/ticket.md`). `src/App.tsx`
  is not touched.
- The dependency F-001 has been met, since the ticket was claimed for a run.
- `wrangler` is fetched with `npx` on demand and is **not** added to `package.json`.

## Blocking questions
None.

## Split proposal
None. About 60 changed lines, well within one cycle.

## Follow-ups (for the reviewer's list, not this diff)
- `public/_headers` with `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy` (no CSP), as in
  consult Rec 5.
- `.github/risk-tiers.yml`: add `.node-version` and `public/_headers` to High (a High-tier edit; Ming reviews).
- README "Set up Supabase" step 5 still says `gen types --linked`; D11 says `--local`.
