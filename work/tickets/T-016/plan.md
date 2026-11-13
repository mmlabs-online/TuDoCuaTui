Status: READY

# Plan — T-016: Remove Supabase from the app

Gate: **plan-approval** (High tier: `release.yml`, `Dockerfile`, `check-image.sh`, auth code removal, `supabase/migrations/**`
deletion). **Approved by Ming on 2026-11-13, with A1–A6 at their defaults** (ticket.md, *Notes / answers from Ming*). The approval
covers this refresh because it adds no scope and needs no new High-tier decision. See "Refresh 2026-11-13" below.

## Refresh 2026-11-13 (re-checked against `main` after T-005.1/.2/.3/.5/.6, T-017, T-018, F-601.3, T-001, F-004.3, F-201)
- **`src/data/photos.ts` is kept (change from the 2026-11-11 plan).** `src/data/repo.http.ts:5` now imports
  `resizeImage`/`urlToBlob` for Drive uploads (T-005.2). Only the import in `repo.ts` goes. The `photos.ts` coverage exclude and
  the `vi.mock("./photos")` in `useWardrobe.test.tsx` stay. README keeps the `photos.ts` row. Consult R-A is adjusted.
- **Row types follow T-017 (D29).** `mappers.ts` already has `CategoryId` (10 ids). `ItemInsert.category` becomes `CategoryId`,
  and the cast plus its "Supabase's generated enum type predates D29" comment (`mappers.ts:136–137`) go. `ItemRow.category` is
  `string | null`, because the DB enum still holds the retired `bag`/`sport`/`home` (`20261112140000_item_category_v2.sql`)
  and `toCategoryLabel` maps them.
- **`src/shared/ai` now has a server mirror (T-018, D30).** `server/ai/parity.test.ts` imports `src/shared/ai/*.ts`, so A1's
  default (keep `src/shared/ai`) is now required; the alternative would break T-018. The line-1 headers use the wording from Ming's
  note of 2026-11-12. The `errors.ts:3` doc comment ("Codes returned by the Edge Function") is reworded. `boundary.test.ts` keeps
  `AI_KEK` and `ai_settings` in `FORBIDDEN`.
- **Photo semantics.** `Item.photoPath` is now the `item_photos` id in API mode (T-005.3), not unused, so A8 and the
  `types/item.ts:19,21` comments are updated. D27 records that T-005.4 (Supabase Storage removal) was folded into T-016; the
  Supabase repo deletion covers it. The archive SHA now only matters for T-010 and F-701; T-005.x is done on Drive.
- **Production context.** `v0.2.0` (Node server, API mode) is live since 2026-11-11 (M-14 ticked). The "re-deploy `v0.2.0`"
  wording is gone, and the M-14 text edits are no longer needed. Line numbers in this plan were re-checked. Fixed an AC 1 command
  that would have matched the new `FORBIDDEN` entries in `boundary.test.ts`. Added a warning that `.env.example` must not contain
  the letters "ai" (the boundary test regex is case-insensitive). `scripts/check-image.sh` gained Drive/AI checks (T-005.1, T-018),
  and T-016 does not touch them.

## Feature summary
T-016 is a `T-` ticket and is not in `docs/feature-list.md`. It implements the last step of **D23**
(`work/decisions.md`, 2026-11-10):

> TuDo moves its data from Supabase (D17) to the shared Postgres in `mmlabs-online/deployment` […], accessed only by
> a Node API in the same image as the SPA […]. **No in-app authentication for now** (single user); **Cloudflare
> Access** protects `tudocuatui.mmlabs.online` […]. Supersedes D17/D18/D19 for runtime data and auth, D21's Supabase
> storage design, D22. Work: T-011 → T-016.

Also relied on:
- **D25:** "The Supabase migrations keep the old R2 until T-016 removes them."
- **D26 A1:** "keep the `VITE_SUPABASE_*` build args (Dockerfile, release.yml) until T-016."
- **D27:** "T-005.4 superseded (folded into T-016)". T-005.4 says: "removing the bucket code is part of T-016."
- **D30:** "AI is available in **API mode only** […] The server uses JS ports of `src/shared/ai`, kept equal by
  `server/ai/parity.test.ts`."
- T-014 plan follow-up: "T-016: drop the `supabase` branch from `pickMode`/`useWardrobe`, re-home `ItemRow`/`ItemInsert`
  types, and make the fallback local-only."
- T-014 security review, items 3–4: "stop creating the client and clear `sb-*-auth-token` in T-016"; "`getAiSettingsRepo()`
  has no caller."
- Ticket note (2026-11-12, from T-018): "the line-1 header of `src/shared/ai/*.ts` should say 'mirrored by `server/ai/*.js`;
  `server/ai/parity.test.ts` enforces equality'. Keep `AI_KEK` and `ai_settings` in `boundary.test.ts` `FORBIDDEN`."

Ticket goal: "No Supabase client, auth, Storage, Edge Function or `VITE_SUPABASE_*` code remains once the API mode is
live." Ticket scope: remove `src/lib/supabase.ts`, the Supabase repo and tests, AuthGate, Supabase types, and the `supabase/`
folder; update README and the risk tiers; propose CLAUDE.md wording for Ming.
Ming (2026-11-11): "No data migration from Supabase to Postgres is needed […] Ming cuts the M-14 release himself."
The ticket line "Close/park PR #28" is out of date: PR #28 was merged on 2026-11-10 (consult R-I).

**Production context (2026-11-13).** Production runs `v0.2.0`, the Node image in API mode, deployed via
mmlabs-online/deployment#40 (M-14 ticked). Its bundle was built before T-016, so it still contains the Supabase client. T-016
must not break the next release from `main`. This plan therefore does **not** touch:
- `deploy/deployment-repo/**`
- the image runtime contract: `Cmd`, `:3000`, `/healthz`, `/readyz`, `node server/migrate.js`, the file layout, and the Drive/AI
  start checks
- `server/**` and `db/migrations/**`
- the `release.env` part of `release.yml`

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "`grep -ri supabase src` returns only intentional references (none in runtime code)." | `grep -rli supabase src` lists only three files: `src/lib/legacySession.ts` (one comment explaining the `sb-*` keys), `src/lib/legacySession.test.ts`, and `src/shared/ai/boundary.test.ts` (the `FORBIDDEN` list). `grep -rln "VITE_SUPABASE\|@supabase/" src package.json vitest.config.ts tsconfig.json Dockerfile .github scripts` lists only `src/shared/ai/boundary.test.ts`. `test ! -e supabase && test ! -e src/types/database.ts && test ! -e src/lib/supabase.ts && test ! -d src/features/auth && test ! -e src/Root.tsx && test ! -e src/data/aiSettings.ts`. After `pnpm build`, `grep -rli supabase dist` has no hit. |
| 2 | "All checks pass" | `pnpm typecheck`, `pnpm format:check`, `pnpm test` and `pnpm build` are green. `pnpm test:coverage` meets every threshold, including `src/data/**` at 80/80/80/75, `src/shared/ai/**` and `server/ai/**`. The CI `ci` and `image` jobs are green on the PR. `pnpm-lock.yaml` has no `@supabase/*` entry. |
| 3 | "local mode … work[s]" (R1) | In `mode.test.ts`: `dev: true` → `local` with no fetch call, and a definite "no" (HTML 200, 404, invalid JSON) → `local`. The existing `App.test.tsx` suites "App (local mode)" and "App import/export (local mode)" pass unchanged. New `App.test.tsx` case: local mode shows demo items and no "Đăng xuất". Browser check (reviewer, as in T-014): run `pnpm build`, serve `dist/` with any static SPA server, and confirm demo items, no login and no "Đăng xuất"; 390px and dark mode look as before. |
| 4 | "… and API mode work" | In `mode.test.ts`: `/healthz` JSON ok → `api`, and opaqueredirect → `api`. New `App.test.tsx` case (moved from `Root.test.tsx`): `mode="api"` with a fake fetch renders the server item, with no email/password field and no "Đăng xuất". The existing "App (API mode photos)" suite and the `repo.http.test.ts` tests pass unchanged. `useWardrobe.test.tsx` api cases (below). The CI `image` job DB smoke (`/readyz` 200, `/api/locations` 401) stays green. Optional, if the reviewer has Postgres: `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start`, then add, edit, wear and delete an item in the browser. |
| 5 | Existing users' Supabase session is cleared, other storage is untouched (consult R-D, T-014 security review 3) | `legacySession.test.ts` (cases below): `sb-<ref>-auth-token` and `sb-<ref>-auth-token-code-verifier` are removed; `tu-do-items`, `tu-do-theme` and unrelated keys stay. `main.tsx` calls it before `detectMode()`, in production builds only. |
| 6 | The release and image pipeline no longer use Supabase, and the next release is not affected | `git diff main -- .github/workflows/release.yml` changes only the lines listed in the file table: the header comment, the guard env, the guard call, the `mode` output, the build args, the verify env and argument, and the PR body text. Unchanged: the trigger, the version guards, the tag reservation, the push/platform/provenance/sbom settings, digest pinning, `check-image.sh` on the digest, the "only `release.env`" guard, and the PR branch and title. `git diff --name-only main` lists nothing under `deploy/`, `server/` or `db/`, and none of `vite.config.ts`, `AGENTS.md`, `.figma/` (R10) or `CLAUDE.md`. `check-image.sh` accepts exactly one argument and has a new `== bundle` check that fails on `supabase` in `/app/dist/assets`. Every other section (secrets, Google/AI scans, config, layout, version, start checks, smoke, db smoke) is unchanged. |
| 7 | Docs and risk tiers are updated; the CLAUDE.md wording is proposed, not applied | README has no "Set up Supabase", pgTAP, Supabase-mode or `VITE_SUPABASE_*` text; `grep -ni supabase README.md` returns at most one historical sentence pointing to D23. `.github/risk-tiers.yml` lists `server/**` and `db/migrations/**`, and no `supabase/` path. The CLAUDE.md wording is in this plan (appendix) and in the impl-log for Ming; `git diff main -- CLAUDE.md` is empty. |

## Ming verification after merge
1. **The release that is live now (`v0.2.0` or later) is independent of T-016.** Its image is already built and its compose lives
   in the deployment repo; T-016 does not change either.
2. **Next release after T-016** (for example `v0.2.x`/`v0.3.0`; Ming cuts it, M-14 flow):
   - The `release` run is green.
   - The deployment PR body says "Node server, API mode".
   - After the deploy, on the phone: no login, no "Đăng xuất", the list and photos come from the server.
   - On desktop, in DevTools → Application → Local Storage: no `sb-…-auth-token` key, and `tu-do-theme` and (if present)
     `tu-do-items` are still there.
3. **New Ming items (A6).** The orchestrator adds them to `work/ming-todo.md` on `main` (D16).
   - After T-016 is merged, delete the repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (GitHub → Settings → Secrets).
     `release.yml` no longer reads them, and the already-built images do not need them.
   - In the **stoktok** Supabase project, go to Authentication → Users → your user and sign out all sessions (or rotate the
     password). This revokes the refresh token that the old TuDo production bundle stored. Clearing the browser key (AC 5) does
     not revoke it (orchestrator note on consult Q4).

## Files to create / modify
Make structured commits, in this order:
1. runtime `src/`
2. dependencies and build/CI/release/scripts
3. delete `supabase/` and its config
4. docs

Record the bundle sizes from `pnpm build`, before and after, in impl-log. Line numbers below are from `main` on 2026-11-13.

**Runtime (`src/`)**
| File | Change | Required because |
|---|---|---|
| `src/lib/supabase.ts` | delete | AC 1 (client creation, `PHOTO_BUCKET`) |
| `src/types/database.ts` | delete | AC 1 (generated Supabase types) |
| `src/features/auth/AuthGate.tsx`, `authMessages.ts`, `AuthGate.test.tsx`, `authMessages.test.ts` | delete | AC 1; no in-app login (D23) |
| `src/Root.tsx`, `src/Root.test.tsx` | delete | Its only job was the AuthGate switch (consult R-C). The api and local cases move to `App.test.tsx`. |
| `src/data/aiSettings.ts`, `src/data/aiSettings.test.ts` | delete | Supabase-only (`functions.invoke("tudo-ai-settings")`) with no caller (consult R-B, T-014 security review 3). T-010 builds the API client against `server/ai` (D30). |
| `src/data/repo.supabase.test.ts`, `src/test/fakeSupabase.ts` | delete | They test removed code |
| `src/shared/ai/mirror.test.ts` | delete | Its mirror, `supabase/functions/_shared/ai`, is deleted. `server/ai/parity.test.ts` (T-018) already replaces it. |
| `src/data/repo.ts` | modify | Delete the Supabase section (lines 104–295) and the imports on lines 1, 2, 5 and 7 (`SupabaseClient`, `Database`, `PHOTO_BUCKET`, `./photos`). Drop `itemToRow`/`rowToItem` from the line-6 import if unused, keeping `toCategoryLabel`. Line 15: `mode: "local" \| "api"`. Line 26 comment: "Local mode — localStorage, demo data. Used when the Node API is not reachable (`pnpm dev`, Figma Make preview)." |
| `src/data/mappers.ts` | modify | Replace the `Database` import and the `Enums`/`ItemRow`/`ItemInsert` aliases (lines 1, 4–6) with hand-written, exported types (Approach 2). Type `STATUS_TO_DB` as `Record<Status, DbStatus>` and `SEASON_TO_DB` as `Record<string, DbSeason>`. In `itemToRow`, delete the comment and the cast on lines 136–137 (`CATEGORY_TO_DB[…]` is already a `CategoryId`). |
| `src/data/mode.ts` | modify | `DataMode = "local" \| "api"`; `pickMode(apiAvailable)`; drop `hasSupabase` (lines 39, 44, 48, 51) and the import on line 1. Comments on lines 5 and 17 lose the Supabase wording. |
| `src/data/useWardrobe.ts` | modify | Default mode `"local"` (line 29). The repo is `createHttpRepo()` for `api`, otherwise the local repo. Remove `signOut` (lines 120–122, 135), the imports on lines 2 and 7 (`supabase`, `createSupabaseRepo`), and the `23505`/`42501` branches in `message` (lines 15–17). Update the doc comment (lines 21–25). |
| `src/lib/legacySession.ts` | create | `clearLegacyAuthKeys(storage?)` (Approach 4) |
| `src/main.tsx` | modify | Render `<App mode={mode} />` instead of `<Root>`. Call `clearLegacyAuthKeys()` before `detectMode()` when `import.meta.env.PROD`. |
| `src/App.tsx` | modify | Remove `showSignOut` and `onSignOut` from `<Header>` (lines 95–96) |
| `src/features/layout/Header.tsx` | modify | Remove the `showSignOut`/`onSignOut` props (lines 8–9, 17–18) and the button (lines 38–42) |
| `src/types/item.ts` | modify | Comments only. Line 19: "Displayable URL: `/api/photos/<id>` (API mode), a data:/blob: URL of a fresh upload, a demo/external URL (local mode), or """. Line 21: "API mode: `item_photos` id of the primary photo." |
| `src/shared/ai/{catalog,errors,validate,mask}.ts` | modify | Line 1 only: "// Source of truth: src/shared/ai; mirrored by server/ai/*.js; server/ai/parity.test.ts enforces equality." (ticket note 2026-11-12, A1). Also `errors.ts` line 3: "/** Codes returned by the AI settings routes (server/ai), with their HTTP status. */". No other change. |

**Tests**
| File | Change | Required because |
|---|---|---|
| `src/data/mode.test.ts` | modify | Two-mode matrix (see Tests to write). Drop `hasSupabase` from `detect` (lines 14–15) and from the calls on lines 29–30, 36, 42–46, 72 and 86. |
| `src/data/useWardrobe.test.tsx` | modify | Drop the Supabase imports and mocks (lines 1, 4–5, 9–16, 47–49, and `h.client = null` on line 59). Drop the `signOut does nothing` test (204–207) and the `supabase mode` block (218–284). Keep the `vi.mock("./photos")` on line 17. Add the api cases and update the `message` test (210–216). |
| `src/data/mappers.test.ts` | modify | Lines 2 and 21: import `type ItemRow` from `./mappers` instead of deriving it from `Database`. Keep the casts and cases. |
| `src/data/repo.local.test.ts` | modify | Remove the `vi.mock("./photos", …)` on line 6, because `repo.ts` no longer imports `./photos`. |
| `src/App.test.tsx` | modify (additive) | Two cases moved from `Root.test.tsx` (see Tests to write) |
| `src/lib/legacySession.test.ts` | create | AC 5 |
| `src/test/env.test.ts` | modify | Drop the "supabase is null" test (lines 8–10) and its import (line 2). Keep the TZ test. |
| `src/shared/ai/boundary.test.ts` | modify | Remove the `database.ts` exclusion (line 30). Append `"@supabase/"` and `"VITE_SUPABASE"` to `FORBIDDEN`, and keep every existing entry, including `AI_KEK` and `ai_settings`. This is the regression guard for AC 1. |
| `src/features/import-export/csv/serialize.test.ts` | modify | Line 147 test name: "keeps a date-only value (API mode)" |

**Dependencies, config, build, CI, release, scripts**
| File | Change | Required because |
|---|---|---|
| `package.json` | modify | Remove `@supabase/supabase-js` (line 19) and the `db:types` script (line 16, and the trailing comma on line 15) |
| `pnpm-lock.yaml` | regenerate | Run `pnpm install` after the dependency removal. Generated, so not counted as scope. |
| `tsconfig.json` | modify | Remove the two `supabase/functions/_shared/*` includes (lines 24–25) |
| `vitest.config.ts` | modify | Line 21–22 `env`: keep only `VITE_APP_VERSION: ""` and drop the Supabase-specific comment. Remove `src/features/auth/authMessages.ts` (lines 32 and 51) and `supabase/functions/_shared/core/**` (lines 38 and 57). Add `src/lib/legacySession.ts` to `include` and `thresholds`. **Keep** the `src/data/photos.ts` exclude (line 42) and every `server/**` and `scripts/**` entry. |
| `.env.example` | modify | Replace the three Supabase lines with one comment line: "# The browser build needs no variables. Server env (DATABASE_URL, CF_ACCESS_*) is documented in server/README.md; never put a secret in a VITE_* variable (R3)." Keep the file, because `boundary.test.ts` reads it. **The text must not contain "ai" in any case** (that test checks `/AI\|KEK\|ANTHROPIC\|GEMINI/i`), so avoid words such as "contain", "main", "explain", "again". |
| `.gitignore` | modify | Remove line 24 (`/supabase/migrations/20200101000000_sim_…`) |
| `.dockerignore` | modify | Remove the `supabase` line (line 10) |
| `Dockerfile` | modify | Remove the header line 5 and `ARG VITE_SUPABASE_URL=` / `ARG VITE_SUPABASE_ANON_KEY=` (lines 17–18). Nothing else. |
| `.github/workflows/release.yml` | modify | **Header:** drop line 8 and lines 14–16, and add "T-016: no Supabase; the browser build takes only VITE_APP_VERSION." **Guard step:** drop the env lines 52–53, the comment on line 79, the `check-public-supabase-env.sh` call (80) and the `mode` lines (81–82). **Build args (110–111):** only `VITE_APP_VERSION`. **Verify step:** drop the `SUPABASE_URL` env (123) and call `bash scripts/check-image.sh "$ref"` (128). **PR step:** drop `MODE` (134); the body text (158) becomes "(Node server, API mode; deploy runs backup + migrate; …)". |
| `.github/workflows/ci.yml` | modify | `ci` job: remove the `check-public-supabase-env.test.sh` step (line 49). `image` job: rewrite the header comment (lines 51–53), rename the second build (line 78) to `build (release version)`, tag it `tudocuatui:ci-version`, and pass only `VITE_APP_VERSION=v0.0.0` as a build arg. The second check (line 93) becomes `bash scripts/check-image.sh tudocuatui:ci-version` with `EXPECTED_VERSION: v0.0.0`. |
| `scripts/check-image.sh` | modify | Usage: exactly one argument (lines 3–5 header, 11–16; drop `EXPECTED_URL`). Replace `== bundle mode` (lines 79–88) with `== bundle`, which fails (`::error::Supabase code in the bundle`) when `grep -rqi supabase $ROOT/assets` matches. Keep the `sb_secret_` scan and every other section unchanged, including the Google/AI checks and the db smoke. |
| `scripts/check-public-supabase-env.sh`, `scripts/check-public-supabase-env.test.sh`, `scripts/test-db-shared.sh` | delete | Supabase-only |
| `supabase/` (the whole folder: `config.toml`, `.gitignore`, `migrations/`, `tests/`, `functions/` including `_shared/{ai,core,deno}` and `tudo-ai-settings/`) | delete | AC 1, D25, consult R-A. Its `*.test.ts` files go with it. |

**Docs and workflow config**
| File | Change | Required because |
|---|---|---|
| `README.md` | modify | **Line 3 intro:** Node API + self-hosted Postgres, photos on Google Drive via the server, Cloudflare Access, and local mode outside the server. **"Run locally" (lines 7–15):** drop the `cp .env.example` line; two modes only: local, and API when served by `node server/index.js`. **Delete** "Set up Supabase (one time)" (lines 17–41) and "Running DB tests" (pgTAP, lines 102–125). **"Deploy":** delete the "Supabase values" paragraph (lines 79–83) but keep its last sentence ("Never set `FIGMA_PUBLIC_URL`…") elsewhere in that section, and delete the `--build-arg VITE_SUPABASE_*` sentence (line 94). **Code map:** `repo.ts` = `WardrobeRepo` + the local repo; add `src/data/repo.http.ts` (API repo), `server/` and `db/migrations/`; drop the rows for `database.ts`, `AuthGate.tsx`, `supabase/migrations/`, `supabase/tests/` and `check-public-supabase-env.sh`; keep the `photos.ts` row. |
| `docs/qa/smoke-test.md` | delete | It is entirely about Supabase; the live smoke is M-14 step 6. |
| `docs/data-model.md` | modify | Replace lines 3–4 with: "Backend: self-hosted Postgres behind the Node API (D23); the authoritative schema is `db/migrations/` (tables without the `tudo_` prefix, photos on Google Drive via `item_photos`, D27). Single user without login for now: no `user_id`/RLS until in-app auth arrives (D25). The diagram below is the Supabase-era design and is kept as history." Leave the rest unchanged; a full rewrite is a follow-up. |
| `docs/feature-list.md`, `docs/plan-M1.md` | modify | Add one note under the title of each: "Backend superseded by D23 (2026-11-10): Supabase was removed in T-016; mentions of Supabase, Auth, RLS and Storage below are historical and are re-planned on the Node backend." |
| `.github/risk-tiers.yml` | modify | Replace the four Supabase entries (lines 7–14) and `scripts/check-public-supabase-env*.sh` (line 23) with `db/migrations/**` (DB migrations) and `server/**` (API, Access JWT check, DB access, Drive and AI secrets). Keep everything else. |
| `.claude/commands/run.md` | modify (A3) | Line 46 trigger list: replace `supabase/`, `src/features/auth/` and `src/lib/supabase.ts` with `server/`, `db/migrations/`, `Dockerfile`, `scripts/check-image.sh` and `deploy/`. Keep `src/data/repo.ts`, `**/*.sql`, `.env.example`, `vite.config.ts`, `public/_redirects` and `.github/workflows/`, and add `src/data/repo.http.ts`. Do not change line 94. |
| `.claude/commands/solo.md` | modify (A3) | Line 9: `supabase/migrations/`, `src/features/auth/` → `db/migrations/`, `server/` |

**Not touched:**
- Off-limits or owned by others: `deploy/**`, `server/**` (including the `server/ai/crypto.js:3` comment that names the deleted `crypto.ts`; it stays as history and the archive SHA locates it), `db/**`, `vite.config.ts`, `AGENTS.md`, `.figma/` (R10), and `CLAUDE.md` (Ming).
- Left for follow-ups or the orchestrator: `.claude/agents/*` (follow-up), and `work/backlog.md`, `work/ming-todo.md`, `work/decisions.md` (the orchestrator edits these on `main`, D16).
- Not needed for this ticket: `src/data/repo.http.ts` (hardening is a follow-up), `src/data/photos.ts`, `src/index.css`, and `src/components/Icon.tsx` (the unused `logout` icon stays; it is harmless).

**Size.** Non-test additions and changes come to about 230–290 lines:

| Area | Lines |
|---|---|
| mappers types | ~30 |
| mode, useWardrobe, main, App, Header | ~30 |
| legacySession | ~20 |
| release, ci, check-image, Dockerfile | ~45 |
| package, tsconfig, vitest, `.env.example`, ignores | ~15 |
| README | ~70 |
| other docs | ~10 |
| risk tiers | ~8 |
| run.md, solo.md | ~4 |
| shared/ai headers and `item.ts` comments | ~7 |

Everything else is deletion (about 4,000+ lines, including `supabase/`, `database.ts`, the Supabase repo and its tests). This fits one cycle, so no split (consult R-K).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `legacySession.test.ts › removes sb-<ref>-auth-token and sb-<ref>-auth-token-code-verifier` | AC 5 |
| `› keeps tu-do-items, tu-do-theme and unrelated keys (sb-x, my-sb-a-auth-token, sb-a-auth-token-extra)` | AC 5, consult Risk 3 |
| `› removes every matching key when several exist (keys collected before removal) and returns the count` | iteration while removing |
| `› does not throw when storage throws (key/removeItem/length) and returns 0` | private mode / sandboxed iframe |
| `mode.test.ts › pickMode: true → api, false → local` | the two-mode set |
| `› dev never calls fetch → local` | R1, Figma Make / `pnpm dev` |
| `› api only for 200 + JSON + status ok; GETs /healthz no-store, redirect manual` | kept |
| `› opaqueredirect → api` | kept (T-014 security fix) |
| `› no false positive (html 200, 404, json without ok, invalid json) → local, no retry` | kept |
| `› retries once after a network error → api` | kept |
| `› falls back to local after two network errors` | changed: was `supabase` (consult Risk 1, A2) |
| `› aborts after the timeout → local` | kept |
| `useWardrobe.test.tsx › default mode is local` (the existing local suite, unchanged apart from the removed mocks) | R1 |
| `› api mode: loads through the HTTP repo and reports mode api` | kept |
| `› api mode: a load error (fake 503 db_unavailable) shows the ApiError message and loading ends` | replaces the Supabase "load error" case (`API_ERROR_COPY.db_unavailable`) |
| `› api mode: importMany continues after a failed row (400 invalid_input) and keeps saved rows in state` | replaces the Supabase importMany case |
| `› message returns Error messages and the generic text for unknown values` | updated (`23505`/`42501` removed) |
| `› the hook result has no signOut` | removal |
| `App.test.tsx › api mode: items load from /api, no login field, no "Đăng xuất"` | moved from `Root.test.tsx` (AC 4); assert there is no `input[type=email]` / `input[type=password]` |
| `› local mode: demo items, no "Đăng xuất"` | moved from `Root.test.tsx` (AC 3) |
| `boundary.test.ts › no client source names a server-only secret or table` (now also `@supabase/`, `VITE_SUPABASE`; the `database.ts` exclusion removed) | AC 1 regression guard |
| `scripts/check-image.sh` `== bundle` (CI `image` job, both builds) | AC 6, no Supabase in the shipped bundle |

`mappers.test.ts` keeps all its cases; only the type import changes. `repo.http.test.ts`, `server/ai/parity.test.ts` and the
"App (API mode photos)" suite must pass unchanged. Coverage for `src/data/**` must stay at or above its thresholds.

## Approach
1. **Baseline.** On a clean tree, run `pnpm build` and record the asset sizes (raw and gzip) in impl-log. Also record
   `git rev-parse origin/main` as "Supabase code archive: `<sha>`" (consult R-A).
2. **Row types in `src/data/mappers.ts`** (consult R-C, T-014 A7, T-017/D29):
   ```ts
   export type DbStatus = "active" | "stored" | "laundry" | "lent" | "out";
   export type DbSeason = "spring" | "summer" | "autumn" | "winter";
   /** Wire shape of an items_with_stats row from the API (server/items.js toItemRow). Nullable as in the view.
    *  category is a string: the DB enum still holds retired ids (bag, sport, home) that toCategoryLabel maps. */
   export type ItemRow = { id, name: string | null; category: string | null; status: DbStatus | null;
     brand, size, material, purchase_date, location_id, notes, created_at, updated_at, last_worn, location_name,
     primary_photo_path: string | null; price, wear_count: number | null; colors, tags, seasons: string[] | null };
   /** Body fields itemToRow produces (repo.http.ts drops id/location_id and adds location_name). */
   export type ItemInsert = { id?: string; name: string; category: CategoryId; status: DbStatus;
     brand, size, material, purchase_date, notes: string | null; price: number | null; location_id: string | null;
     colors, tags: string[]; seasons: DbSeason[] };
   ```
   This is a sketch; the implementer writes it out in oxfmt formatting.
   - `CategoryId` already exists in the file.
   - `rowToItem`/`itemToRow` bodies do not change, apart from removing the line-136 comment and the line-137 cast.
   - `repo.http.ts` keeps `Parameters<typeof rowToItem>[0] & { primary_photo_id?: … }` and needs no edit.
   - `typecheck` proves the types match what the mappers already read and write.
3. **Modes** (consult R-C).
   - `mode.ts`:
     - `export type DataMode = "local" | "api"`
     - `pickMode = (apiAvailable: boolean): DataMode => (apiAvailable ? "api" : "local")`
     - `detectMode({ fetchFn, dev, timeoutMs })` keeps the same probe and retry logic, with `if (dev) return "local"`.
   - `repo.ts`: `mode: "local" | "api"`; the Supabase section and its imports are deleted.
   - `useWardrobe(starter, defaultLocations, mode: DataMode = "local")`:
     - the repo is `mode === "api" ? createHttpRepo() : createLocalRepo(…)`
     - `signOut` is removed from the hook and from its return value
     - `message` keeps `Error.message` and the generic fallback.
4. **Legacy session cleanup** (consult R-D). `src/lib/legacySession.ts`:
   ```ts
   // Removes auth tokens left by the old Supabase build (sb-<project-ref>-auth-token[-code-verifier]). The Supabase
   // project was shared with stoktok (D17), so the token is a stoktok credential. Remove this file after a few releases.
   const LEGACY = /^sb-[^\s]+-auth-token(-code-verifier)?$/;
   export function clearLegacyAuthKeys(storage: Pick<Storage, "length" | "key" | "removeItem"> = localStorage): number
   ```
   - Collect the matching keys first, then remove them.
   - Wrap everything in `try/catch` and return the number removed (0 on any error). Never touch any other key.
   - The comment must not contain `@supabase/` or `VITE_SUPABASE`, which are now in the boundary `FORBIDDEN` list.
   - `main.tsx`: `applySavedTheme(); if (import.meta.env.PROD) clearLegacyAuthKeys();`, then
     `detectMode().then(mode => render(<React.StrictMode><App mode={mode} /></React.StrictMode>))` (A4).
5. **UI.**
   - `App.tsx`: remove `showSignOut`/`onSignOut` from `<Header>`.
   - `Header.tsx`: remove both props and the button.
   - No CSS change. R9: the header just loses one icon button; the reviewer checks 390px in light and dark mode.
6. **Delete** the runtime files listed in the table and fix the tests (see Tests to write). Run `pnpm typecheck` and `pnpm test`.
7. **Dependencies and config.**
   - Remove `@supabase/supabase-js` and `db:types` from `package.json`, then run `pnpm install` to regenerate the lockfile.
   - Update `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore` and `.dockerignore`.
8. **Image, CI, release** (consult R-E). Follow the file table. Rules for the implementer:
   - `release.yml`: change only the listed lines. The `check-image.sh` call becomes `bash scripts/check-image.sh "$ref"`.
   - `check-image.sh`: use `if [ "$#" -ne 1 ]; then echo "usage: check-image.sh <image-ref>" >&2; exit 2; fi`, and add this
     new section in place of `== bundle mode`:
     ```bash
     echo "== bundle"
     if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqi supabase $ROOT/assets"; then
       echo "::error::Supabase code in the bundle (removed in T-016)"; exit 1
     fi
     ```
   - If Docker is available, `docker build -t tudo:t . && bash scripts/check-image.sh tudo:t` must end in `image ok`.
     Otherwise the CI `image` job is the proof. Record which one in impl-log.
9. **Delete `supabase/`** and the three scripts. The archive SHA from step 1 goes into impl-log. The orchestrator copies it into the
   ticket Handoff and the notes of T-010 and F-701, so they can port from it (consult R-A).
10. **Docs, risk tiers, run.md/solo.md**: follow the file table. Put the CLAUDE.md wording (appendix) verbatim in the
    impl-log under "For Ming".
11. Run all checks and `pnpm test:coverage`. Record the after-build asset sizes. Run `grep -rli supabase src dist` and paste the
    output into impl-log.

**Rules.**
- **R1:** Every data access stays behind `WardrobeRepo`, with a local and an API implementation. Without the Node server (`pnpm dev`,
  the Figma Make preview, static hosting), the app runs on localStorage + demo items. `tu-do-items` is never cleared.
- **R2:** No schema change; `db/migrations/` is untouched. The Supabase migrations are deleted, not edited. They were never
  applied to a real project (consult finding 6; D25).
- **R3:** After T-016 the only `VITE_*` variable is `VITE_APP_VERSION`. `check-image.sh` keeps its secret checks and gains the
  bundle check. `boundary.test.ts` keeps `AI_KEK`/`ai_settings` and gains the Supabase names.
- **R4:** The Supabase Storage code is removed. Photos stay private through the Node server and Drive (D27); nothing about them
  changes here.
- **R5, R6:** Unchanged (no new UI copy).
- **R7:** Follow-ups are listed below, not put in the diff.
- **R8:** Checks are green, and the new pure helper and the changed mode logic have tests.
- **R9:** Only one header button disappears; the reviewer checks 390px in light and dark mode.
- **R10:** `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

## Specialist input used
`consult-software-architect.md` (with the orchestrator note):
- **Adopted:**
  - findings 1–6
  - R-A: delete; git history is the archive; record the SHA
  - R-B: keep `src/shared/ai` and its tests; delete `aiSettings.ts` and `supabase/functions/**`
  - R-C: two modes; delete `Root.tsx`; hand-written row types; keep `photoPath`; drop the `23505`/`42501` branches
  - R-D: legacy key cleanup with tests, restricted to production builds (see A4)
  - R-E: Dockerfile, release.yml, check-image.sh, ci.yml, package.json, tsconfig/vitest
  - R-F: tests
  - R-G: docs, `.env.example`, risk tiers, and run.md under A3; agent descriptions are left for a `/solo`
  - R-H: CLAUDE.md wording (appendix)
  - R-J: repo.http hardening is a follow-up
  - R-K: one ticket, structured commits, bundle sizes recorded
- **Adjusted:**
  - `.claude/commands/solo.md` line 9 is added to R-G's run.md change, for the same reason: it names deleted paths.
  - `src/data/repo.http.ts` is added to the run.md trigger list, because it is the new data boundary.
  - **Refresh:** R-A's deletion of `src/data/photos.ts` is dropped, because `repo.http.ts` uses it for Drive uploads (T-005.2).
    R-B's option B (delete `src/shared/ai`) is no longer possible, because `server/ai/parity.test.ts` imports it (T-018).
- **Not in this diff:** R-I (edits to ming-todo, backlog and decisions). D16 says the orchestrator does those on `main`. The
  exact items are listed under "Ming verification" and "Follow-ups".
- **Orchestrator note:**
  - Q3: no Supabase cleanup item is needed (`tudo_*` tables were never created, and M-10 was never done).
  - Q4: Ming signed in on production, so R-D applies and the "sign out sessions in stoktok" Ming item is added.

## Assumptions
**Decisions approved by Ming on 2026-11-13 (all at their defaults):**
- **A1 — Keep `src/shared/ai/*` (default, approved).** It is free of Supabase code, encodes the D21 catalog, and is now the
  source of truth for `server/ai/*.js` (D30, parity test). The T-010 Settings UI needs it. Only the header comments change, and
  `mirror.test.ts` goes. The alternative (delete it) is moot after T-018.
- **A2 — A failed `/healthz` probe in production falls back to local mode (default, approved: accept, follow-up ticket).** After
  two network errors or timeouts the user sees demo items and edits go to localStorage, with no indicator (consult Risk 1).
  A follow-up ticket adds a local-mode banner or retry screen on a non-local host.
- **A3 — T-016 edits `.claude/commands/run.md` line 46 and `.claude/commands/solo.md` line 9 (default, approved).** `CLAUDE.md`
  and `.claude/agents/*` are not edited.
- **A4 — The legacy `sb-*` cleanup runs in production builds only (default, approved).**
- **A5 — The Cloudflare Access sign-out link (`/cdn-cgi/access/logout`) in the header is a follow-up, not part of T-016 (default,
  approved).**
- **A6 — Ming items, added by the orchestrator on `main` (default, approved):** delete the `VITE_SUPABASE_*` repo secrets after
  the merge, and sign out all sessions of your user in the stoktok Supabase project.

**Other assumptions:**
- **A7:** There is no data export step (Ming 2026-11-11). `supabase/migrations/**` were never applied to a real project (M-1 was
  never done), so deleting them loses no applied history.
- **A8:** `Item.photoPath` and the `primary_photo_path` field in `ItemRow` stay. In API mode, `photoPath` is the `item_photos` id
  (T-005.3) and `primary_photo_path` is always `null` from the server. Dropping the field from the wire shape is a server change
  and out of scope.
- **A9:** After T-016, `pnpm dev` and the Figma Make preview are always in local mode; API mode runs only under the Node server
  (consult finding 5). README says how to try it (`pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start`).
- **A10:** The live image (built before T-016) still carries the Supabase bundle. It runs in API mode and may still refresh an old
  `sb-*` token until the first post-T-016 release clears it. Revoking sessions (A6) covers that window.
- **A11:** The repo secrets can be deleted at any time after the merge: no built image needs them.
- **A12:** `docs/feature-list.md` and `docs/plan-M1.md` get one header note only; the per-feature text stays as history.
  `docs/data-model.md` gets a new header paragraph; its ERD rewrite is a follow-up.
- **A13 — Hotspots.** These files may conflict with parallel work:
  - `README.md`
  - `.github/workflows/ci.yml` and `release.yml`
  - `scripts/check-image.sh`
  - `src/App.tsx`
  - `src/data/useWardrobe.ts` and `src/data/mappers.ts`
  - `package.json` and `pnpm-lock.yaml`
  - `vitest.config.ts`
  - `src/shared/ai/boundary.test.ts`
  - `.github/risk-tiers.yml`

  No other ticket is `IN_PROGRESS`, `REVIEW` or `DONE` today. **T-018.2** (BACKLOG; AI_KEK deploy wiring) is likely to touch
  `check-image.sh`, `vitest.config.ts` and `server/ai`. Whichever lands second rebases.

## Blocking questions
None. A1–A6 were approved on 2026-11-13. The refresh adds no scope and needs no new High-tier decision.

## Split proposal
None. About 230–290 non-test lines are added or changed; the rest is deletion. If the implementation exceeds about 400 non-test
added lines, fall back to this split (consult R-K):
- **T-016.1:** runtime `src/`, dependencies, Docker/CI/release/scripts, and tsconfig/vitest for `src`.
- **T-016.2:** the `supabase/` folder, its tsconfig/vitest entries, README and docs, risk tiers, and run.md/solo.md.

### Follow-ups (not in this diff, R7)
- **repo.http hardening** (T-014 review/security): UUID guard and `encodeURIComponent` on the `remove`/`wear` paths,
  response-shape checks in `repo.http.ts`, and a `requestId` UUID check.
- **Local-mode banner or retry screen** on a non-local host when the probe fails (A2).
- **Cloudflare Access sign-out link** in the header (A5).
- `/solo`: the Supabase wording in `.claude/agents/*` (database-optimizer, reviewer, planner, implementer, software-architect,
  security auditor) and in `.claude/commands/run.md:94` (`supabase db push` guardrail).
- `docs/data-model.md`: redraw the ERD from `db/migrations/`.
- Drop `primary_photo_path` from the API wire shape (`server/items.js`, `ItemRow`) once nothing reads it.
- Remove `src/lib/legacySession.ts` after a few releases.
- Move `react`/`react-dom` to `devDependencies` to slim the image (T-015 A9).
- **Orchestrator on `main` (D16):**
  - `work/ming-todo.md`: mark M-1, M-2, M-5, M-8, M-10 and the F-101 part of M-6 obsolete, and add the two A6 items. M-14 is
    already ticked; no edit is needed.
  - Backlog: mark F-001, F-002, F-006, F-101, F-102 and the Supabase parts of T-010/F-701/F-702 as superseded.
  - Record the archive SHA in T-010 and F-701.
  - Optionally add a decision row "Supabase removed (T-016)", using the next free D-number, if Ming wants one.

## Appendix — CLAUDE.md wording for Ming (proposal only; Ming edits CLAUDE.md)
- **Intro paragraph:** "Personal wardrobe tracker ("Tủ đồ của tôi"). UI exported from Figma Make; Node API (`server/`)
  over the shared self-hosted Postgres (D23), served in the same image as the SPA; photos on Google Drive via the server (D27);
  Cloudflare Access in front, no in-app login. Outside the Node server (`pnpm dev`, Figma Make preview) it runs in local mode
  (localStorage + demo items), which the Figma Make preview depends on."
- **Stack:** replace the Supabase bullet with "Backend: Node 22 `server/` (`pg`, `jose`); migrations in `db/migrations/`,
  applied by `node server/migrate.js`; client data layer `src/data/` (`repo.http.ts`, local repo)." Hosting: "Self-hosted
  Node image behind Cloudflare Tunnel + Access (D20, D26)."
- **R1:** "Local mode keeps working. Every data access goes through `WardrobeRepo` (`src/data/`), with both a local and an
  API (`repo.http.ts`) implementation. Components never call `fetch('/api…')` directly. Mode is detected at startup via
  `/healthz`; without the Node server the app runs on localStorage + demo items."
- **R2:** "Schema changes are a new SQL file in `db/migrations/`, applied only by the `migrate` service; never edit an
  applied migration. Only TuDo's own role on the `db` network reaches Postgres; the browser never does. While single-user
  without login, tables have no RLS; when in-app auth or a second user arrives, every table gets `user_id` and RLS
  (`ENABLE` + `FORCE`) in the same migration (D25)."
- **R3:** "Nothing secret reaches the browser. No `VITE_*` variable carries a secret (today only `VITE_APP_VERSION`).
  Server secrets (`DATABASE_URL`, Google Drive OAuth values, `AI_KEK`) live only in the host env file / deployment-repo
  secrets (D28, D30) and are read only by `server/`."
- **R4:** "Photos are private: stored on Google Drive and served only through `GET /api/photos/:id` behind Cloudflare Access
  (D27); the browser never holds storage credentials or Drive file ids."
- **R5:** "… come from `wear_logs` (the `items_with_stats` view in `db/migrations/`)."
- **Risk tiers, High:** replace `supabase/migrations/**` and `src/features/auth/**` with `db/migrations/**`, `server/**`
  (including `server/access.js`, the Access JWT check, and `server/ai/**`, `server/drive.js`), `Dockerfile`,
  `scripts/check-image.sh`, `deploy/**` and the release/deploy workflows.
