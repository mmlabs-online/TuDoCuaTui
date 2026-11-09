## Attempt 1 — 2026-11-08
Verdict: PASS

### Checks (run by reviewer)
Run in the F-007 worktree with `npx --yes pnpm@10.34.3`, against `origin/main...HEAD` (head `c2ac3a0`).
- typecheck: exit 0 (`tsc --noEmit`, no output)
- format:check: exit 0, "All matched files use the correct format." (32 files)
- test: exit 0, 5 files / 74 tests passed
- test:coverage: exit 0, statements 27.61% (66/239), branches 51.4%, functions 42.42%, lines 29.23% (57/195)
- build: exit 0; `dist/` = `index.html`, `robots.txt`, `favicon.png`, `assets/` (`index-BjeA0vVW.js`, `index-BNKAy4fS.css`); no `dist/404.html`
- These match the numbers in impl-log.md.

### Acceptance criteria
- [x] AC1: the build output serves deep links from `index.html` under Pages routing, with no `_redirects` (approved scope change 1). Evidence: I ran `npx --yes wrangler@4 pages dev dist --port 8788` myself:
  - `/` → `HTTP/1.1 200 OK`, body contains `id="root"`
  - `/any/deep/link` → `HTTP/1.1 200 OK`; `diff` against the `/` body shows they are identical
  - `/robots.txt` → 200, `Content-Type: text/plain; charset=utf-8`, body `Disallow: /`
  - `curl -I /assets/index-BjeA0vVW.js` → 200, `Content-Type: application/javascript`
  - `dist/404.html` is absent.
  - Cleanup: I killed the wrangler process tree (`taskkill /F /T`, which also ended both `workerd.exe`). Port 8788 is no longer listening, no workerd is left running, and `.wrangler/` is deleted. No wrangler or workerd was running before my check.
- [x] AC2: README "Deploy (Cloudflare Pages)" lists every dashboard step. Evidence: README.md:36–71. Checked item by item against plan Approach step 3:
  - prerequisite M-1 (:41)
  - Pages tab, not Workers; Connect to Git; repo (:42–43)
  - project `tudocuatui`, branch `main` (:44)
  - preset None, `pnpm build`, `dist`, `/`, plus the install fallback (:45–51)
  - `NODE_VERSION`=`22` and `PNPM_VERSION`=`10.34.3` in both environments (:53)
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` Production only, anon key only (:55–57)
  - never `FIGMA_PUBLIC_URL` (:58)
  - Retry deployment (:59–60); copy the real URL (:61)
  - exact Redirect URL, no wildcards, no preview or hash URLs, trailing-slash fallback (:62–65)
  - phone and preview checks (:66–67); why there is no `_redirects`, and what is not used (:69–71)
  - Values are names only. The redirect URL matches `src/features/auth/AuthGate.tsx:46` (`origin + pathname` → `https://<project>.pages.dev/`).
- [x] AC2, consistency with T-004 / D17: the plan's "Site URL = pages.dev" was changed to "Site URL stays stoktok's; add to Redirect URLs on the **stoktok** project". This follows D17, which postdates the plan, and impl-log.md explains it. "Set up Supabase" step 3 (README.md:25–26) now adds only `http://localhost:8443` and links to Deploy. The rest of the T-004 text is unchanged and consistent: dashboard-only, no `db push`/`link`, `gen types --local`. The anchors `#deploy-cloudflare-pages` and `#set-up-supabase-one-time` match the headings.
- [x] AC3: nothing contains env values. Evidence: grepping `git diff origin/main...HEAD` for `eyJ|supabase\.co|sb_(publishable|secret)_|VITE_SUPABASE_* =` hits only the plan's and impl-log's own instruction text. The plan's `git grep` finds no new hits; the old hits are a pnpm-lock integrity hash and older ticket docs. No `.env*` file is in the diff. The branch commits exist, so the gitleaks hook ran on commit; I did not re-run it.
- [x] AC4: checks are green (see above).
- [x] AC5: `.node-version` = `22`, which matches `.mise.toml` `node = "22"` and `.github/workflows/ci.yml:24` `node-version: 22`. `PNPM_VERSION` 10.34.3 matches `package.json` `packageManager` and `.mise.toml`.

**Ming verification after merge (M-4, not verified here; carry into the PR):**
- The Pages production build succeeds, and the log shows Node 22, pnpm 10.34.3 and an install step with no blocked build scripts.
- On a phone, the magic-link login works on `https://<project>.pages.dev/`.
- A PR preview opens in local mode: demo items, no login.
- Optional: a deep link such as `/x` loads the app.

**Scope:** changed files are `.node-version`, `README.md` and the ticket's own files (`plan.md`, `impl-log.md`, `consult-software-architect.md`, `ticket.md`). All are in the plan. Ming approved the scope changes: no `public/_redirects`, `pnpm build`, version variables in the dashboard.

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1/D5: previews get no `VITE_SUPABASE_*`, so `src/lib/supabase.ts` yields `null` and the app runs in local mode. No `src/**` change.
- R3: names only; anon key only.
- R7: `_headers` and `risk-tiers.yml` are left as follow-ups.
- R10: `vite.config.ts`, `.figma/` and `AGENTS.md` are untouched.
- R2, R4, R5, R6, R8 and R9 do not apply: no schema, photos, UI or logic.

### Nits (do not block)
- `work/tickets/F-007/ticket.md:56`: the stale line "Waiting for Ming: plan approval (High tier)" is still there after the approval note. The orchestrator should remove it when it updates the ticket.
- README.md:66–67 (from security-review.md 🟡1): add "Log in only on `https://<project>.pages.dev/`, never on a per-deployment `<hash>.<project>.pages.dev` URL". A hash URL is not in the allowlist, so the token would fall back to stoktok's Site URL. That is confusing but not a leak.
- README.md:56 (from security-review.md 🟡2): add the new key names: "anon / publishable (`sb_publishable_…`) only; never service_role or secret (`sb_secret_…`)".
- README step 3 says "Auth → URL Configuration"; Deploy step 8 says "Authentication → URL Configuration". The wording differs but the place is the same.

### Follow-ups (out of scope)
- `public/_headers` (nosniff, Referrer-Policy, X-Frame-Options: DENY, Permissions-Policy, no CSP), from consult Rec 5.
- `.github/risk-tiers.yml`: add `.node-version` (and `public/_headers` once it exists) to High. This is a High-tier edit; Ming reviews it (D10).
- The plan's follow-up about `gen types --linked` is already resolved: README.md:30–33 uses `--local` after T-004. Do not file it.
