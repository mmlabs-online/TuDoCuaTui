# Consult — software-architect — T-016 (2026-11-11)

I only read files. I did not open any `.env` file.

## Findings

1. **Supabase is still wired into the startup path.** `main.tsx` calls `detectMode()`, which imports `@/lib/supabase`. That module calls `createClient()` with `persistSession`, `autoRefreshToken` and `detectSessionInUrl` turned on, so `@supabase/supabase-js` ends up in the entry chunk whatever the mode. Its other consumers:
   - `useWardrobe.ts` (Supabase branch and `signOut`)
   - `repo.ts` (`createSupabaseRepo`, `PHOTO_BUCKET`)
   - `aiSettings.ts`
   - `AuthGate.tsx`
   - `Root.tsx`
   - `App.tsx:89` (`showSignOut={mode==="supabase"}`)
   - `Header.tsx` (the sign-out button)
2. **The API repo depends on Supabase types.** `repo.http.ts` uses `rowToItem`/`itemToRow`. `mappers.ts` takes its `ItemRow`, `ItemInsert` and `Enums` from `src/types/database.ts`, which is a 465-line generated file. You cannot delete `database.ts` until these types move (T-014 already noted this). The enum values match `db/migrations/20261110120000_init.sql` (`item_category`, `item_status`, seasons check), so a short hand-written API row type can replace them.
3. **T-009 is merged, but its client code has no caller.** Nothing calls `getAiSettingsRepo()`. Its code falls into three groups:
   - **Pure and backend-neutral:** `src/shared/ai/*` (catalog, errors, validate, mask, plus tests and `boundary.test.ts`).
   - **Supabase-only:** `supabase/functions/**` (Deno, service role, `store.ts` written against the supabase-js query builder), `supabase/migrations/20261110000000_tudo_ai_settings.sql`, `supabase/tests/rls_ai_settings.sql` and `src/data/aiSettings.ts`.
   - **Portable TS that is not Node code:** `_shared/core/{crypto,settingsHandler,rateLimit,providerErrors,gemini,http}.ts`. `server/` is JS with JSDoc, so this cannot simply be moved over.

   M-10 was superseded, so the function and migration were never deployed.
4. **Full inventory.** Every path below is under `/home/user/TuDoCuaTui`. Line counts are given where they show the size.
   - **Source:**
     - `src/lib/supabase.ts`
     - the Supabase half of `src/data/repo.ts` (about 190 lines)
     - `src/data/aiSettings.ts` and its test
     - `src/features/auth/{AuthGate,authMessages}.tsx/.ts` and their tests
     - `src/Root.tsx` and `Root.test.tsx`
     - `src/types/database.ts`
     - `src/test/fakeSupabase.ts`
     - `src/data/repo.supabase.test.ts` (670 lines)
     - the Supabase cases in `mode.test.ts`, `useWardrobe.test.tsx` and `mappers.test.ts`
     - `src/test/env.test.ts`
     - `src/shared/ai/mirror.test.ts`
     - the mirror header comments in `src/shared/ai/*.ts`
     - the "Supabase mode" wording in `serialize.test.ts:147` and `types/item.ts:21`
     - `src/data/photos.ts`: only the Supabase repo uses it
   - **Configuration:**
     - `package.json`: the `@supabase/supabase-js` dependency and the `db:types` script
     - `tsconfig.json`: includes `supabase/functions/_shared/{ai,core}`
     - `vitest.config.ts`: `VITE_SUPABASE_*` env, coverage for `supabase/functions/_shared/core/**` and `authMessages.ts`
     - `.env.example`: only Supabase variables
     - `.dockerignore` and `.gitignore`: one line each
   - **`supabase/`:** config.toml, 3 migrations, 4 pgTAP tests, functions and `.gitignore`.
   - **Scripts:** `check-public-supabase-env.sh` and its `.test.sh`, `test-db-shared.sh`, and the bundle-mode/URL-argument section of `check-image.sh`.
   - **CI and release:**
     - `ci.yml`: the `check-public-supabase-env.test.sh` step and the `ci-supabase` dummy build
     - `release.yml`: secrets in the guard env, the guard call, the `mode` output, `$MODE` in the PR body, the build args, and `SUPABASE_URL` in the verify step
     - `Dockerfile`: the two ARGs and the comment
     - `risk-tiers.yml`: `supabase/migrations`, `supabase/functions`, `src/lib/supabase.ts` and the scripts glob
   - **Docs:**
     - `README.md`: about 27 mentions, including the "Set up Supabase", pgTAP and Deploy sections
     - `docs/qa/smoke-test.md`: entirely about Supabase
     - `docs/data-model.md:3`
     - `docs/feature-list.md` and `docs/plan-M1.md`: historical text
     - `.claude/commands/run.md:46`: the security trigger list names only Supabase paths
     - `.claude/agents/*`: Supabase wording
5. **`pnpm dev` (`dev=true`) already skips the probe.** After T-016, dev and the Figma Make preview are always local mode, which satisfies R1. Nobody can use a backend from `pnpm dev` any more; API mode only runs under the Node server.
6. **Nothing is left in Supabase.** M-1 was never done (deferred under D18), and M-4 step 7 and M-10 were superseded. Ming confirms no data migration is needed, so `supabase/migrations` records no applied state in any real project.

## Recommendations

**R-A. Delete instead of keeping as history.** Delete all of `supabase/`: migrations, tests, functions and config.
- Git history is the archive. Record the last pre-T-016 commit SHA in the T-016 handoff and in the notes of T-010, F-701 and T-005.1, so later re-plans can port from it. (AC1, D25: "Supabase migrations keep the old R2 until T-016 removes them".)
- Do not move it into an `archive/` folder: it would still trip the greps, tsconfig and coverage.
- Also delete:
  - `scripts/test-db-shared.sh`
  - `scripts/check-public-supabase-env.sh` and its test
  - `docs/qa/smoke-test.md` (the new smoke check is M-14 step 6)
  - `src/types/database.ts`
  - `src/lib/supabase.ts`
  - `src/test/fakeSupabase.ts`
  - `repo.supabase.test.ts`
  - `src/features/auth/**`
  - `Root.tsx` and its test
  - `aiSettings.ts` and its test
  - `mirror.test.ts`
  - `src/data/photos.ts`: it would be dead code, and T-005 re-plans uploads on Drive from git history anyway.

**R-B. T-009 artifacts: keep `src/shared/ai/*` and `boundary.test.ts`, delete the rest.**
- Keep `src/shared/ai/*` with its tests. It is Supabase-free and encodes Ming's D21 catalog. The T-010 Settings UI needs it whatever the backend is.
- Update the four header comments.
- In `boundary.test.ts`, drop the `database.ts` exclusion and keep the R3 guard.
- Delete `aiSettings.ts` (including `getAiSettingsRepo`). Making it mode-aware would need an `/api/ai-settings` endpoint that does not exist yet, which is out of scope under R7. T-010 adds an `api` implementation when it is re-planned.
- Delete `supabase/functions/_shared/core` too. Porting it to Node belongs to the T-010/F-701 re-plan.
- Option B, if Ming prefers: delete `src/shared/ai` as well, since it currently has no runtime caller.

**R-C. New mode set, R1.**
- `DataMode = "local" | "api"` (also `WardrobeRepo.mode`).
- `pickMode(apiAvailable) → api | local`.
- `detectMode`: drop `hasSupabase`. Dev builds return `local`; otherwise probe `/healthz`, retry once on error, and fall back to `local`. Keep the opaqueredirect→api behaviour.
- `useWardrobe`: the default mode becomes `"local"`. Drop the Supabase branch and `signOut`.
- Delete `Root.tsx` and have `main.tsx` render `<App mode={mode}/>` directly. Without a login gate the extra wrapper has no purpose.
- Remove `showSignOut`/`onSignOut` from `Header`.
  - A Cloudflare Access sign-out link (`/cdn-cgi/access/logout`) would be a separate UI follow-up, not part of this ticket.
- Move the row types into `src/data/mappers.ts`, or a small `src/data/apiTypes.ts`:
  - a hand-written `ItemRow`/`ItemInsert` with string-literal unions for category, status and season
  - names matching `server/items.js`
  - `mappers.test.ts` updated to import them
- Keep `Item.photoPath` and the `primary_photo_path` mapping, because the API already returns `primary_photo_path: null`. Change the comment.
- Remove the dead PostgREST code branches `23505`/`42501` in `useWardrobe.message`, but only if the tests stay meaningful. This is optional.

**R-D. Users who still have a Supabase session (in T-016).**
- Add a pure helper, for example `src/lib/legacySession.ts`: `clearLegacyAuthKeys(storage)` removes every key matching `/^sb-.+-auth-token(-code-verifier)?$/`.
- Call it once in `main.tsx` before `detectMode`.
- Unit-test that it leaves `tu-do-items` (local-mode data) and the theme key untouched.
- Why it matters: the Supabase project is shared with stoktok (D17), so a TuDo-origin refresh token is a stoktok credential. With the client removed, nothing would ever refresh or delete that key.
- Mark the helper for removal in a later release.
- Clearing the key does not revoke the token. See the matching Ming item under Open questions.

**R-E. Build, CI and release (T-015 A1).**
- **Dockerfile:** drop the two ARGs and the comment.
- **release.yml:**
  - drop both secrets from the guard env, the guard call and the `mode` output
  - replace `$MODE` in the PR body with fixed text ("Node server, API mode")
  - drop the build args except `VITE_APP_VERSION`
  - drop the `SUPABASE_URL` env and argument
- **check-image.sh:**
  - accept exactly one argument
  - replace the "bundle mode" section with a regression guard: fail if `grep -rqi supabase $ROOT/assets`
  - keep the `sb_secret_` scan or drop it (it is harmless)
- **ci.yml:**
  - remove the `check-public-supabase-env.test.sh` step
  - keep the second image build, still needed to check `VITE_APP_VERSION=v0.0.0`; rename it `ci-version` and drop its Supabase args
  - call `check-image.sh tudocuatui:ci-version` with `EXPECTED_VERSION`
  - fix the comments
- **package.json:** remove the dependency and `db:types`. The lockfile is regenerated.
- **tsconfig and vitest:** remove the `supabase/` includes, the coverage entries and the env entries.

**R-F. Tests.**
- **Delete:** `repo.supabase.test.ts`, `fakeSupabase.ts`, `AuthGate.test.tsx`, `authMessages.test.ts`, `Root.test.tsx`, `aiSettings.test.ts`, `mirror.test.ts`, `supabase/functions/**/*.test.ts`, `check-public-supabase-env.test.sh`.
- **Adjust:**
  - `mode.test.ts`: two-mode matrix
  - `useWardrobe.test.tsx`: rewrite the Supabase cases as api/local, or drop them
  - `mappers.test.ts`: new types
  - `env.test.ts`: keep the TZ test, replace the "supabase is null" test with a no-`VITE_SUPABASE` assertion, or drop it
  - `boundary.test.ts`
  - `serialize.test.ts` wording
- **Add:** the legacy-session cleanup test.
- **Coverage:** `src/data/**` must stay at or above 80% after the deletions. Run `pnpm test:coverage`.

**R-G. Doc and configuration edits that belong in the diff.**
- **README:** rewrite Modes, Deploy and the file table; drop "Set up Supabase" and the pgTAP section.
- **`docs/data-model.md`:** fix line 3.
- **`docs/feature-list.md` and `plan-M1.md`:** add one header note ("backend superseded by D23") instead of editing each F-item.
- **`.env.example`:** keep the file because `boundary.test.ts` reads it. Comment: "The browser needs no variables; server env is documented in `server/README.md`."
- **`risk-tiers.yml`:** replace the Supabase entries with `server/**`, `db/migrations/**`, `Dockerfile`, `scripts/check-image.sh` and `deploy/**` (this was already a T-012/T-015 follow-up).
- **`.claude/commands/run.md:46` security trigger list:** replace the Supabase/auth paths with `server/`, `db/migrations/`, `Dockerfile`, `scripts/check-image.sh` and `deploy/`. Otherwise backend diffs never trigger a security review automatically. If editing agent and command files needs Ming's sign-off, raise it at plan approval.
- **Leave for a `/solo` follow-up:** the Supabase wording in the agent descriptions (database-optimizer, reviewer, planner).

**R-H. CLAUDE.md wording to propose (Ming edits it).**
- **Intro:** "Node API (`server/`) over the shared self-hosted Postgres (D23), served in the same image as the SPA; Cloudflare Access in front, no in-app login. Outside the Node server (`pnpm dev`, Figma Make preview) it runs in local mode (localStorage + demo items)."
- **Stack:** replace the Supabase bullet with "Backend: Node 22 `server/` (`pg`, `jose`), migrations in `db/migrations/` (applied by `node server/migrate.js`); client data layer `src/data/` (`repo.http.ts`, local repo)." Change the Hosting line to D20/D26.
- **R1:** "…with both a local and an API (`repo.http.ts`) implementation. Components never call `fetch('/api…')` directly. Mode is detected at startup via `/healthz`; without the Node server the app runs on localStorage + demo items."
- **R2:** the D25 text.
- **R3:** "Nothing secret reaches the browser. No `VITE_*` variable carries a secret (today only `VITE_APP_VERSION`). Server secrets (`DATABASE_URL`, future AI/Drive keys) live only in the host env file / deployment repo and are read only by `server/`."
- **R4:** "Photos are private: stored and served only through the backend (Google Drive, T-005 re-plan); the browser never holds storage credentials." Alternatively, mark it "pending T-005".
- **R5:** change "view `items_with_stats`" to "the `items_with_stats` view in `db/migrations`".
- **Risk tiers:** replace `supabase/migrations/**` and `src/features/auth/**` with `db/migrations/**`, `server/access.js` (Access JWT check), `server/**`, Dockerfile and the release/deploy workflows.

**R-I. Ming-todo items made obsolete.** The orchestrator updates these on `main` (D16).
- **Obsolete:**
  - M-1, M-2, M-5, M-8, M-10
  - M-4 step 7 (already marked superseded)
  - the F-101 part of M-6
- **M-14:** remove the sentences "Supabase repo secrets stay" and "phone looks as today (Supabase mode)".
- **New item:** delete the repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` after the merge.
- **Ticket text:** "Close/park PR #28" is out of date, because PR #28 was merged on 2026-11-10.
- **Backlog housekeeping, not in this diff:** F-001, F-002, F-006, F-101, F-102 and the Supabase parts of T-005.x, T-010, F-701 and F-702 become superseded.

**R-J. Items from the T-014 review that stay out of T-016 (R7).**
- In T-016: stop creating the client, clear the `sb-*` keys, remove `getAiSettingsRepo`.
- Out of T-016: the UUID guard and `encodeURIComponent` on `remove`/`wear`, response-shape checks in `repo.http.ts`, and the `requestId` UUID check. They are hardening of the API repo, not Supabase removal. Put them in one small follow-up ticket ("repo.http hardening").

**R-K. Splitting.** Keep it as one ticket.
- Non-test additions and changes come to about 230–300 lines: mappers types ~25, mode/useWardrobe/main/Header/App ~40, legacy cleanup ~15, release/ci/check-image/Dockerfile ~50, configuration ~15, README and docs ~80, risk tiers and run.md ~15. Everything else is deletion, which counts less.
- Splitting would also be awkward. The `src` removal and the CI/check-image change must land together: once the bundle no longer reads `VITE_SUPABASE_*`, the `ci-supabase` check would fail. Only `supabase/` plus docs could split cleanly.
- If the plan goes over about 400 lines, use this fallback split:
  - **T-016.1:** `src`, deps, Docker/CI/release/scripts, tsconfig/vitest for `src`.
  - **T-016.2:** the `supabase/` folder, its tsconfig/vitest entries, README/docs, risk tiers, run.md.
- Ask the implementer for structured commits (runtime → build/CI → folder → docs) so the review is easier.

**Bundle size.** Removing `@supabase/supabase-js` (auth, postgrest, storage, functions, realtime) from the entry chunk should save about 40–60 KB gzip; this is my estimate, not a measurement. The plan should record the `pnpm build` asset sizes before and after. The runtime image also loses the package from its production `node_modules`.

## Risks

1. **A failed probe on production silently falls back to local mode.** This happens after two `/healthz` failures, for example on a network blip. The user then sees demo data and their edits go to localStorage instead of the server, with no indicator. Until now the fallback was Supabase mode, so this failure is new in T-016. Possible mitigations, both outside this ticket unless Ming says otherwise:
   - a local-mode banner ("Dữ liệu chỉ lưu trên máy này")
   - on a failed probe, show a retry screen instead of local mode when the host is not localhost or a Figma origin
2. **Clearing `sb-*` keys removes the local copy but does not revoke the refresh token.** If Ming ever signed in to TuDo in Supabase mode (localhost or a release built with the secrets), that stoktok-project token stays valid until it expires or is revoked.
3. **The plan must not touch `tu-do-items`.** Production may hold local-mode data from the nginx era in that key, so clearing it would lose data. Moving it to the API (JSON export and import) is a separate concern.
4. **Without the run.md update, security review stops triggering automatically for backend diffs.** The trigger list currently names only Supabase and auth paths.
5. **T-016 depends on T-014 and T-015 only, not M-14.** If T-016 merges first, the M-14 release is the first Supabase-free build. That is fine, but the M-14 text must be updated (R-I).
6. **The lockfile diff is large.** It is generated, so the reviewer should not count it as plan scope.

## Open questions for Ming

1. AI code: keep `src/shared/ai` (recommended) or delete it as well (R-B)?
2. Fallback on a failed probe in production: accept local mode for now with a follow-up banner or retry ticket, or include a fix in T-016 (Risk 1)?
3. Did any `tudo_*` object, the `tudo-ai-settings` function or the `TUDO_AI_KEK` secret ever reach the stoktok project? Expected answer: no (M-1 and M-10 were never done). If yes, add a Ming cleanup item, using the rollback SQL from git history.
4. Did Ming ever sign in to TuDo in Supabase mode? If yes, add a Ming item to sign out those sessions in the stoktok project.
5. May T-016 edit `.claude/commands/run.md`, its security trigger list (R-G), or should that be a separate `/solo`?
6. A Cloudflare Access sign-out link in the header: wanted as a follow-up?

---

**Orchestrator note (2026-11-11):** On Q4 — yes: earlier in the project Ming signed in to the production TuDo
(nginx release built with the stoktok `VITE_SUPABASE_*` secrets) with his stoktok account, then hit "Could not
find the table public.tudo_locations" (M-1 migrations were never run). So a TuDo-origin stoktok refresh token
likely exists in that browser; R-D (clear `sb-*` keys) applies, and a Ming item to sign out other sessions in the
stoktok project is reasonable. On Q3 — the `tudo_*` tables were never created (that error), and M-10 was never done.
