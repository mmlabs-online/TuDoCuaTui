Status: READY

# Plan — T-016: Remove Supabase from the app

Gate: **plan-approval** (High tier: `release.yml`, `Dockerfile`, `check-image.sh`, auth code removal, `supabase/migrations/**`
deletion). Ming confirms or changes **A1–A6** below (each has a default; the plan is READY with the defaults).

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
- T-014 plan follow-up: "T-016: drop the `supabase` branch from `pickMode`/`useWardrobe`, re-home `ItemRow`/`ItemInsert`
  types, and make the fallback local-only."
- T-014 security review, items 3–4: "stop creating the client and clear `sb-*-auth-token` in T-016"; "`getAiSettingsRepo()`
  has no caller."

Ticket goal: "No Supabase client, auth, Storage, Edge Function or `VITE_SUPABASE_*` code remains once the API mode is
live." Ticket scope: remove `src/lib/supabase.ts`, the Supabase repo and tests, AuthGate, Supabase types, the `supabase/`
folder; update README, risk tiers, and a CLAUDE.md wording proposal for Ming.
Ming (2026-11-11): "No data migration from Supabase to Postgres is needed […] Ming cuts the M-14 release himself."
The ticket line "Close/park PR #28" is out of date: PR #28 was merged on 2026-11-10 (consult R-I).

**Production context (orchestrator, 2026-11-11).** The first Node release `v0.2.0` was auto-rolled back to `v0.1.4`
(nginx, Supabase-mode bundle) because `compose.yml` was not in the release PR. The `v0.2.0` image is already built.
T-016 must not break (a) Ming re-deploying `v0.2.0` with the compose, or (b) the next release from `main`. This plan
therefore does **not** touch `deploy/deployment-repo/**`, the image runtime contract (`Cmd`, `:3000`, `/healthz`,
`/readyz`, `node server/migrate.js`, file layout), `server/**`, `db/migrations/**`, or the `release.env` part of
`release.yml`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "`grep -ri supabase src` returns only intentional references (none in runtime code)." | `grep -rli supabase src` lists only: `src/lib/legacySession.ts` (one comment explaining the `sb-*` keys), `src/lib/legacySession.test.ts`, and `src/shared/ai/boundary.test.ts` (the forbidden-word list). No other file. `grep -rn "VITE_SUPABASE\|@supabase/" src package.json vitest.config.ts tsconfig.json Dockerfile .github scripts` → no hit. `test ! -e supabase && test ! -e src/types/database.ts && test ! -e src/lib/supabase.ts && test ! -d src/features/auth`. After `pnpm build`: `grep -rli supabase dist` → no hit. |
| 2 | "All checks pass" | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` are green. `pnpm test:coverage` meets every threshold, including `src/data/**` at 80/80/80/75. CI `ci` and `image` jobs are green on the PR. `pnpm-lock.yaml` has no `@supabase/*` entry. |
| 3 | "local mode … work[s]" (R1) | `mode.test.ts`: `dev: true` → `local` with no fetch; a definite "no" (HTML 200, 404, invalid JSON) → `local`. Existing `App.test.tsx` local-mode suites pass unchanged (16 demo items, no login). New `App.test.tsx` case: local mode shows no "Đăng xuất". Browser check (reviewer, as in T-014): `pnpm build`, serve `dist/` with any static SPA server → demo items, no login, no "Đăng xuất", 390px and dark mode look as before. |
| 4 | "… and API mode work" | `mode.test.ts`: `/healthz` JSON ok → `api`; opaqueredirect → `api`. New `App.test.tsx` case (moved from `Root.test.tsx`): `mode="api"` with a fake fetch renders the server item, with no login field and no "Đăng xuất". `useWardrobe.test.tsx` api cases (below). CI `image` job DB smoke (`/readyz` 200, `/api/locations` 401) stays green. Optional, if the reviewer has Postgres: `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start`, then add/edit/wear/delete an item in the browser. |
| 5 | Existing users' Supabase session is cleared, other storage is untouched (consult R-D, T-014 security review 3) | `legacySession.test.ts` (cases below): `sb-<ref>-auth-token` and `sb-<ref>-auth-token-code-verifier` are removed; `tu-do-items`, `tu-do-theme` and unrelated keys stay. `main.tsx` calls it before `detectMode()` in production builds only. |
| 6 | Release and image pipeline no longer use Supabase, and the re-deploy of `v0.2.0` / the next release are not affected | `git diff main -- .github/workflows/release.yml`: only the lines listed in the file table change (guard env, guard call, `mode` output, build args, verify env/argument, PR body text, header comment). The trigger, version guards, tag reservation, push/platform/provenance/sbom settings, digest pinning, `check-image.sh` on the digest, the "only `release.env`" guard and the PR branch/title are unchanged. `git diff --name-only main` lists nothing under `deploy/`, `server/`, `db/`, nor `vite.config.ts`, `AGENTS.md`, `.figma/` (R10), nor `CLAUDE.md`. `check-image.sh` accepts exactly one argument and has a new `== bundle` check that fails on `supabase` in `/app/dist/assets`. |
| 7 | Docs and risk tiers updated; CLAUDE.md wording proposed, not applied | README has no "Set up Supabase", pgTAP, Supabase-mode or `VITE_SUPABASE_*` text (`grep -ni supabase README.md` → at most one historical sentence pointing to D23). `.github/risk-tiers.yml` lists `server/**`, `db/migrations/**` and no `supabase/` path. The CLAUDE.md wording is in this plan (appendix) and in the impl-log for Ming; `git diff main -- CLAUDE.md` is empty. |

## Ming verification after merge
1. **Re-deploy of `v0.2.0` is independent of T-016.** It uses the already-built image and the compose from
   `deploy/deployment-repo/apps/tudocuatui/compose.yml`, which T-016 does not change. Its bundle still contains the
   Supabase client (built before T-016); on the Node server it runs in API mode (T-014), as planned.
2. **Next release after T-016** (for example `v0.2.1`, M-14 flow; Ming cuts it): the `release` run is green; the
   deployment PR body says "Node server, API mode"; after deploy, on the phone: no login, no "Đăng xuất", the list
   comes from the server. In DevTools → Application → Local Storage (desktop): no `sb-…-auth-token` key; `tu-do-theme`
   and (if present) `tu-do-items` are still there.
3. **New Ming items** (the orchestrator adds them to `work/ming-todo.md` on `main`, D16):
   - Delete the repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (GitHub → Settings → Secrets) after
     T-016 is merged. `release.yml` no longer reads them; the `v0.2.0` image does not need them.
   - In the **stoktok** Supabase project: Authentication → Users → your user → sign out all sessions (or rotate the
     password). This revokes the refresh token that the old TuDo production bundle stored; clearing the browser key
     (AC 5) does not revoke it (orchestrator note on consult Q4).

## Files to create / modify
Structured commits, in this order: (1) runtime `src/`, (2) deps + build/CI/release/scripts, (3) delete `supabase/`
and its config, (4) docs. Bundle sizes from `pnpm build` before and after go into impl-log.

**Runtime (`src/`)**
| File | Change | Required because |
|---|---|---|
| `src/lib/supabase.ts` | delete | AC 1 (client creation, `PHOTO_BUCKET`) |
| `src/types/database.ts` | delete | AC 1 (generated Supabase types) |
| `src/features/auth/AuthGate.tsx`, `authMessages.ts`, `AuthGate.test.tsx`, `authMessages.test.ts` | delete | AC 1, no in-app login (D23) |
| `src/Root.tsx`, `src/Root.test.tsx` | delete | Its only job was the AuthGate switch (consult R-C). The api/local cases move to `App.test.tsx`. |
| `src/data/aiSettings.ts`, `src/data/aiSettings.test.ts` | delete | Supabase-only, no caller (consult R-B, T-014 security review 3) |
| `src/data/photos.ts` | delete | Only the Supabase repo used it (consult R-A); T-005 re-plans uploads from git history |
| `src/data/repo.supabase.test.ts`, `src/test/fakeSupabase.ts` | delete | Tests of removed code |
| `src/shared/ai/mirror.test.ts` | delete | Its mirror (`supabase/functions/_shared/ai`) is deleted |
| `src/data/repo.ts` | modify | Delete the Supabase section (lines 102–293) and its imports; `mode: "local" \| "api"`; local-mode comment no longer says "when Supabase env is missing" |
| `src/data/mappers.ts` | modify | Replace the `Database` import with hand-written `ItemRow` / `ItemInsert` / enum unions matching `server/items.js` `toItemRow` and `db/migrations/20261110120000_init.sql` (Approach 2). Export the row types. |
| `src/data/mode.ts` | modify | `DataMode = "local" \| "api"`; `pickMode(apiAvailable)`; drop `hasSupabase` and the Supabase import; comment fixed |
| `src/data/useWardrobe.ts` | modify | Default mode `"local"`; repo = `api` → `createHttpRepo()`, else local; remove `signOut`, the Supabase import and the `23505`/`42501` branches in `message`; doc comment |
| `src/lib/legacySession.ts` | create | `clearLegacyAuthKeys(storage?)` (Approach 4) |
| `src/main.tsx` | modify | Render `<App mode={mode} />` instead of `<Root>`; call `clearLegacyAuthKeys()` before `detectMode()` when `import.meta.env.PROD` |
| `src/App.tsx` | modify | Remove `showSignOut` / `onSignOut` props on `Header` |
| `src/features/layout/Header.tsx` | modify | Remove the `showSignOut` / `onSignOut` props and the sign-out button |
| `src/types/item.ts` | modify | Line 21 comment: "Storage path of the primary photo (unused until T-005; the API returns null)" |
| `src/shared/ai/{catalog,errors,validate,mask}.ts` | modify | Header comment line 1 only: "Shared AI settings rules (D21); no runtime caller until T-010 is re-planned on the Node backend." (A1) |

**Tests**
| File | Change | Required because |
|---|---|---|
| `src/data/mode.test.ts` | modify | Two-mode matrix (Tests below) |
| `src/data/useWardrobe.test.tsx` | modify | Drop the Supabase mocks, the `supabase mode` block and the `signOut` test; add api cases; update the `message` test |
| `src/data/mappers.test.ts` | modify | Import `ItemRow` from `./mappers` instead of `Database` |
| `src/data/repo.local.test.ts` | modify | Remove the `vi.mock("./photos", …)` line (module deleted) |
| `src/App.test.tsx` | modify (additive) | Two cases moved from `Root.test.tsx` (Tests below) |
| `src/lib/legacySession.test.ts` | create | AC 5 |
| `src/test/env.test.ts` | modify | Drop the "supabase is null" test and its import; keep the TZ test |
| `src/shared/ai/boundary.test.ts` | modify | Drop the `database.ts` exclusion; add `"@supabase/"` and `"VITE_SUPABASE"` to `FORBIDDEN` (regression guard for AC 1) |
| `src/features/import-export/csv/serialize.test.ts` | modify | Line 147 test name: "keeps a date-only value (API mode)" |

**Dependencies, config, build, CI, release, scripts**
| File | Change | Required because |
|---|---|---|
| `package.json` | modify | Remove `@supabase/supabase-js` and the `db:types` script |
| `pnpm-lock.yaml` | regenerate | `pnpm install` after the dependency removal (generated; not counted as scope) |
| `tsconfig.json` | modify | Remove the two `supabase/functions/_shared/*` includes |
| `vitest.config.ts` | modify | `env`: keep only `VITE_APP_VERSION: ""`; coverage: remove `authMessages.ts`, `supabase/functions/_shared/core/**` (include and thresholds) and the `photos.ts` exclude; add `src/lib/legacySession.ts` to include and thresholds |
| `.env.example` | modify | Replace the Supabase lines with a comment: "The browser build needs no variables. Server env (`DATABASE_URL`, `CF_ACCESS_*`) is documented in server/README.md; never put a secret in a VITE_* variable (R3)." Keep the file (`boundary.test.ts` reads it). |
| `.gitignore` | modify | Remove line 24 (`/supabase/migrations/20200101000000_sim_…`) |
| `.dockerignore` | modify | Remove the `supabase` line |
| `Dockerfile` | modify | Remove `ARG VITE_SUPABASE_URL=`, `ARG VITE_SUPABASE_ANON_KEY=` and the header line 5. Nothing else. |
| `.github/workflows/release.yml` | modify | Header: drop the `VITE_SUPABASE_*` secret lines and the "build args stay until T-016" line; add "T-016: no Supabase; the browser build takes only VITE_APP_VERSION." Guard step: drop the two env lines, the `check-public-supabase-env.sh` call, its comment and the `mode` lines. Build args: only `VITE_APP_VERSION`. Verify step: drop `SUPABASE_URL` env; call `bash scripts/check-image.sh "$ref"`. PR step: drop `MODE`; body text "(Node server, API mode; deploy runs backup + migrate; …)". |
| `.github/workflows/ci.yml` | modify | `ci` job: remove the `check-public-supabase-env.test.sh` step. `image` job: rename the second build to `build (release version)`, tag `tudocuatui:ci-version`, build args only `VITE_APP_VERSION=v0.0.0`; second check `bash scripts/check-image.sh tudocuatui:ci-version` with `EXPECTED_VERSION: v0.0.0`; header comment rewritten. |
| `scripts/check-image.sh` | modify | Usage: exactly one argument; drop `EXPECTED_URL` and its header lines; replace `== bundle mode` with `== bundle`: fail (`::error::Supabase code in the bundle`) if `grep -rqi supabase $ROOT/assets`. Keep the `sb_secret_` scan. Everything else unchanged. |
| `scripts/check-public-supabase-env.sh`, `scripts/check-public-supabase-env.test.sh`, `scripts/test-db-shared.sh` | delete | Supabase-only |
| `supabase/` (whole folder: `config.toml`, `.gitignore`, `migrations/`, `tests/`, `functions/`) | delete | AC 1, D25, consult R-A |

**Docs and workflow config**
| File | Change | Required because |
|---|---|---|
| `README.md` | modify | Line 3 intro (Node API + self-hosted Postgres, Cloudflare Access, local mode outside the server); "Run locally": two modes only (local, and API when served by `node server/index.js`), `.env.example` line updated; delete "Set up Supabase (one time)" and the pgTAP section; "Deploy": delete the "Supabase values" paragraph and the `--build-arg VITE_SUPABASE_*` text (line 94); code map: `repo.ts` = local repo, add `repo.http.ts` (API), drop rows for `photos.ts`, `AuthGate.tsx`, `supabase/migrations/`, `supabase/tests/`, `check-public-supabase-env.sh`; add `db/migrations/` if missing |
| `docs/qa/smoke-test.md` | delete | Entirely Supabase; the live smoke is M-14 step 6 |
| `docs/data-model.md` | modify | Line 3: "Backend: self-hosted Postgres behind the Node API (D23); schema in `db/migrations/`. Single user without login for now: no `user_id`/RLS until in-app auth arrives (D25)." |
| `docs/feature-list.md`, `docs/plan-M1.md` | modify | One note under the title each: "Backend superseded by D23 (2026-11-10): Supabase was removed in T-016; mentions of Supabase, Auth, RLS and Storage below are historical and are re-planned on the Node backend." |
| `.github/risk-tiers.yml` | modify | Replace the four Supabase entries and `scripts/check-public-supabase-env*.sh` with `db/migrations/**` (DB migrations), `server/**` (API, Access JWT check, DB access); keep everything else |
| `.claude/commands/run.md` | modify (A3) | Line 46 trigger list: replace `supabase/`, `src/features/auth/`, `src/lib/supabase.ts` with `server/`, `db/migrations/`, `Dockerfile`, `scripts/check-image.sh`, `deploy/`; keep `src/data/repo.ts`, `**/*.sql`, `.env.example`, `vite.config.ts`, `public/_redirects`, `.github/workflows/`; add `src/data/repo.http.ts` |
| `.claude/commands/solo.md` | modify (A3) | Line 9: `supabase/migrations/`, `src/features/auth/` → `db/migrations/`, `server/` |

Not touched: `deploy/**`, `server/**`, `db/**`, `vite.config.ts`, `AGENTS.md`, `.figma/` (R10), `CLAUDE.md` (Ming),
`.claude/agents/*` (follow-up), `work/backlog.md`, `work/ming-todo.md`, `work/decisions.md` (orchestrator on `main`, D16),
`src/data/repo.http.ts` (hardening is a follow-up), `src/index.css`, `src/components/Icon.tsx` (the unused `logout`
icon stays; harmless).

**Size.** Non-test additions/changes ≈ 230–290 lines: mappers types ~30, mode/useWardrobe/main/App/Header ~30,
legacySession ~20, release/ci/check-image/Dockerfile ~45, package/tsconfig/vitest/.env.example/ignores ~15, README
~70, other docs ~10, risk tiers ~8, run.md/solo.md ~4, shared/ai headers 4. Everything else is deletion (≈ 4,000+
lines incl. `supabase/`, `database.ts`, the Supabase repo and its tests). One cycle; no split (consult R-K).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `legacySession.test.ts › removes sb-<ref>-auth-token and sb-<ref>-auth-token-code-verifier` | AC 5 |
| `› keeps tu-do-items, tu-do-theme and unrelated keys (sb-x, my-sb-a-auth-token, sb-a-auth-token-extra)` | AC 5, consult Risk 3 |
| `› removes every matching key when several exist (keys collected before removal) and returns the count` | iteration while removing |
| `› does not throw when storage throws (getItem/key/removeItem) and returns 0` | private mode / sandboxed iframe |
| `mode.test.ts › pickMode: true → api, false → local` | two-mode set |
| `› dev never calls fetch → local` | R1, Figma Make / `pnpm dev` |
| `› api only for 200 + JSON + status ok; GETs /healthz no-store, redirect manual` | kept |
| `› opaqueredirect → api` | kept (T-014 security fix) |
| `› no false positive (html 200, 404, json without ok, invalid json) → local, no retry` | kept |
| `› retries once after a network error → api` | kept |
| `› falls back to local after two network errors` | changed: was `supabase` (consult Risk 1, A2) |
| `› aborts after the timeout → local` | kept |
| `useWardrobe.test.tsx › default mode is local` (existing local suite, unchanged apart from removed mocks) | R1 |
| `› api mode: loads through the HTTP repo and reports mode api` | kept |
| `› api mode: a load error (fake 503 db_unavailable) shows the ApiError message and loading ends` | replaces the Supabase "load error" case |
| `› api mode: importMany continues after a failed row (400 invalid_input) and keeps saved rows in state` | replaces the Supabase importMany case |
| `› message returns Error messages and the generic text for unknown values` | updated (`23505`/`42501` removed) |
| `› the hook result has no signOut` | removal |
| `App.test.tsx › api mode: items load from /api, no login field, no "Đăng xuất"` | moved from `Root.test.tsx` (AC 4); assert no `input[type=email]` / `input[type=password]` |
| `› local mode: demo items, no "Đăng xuất"` | moved from `Root.test.tsx` (AC 3) |
| `boundary.test.ts › no client source names a server-only secret or table` (now also `@supabase/`, `VITE_SUPABASE`) | AC 1 regression guard |
| `scripts/check-image.sh` `== bundle` (CI `image` job, both builds) | AC 6, no Supabase in the shipped bundle |

`mappers.test.ts` keeps all its cases; only the type import changes. Coverage for `src/data/**` must stay ≥ thresholds.

## Approach
1. **Baseline.** On a clean tree run `pnpm build` and record the asset sizes (raw and gzip) in impl-log.
2. **Row types in `src/data/mappers.ts`** (consult R-C, T-014 A7):
   ```ts
   export type DbCategory = "top" | "bottom" | "dress" | "outer" | "shoes" | "bag" | "accessory" | "sport" | "home" | "other";
   export type DbStatus = "active" | "stored" | "laundry" | "lent" | "out";
   export type DbSeason = "spring" | "summer" | "autumn" | "winter";
   /** Wire shape of an items_with_stats row from the API (server/items.js toItemRow). Fields are nullable as in the view. */
   export type ItemRow = { id: string | null; name: string | null; category: DbCategory | null; status: DbStatus | null;
     brand, size, material, purchase_date, location_id, notes, created_at, updated_at, last_worn, location_name,
     primary_photo_path: string | null; price, wear_count: number | null; colors, tags: string[] | null; seasons: string[] | null };
   /** Body fields itemToRow produces (repo.http.ts removes id/location_id and adds location_name). */
   export type ItemInsert = { id?: string; name: string; category: DbCategory; status: DbStatus; brand, size, material,
     purchase_date, notes: string | null; price: number | null; location_id: string | null; colors, tags: string[]; seasons: DbSeason[] };
   ```
   (Sketch; the implementer writes it out with oxfmt formatting.) Replace `Enums["tudo_item_category"]` etc. with
   these unions. `rowToItem`/`itemToRow` bodies do not change. `repo.http.ts` keeps `Parameters<typeof rowToItem>[0]`
   and needs no edit. `typecheck` proves the types match what the mappers already read and write.
3. **Modes** (consult R-C). `mode.ts`: `export type DataMode = "local" | "api"`; `pickMode = (apiAvailable: boolean):
   DataMode => (apiAvailable ? "api" : "local")`; `detectMode({ fetchFn, dev, timeoutMs })` with the same probe and
   retry logic; `if (dev) return "local"`. `repo.ts`: `mode: "local" | "api"`, Supabase section and imports deleted.
   `useWardrobe(starter, defaultLocations, mode: DataMode = "local")`: `mode === "api" ? createHttpRepo() :
   createLocalRepo(…)`; `signOut` removed from the hook and its return; `message` keeps `Error.message` and the
   generic fallback.
4. **Legacy session cleanup** (consult R-D). `src/lib/legacySession.ts`:
   ```ts
   // Removes auth tokens left by the old Supabase build (sb-<project-ref>-auth-token[-code-verifier]). The Supabase
   // project was shared with stoktok (D17), so the token is a stoktok credential. Remove this file after a few releases.
   const LEGACY = /^sb-[^\s]+-auth-token(-code-verifier)?$/;
   export function clearLegacyAuthKeys(storage: Pick<Storage, "length" | "key" | "removeItem"> = localStorage): number
   ```
   Collect matching keys first, then remove; wrap everything in `try/catch` and return the number removed (0 on any
   error). Never touch any other key. `main.tsx`: `applySavedTheme(); if (import.meta.env.PROD) clearLegacyAuthKeys();`
   then `detectMode().then(mode => render(<StrictMode><App mode={mode} /></StrictMode>))` (A4).
5. **UI.** `App.tsx`: remove `showSignOut`/`onSignOut` from `<Header>`. `Header.tsx`: remove both props and the button.
   No CSS change (R9: the header just loses one icon button; reviewer checks 390px light/dark).
6. **Delete** the runtime files listed in the table; fix the tests (Tests to write). Run `pnpm typecheck` and `pnpm test`.
7. **Dependencies and config.** Remove `@supabase/supabase-js` and `db:types` from `package.json`; `pnpm install` to
   regenerate the lockfile; update `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `.dockerignore`.
8. **Image, CI, release** (consult R-E). As in the file table. Rules for the implementer:
   - `release.yml`: change only the listed lines. The `check-image.sh` call becomes `bash scripts/check-image.sh "$ref"`.
   - `check-image.sh`: `if [ "$#" -ne 1 ]; then echo "usage: check-image.sh <image-ref>" >&2; exit 2; fi`. New section:
     ```bash
     echo "== bundle"
     if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqi supabase $ROOT/assets"; then
       echo "::error::Supabase code in the bundle (removed in T-016)"; exit 1
     fi
     ```
   - If Docker is available, `docker build -t tudo:t . && bash scripts/check-image.sh tudo:t` must end in `image ok`.
     Otherwise the CI `image` job is the proof (record which in impl-log).
9. **Delete `supabase/`** and the three scripts. Record the last pre-T-016 commit SHA of `main` in impl-log ("Supabase
   code archive: `<sha>`") so T-010, F-701 and T-005.x can port from it (consult R-A); the orchestrator copies it into
   the ticket Handoff and the notes of T-010, F-701, T-005.1.
10. **Docs, risk tiers, run.md/solo.md** as in the file table. Put the CLAUDE.md wording (appendix) verbatim in the
    impl-log under "For Ming".
11. Run all checks and `pnpm test:coverage`; record the after-build asset sizes; `grep -rli supabase src dist` and
    paste the output into impl-log.

**Rules.**
- **R1:** every data access stays behind `WardrobeRepo` with a local and an API implementation; with no Node server
  (`pnpm dev`, Figma Make preview, static hosting) the app runs on localStorage + demo items. `tu-do-items` is never
  cleared.
- **R2:** no schema change; `db/migrations/` untouched. The Supabase migrations are deleted, not edited (they were never
  applied to a real project, consult finding 6; D25).
- **R3:** after T-016 no `VITE_*` variable other than `VITE_APP_VERSION` exists; `check-image.sh` keeps its secret
  checks and gains the bundle check.
- **R4:** Supabase Storage code is removed; no photo storage exists until T-005 (the API returns `primary_photo_path: null`).
- **R5, R6:** unchanged (no new UI copy).
- **R7:** follow-ups below, not in the diff.
- **R8:** checks green; the new pure helper and the changed mode logic have tests.
- **R9:** only one header button disappears; reviewer checks 390px light/dark.
- **R10:** `vite.config.ts`, `AGENTS.md`, `.figma/` untouched.

## Specialist input used
`consult-software-architect.md` (with the orchestrator note):
- **Adopted:** findings 1–6; R-A (delete, git history as archive, record the SHA); R-B (keep `src/shared/ai` + tests,
  delete `aiSettings.ts` and `supabase/functions/**`); R-C (two modes, delete `Root.tsx`, hand-written row types, keep
  `photoPath`, drop the `23505`/`42501` branches); R-D (legacy key cleanup with tests; restricted to production builds,
  see A4); R-E (Dockerfile, release.yml, check-image.sh, ci.yml, package.json, tsconfig/vitest); R-F (tests); R-G (docs,
  `.env.example`, risk tiers, run.md under A3; agent descriptions left for a `/solo`); R-H (CLAUDE.md wording, appendix);
  R-J (repo.http hardening is a follow-up); R-K (one ticket, structured commits, bundle sizes recorded).
- **Adjusted:** `.claude/commands/solo.md` line 9 is added to R-G's run.md change (same reason: it names deleted paths).
  `src/data/repo.http.ts` added to the run.md trigger list (it is the new data boundary).
- **Not in this diff:** R-I (ming-todo, backlog, decisions edits) — D16 says the orchestrator does those on `main`. The
  exact items are listed under "Ming verification" and "Follow-ups".
- **Orchestrator note:** Q3 → no Supabase cleanup item needed (`tudo_*` tables never created, M-10 never done). Q4 →
  Ming signed in on production, so R-D applies and the "sign out sessions in stoktok" Ming item is added.

## Assumptions
**Decisions for Ming at plan approval (each has a default):**
- **A1 — Keep `src/shared/ai/*` (default).** It is Supabase-free, encodes the D21 catalog, and the T-010 Settings UI
  needs it whatever the backend. Only the header comments change and `mirror.test.ts` goes. Alternative: delete
  `src/shared/ai` too (no runtime caller today; recover from git when T-010 is re-planned).
- **A2 — A failed `/healthz` probe in production falls back to local mode (default: accept, follow-up ticket).** After
  two network errors/timeouts the user sees demo items and edits go to localStorage, with no indicator (consult Risk 1).
  Before T-016 the fallback was the Supabase login. Default: accept for now and open a follow-up ticket "local-mode
  banner / retry screen on a non-local host". Alternative: include in T-016 a retry screen when the probe errors on a
  host that is not `localhost`/`127.0.0.1`/a Figma origin (~30 lines + tests in `mode.ts`, `main.tsx` and a copy
  entry; changes AC 3/4 tests).
- **A3 — T-016 edits `.claude/commands/run.md` line 46 and `.claude/commands/solo.md` line 9 (default: yes).**
  Without it, backend diffs (`server/`) never trigger the security review automatically (consult Risk 4). Ming's
  "Plan approved" is the sign-off for these two workflow files. Alternative: drop both rows and Ming does a `/solo`.
  `CLAUDE.md` and `.claude/agents/*` are not edited either way.
- **A4 — Legacy `sb-*` cleanup runs in production builds only (default).** Production is where the stoktok token was
  stored (orchestrator note). Skipping dev builds avoids touching other apps' sessions on a shared `localhost:5173`
  origin and keeps the Figma Make preview free of side effects. Alternative: run it in every build.
- **A5 — Cloudflare Access sign-out link (`/cdn-cgi/access/logout`) in the header: follow-up, not in T-016 (default).**
- **A6 — Ming items** (added by the orchestrator on `main`): delete the `VITE_SUPABASE_*` repo secrets after merge;
  sign out all sessions of your user in the stoktok Supabase project. Default: both added.

**Other assumptions:**
- **A7** — No data export step (Ming 2026-11-11). `supabase/migrations/**` were never applied to a real project
  (M-1 never done), so deleting them loses no applied history.
- **A8** — `Item.photoPath` and the `primary_photo_path` mapping stay (the API returns `null`; T-005 reuses them).
- **A9** — `pnpm dev` and the Figma Make preview are always local mode after T-016; API mode runs only under the Node
  server (consult finding 5). `README` says how to try it (`pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start`).
- **A10** — The `v0.2.0` image (built before T-016) still carries the Supabase bundle; it runs in API mode on the Node
  server and may still refresh an old `sb-*` token until the first post-T-016 release clears it. Revoking sessions
  (A6) covers that window.
- **A11** — The repo secrets can be deleted in any order relative to the `v0.2.0` re-deploy: that image is already built.
- **A12** — `docs/feature-list.md` and `docs/plan-M1.md` get one header note only; per-feature text stays as history.
- **A13** — Hotspots: `README.md`, `.github/workflows/ci.yml`, `src/App.tsx`, `src/data/useWardrobe.ts`,
  `package.json`/`pnpm-lock.yaml`, `vitest.config.ts`. A ticket that runs in parallel and touches these rebases after T-016.

## Blocking questions
None. A1–A6 have defaults; Ming confirms or changes them at plan approval.

## Split proposal
None. ≈ 230–290 non-test lines added or changed; the rest is deletion. Fallback if the implementation exceeds ~400
non-test added lines (consult R-K): **T-016.1** = runtime `src/`, deps, Docker/CI/release/scripts, tsconfig/vitest for
`src`; **T-016.2** = the `supabase/` folder, its tsconfig/vitest entries, README/docs, risk tiers, run.md/solo.md.

### Follow-ups (not in this diff, R7)
- **repo.http hardening** (T-014 review/security): UUID guard and `encodeURIComponent` on `remove`/`wear` paths,
  response-shape checks in `repo.http.ts`, `requestId` UUID check.
- **Local-mode banner / retry screen** on a non-local host when the probe fails (A2, if the default is kept).
- **Cloudflare Access sign-out link** in the header (A5).
- `/solo`: Supabase wording in `.claude/agents/*` (database-optimizer, reviewer, planner, implementer,
  software-architect, security auditor).
- Remove `src/lib/legacySession.ts` after a few releases.
- Move `react`/`react-dom` to `devDependencies` to slim the image (T-015 A9).
- Orchestrator on `main` (D16): `work/ming-todo.md` — mark M-1, M-2, M-5, M-8, M-10 and the F-101 part of M-6
  obsolete; in M-14 remove "with A1 option A the Supabase repo secrets stay as they are" and "The app on the phone looks
  as today (Supabase mode, A1 option A) until T-014"; add the two A6 items. Backlog: mark F-001, F-002, F-006, F-101,
  F-102 and the Supabase parts of T-005.x/T-010/F-701/F-702 superseded; record the archive SHA in T-010, F-701, T-005.1.
  Optionally a decision row "D27: Supabase removed (T-016)" if Ming wants one.

## Appendix — CLAUDE.md wording for Ming (proposal only; Ming edits CLAUDE.md)
- **Intro paragraph:** "Personal wardrobe tracker ("Tủ đồ của tôi"). UI exported from Figma Make; Node API (`server/`)
  over the shared self-hosted Postgres (D23), served in the same image as the SPA; Cloudflare Access in front, no in-app
  login. Outside the Node server (`pnpm dev`, Figma Make preview) it runs in local mode (localStorage + demo items),
  which the Figma Make preview depends on."
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
  Server secrets (`DATABASE_URL`, future AI/Drive keys) live only in the host env file / deployment repo and are read
  only by `server/`."
- **R4:** "Photos are private: stored and served only through the backend (Google Drive, T-005 re-plan); the browser
  never holds storage credentials."
- **R5:** "… come from `wear_logs` (the `items_with_stats` view in `db/migrations/`)."
- **Risk tiers, High:** replace `supabase/migrations/**` and `src/features/auth/**` with `db/migrations/**`, `server/**`
  (including `server/access.js`, the Access JWT check), `Dockerfile`, `scripts/check-image.sh`, `deploy/**` and the
  release/deploy workflows.
