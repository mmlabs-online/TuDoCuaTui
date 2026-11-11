# Ming's to-do (things only Ming can do)

Agents read this before `/run`. A ticket waits on an item only if it lists the item in `Needs Ming`.
Tick (`- [x]`) and date items when done. `/run` adds plan-approval and escalation items here.

## Always
- Review and merge the PRs that `/run` opens (`/status` lists them). Agents never merge.

## Setup
- [ ] **M-1 — Set up TuDo on the stoktok Supabase project** (dashboard only, D17; never the CLI against it).
      **Deferred (D18, 2026-11-09):** run it when you are ready to use Supabase mode; until then TuDo's Supabase mode
      has no tables. Auth stays exactly as stoktok has it: no TuDo-specific sign-up or user changes.
      1. SQL Editor, read-only pre-checks: `select to_regclass('public.tudo_items'), to_regnamespace('tudo_private');`
         must return two nulls. `select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;` and note
         the result. Check that no Storage bucket `wardrobe` exists yet (note it if one does).
      2. Paste `supabase/migrations/20261106000000_init.sql` and run it, then
         `20261107120000_rls_hardening.sql` and run it, in that order. If either fails, stop and report the error;
         do not re-run part of a file.
      3. Auth → URL Configuration: no change needed for TuDo (password login, D19). Do not change the Site URL.
      4. Auth: no changes (D18). Log in to TuDo with your existing stoktok account.
      5. Put the stoktok Project URL and anon key in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- [ ] **M-2 — Smoke test** (after F-001 is merged and M-1 is done): run `docs/qa/smoke-test.md` once in Supabase
      mode; fill in its results table; file each failure with `/ticket`.
- [ ] **M-3 — Branch protection** (after F-003 is merged): GitHub → Settings → Branches → `main`: require the `ci` check.
- [ ] **M-4 — Home-server deploy** (after T-007 is merged, D20): follow README → "Deploy".
      1. Docker Hub: create repo `mingming21400/tudocuatui` (public by default); the token in `DOCKERHUB_TOKEN` needs
         Read & Write on it.
      2. Repo secrets `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `DEPLOY_REPO_TOKEN`: done 2026-11-09.
      3. Setup PR on `mmlabs-online/deployment` (not a `release/*` branch): copy the two files from
         `deploy/deployment-repo/` and add the CODEOWNERS line (see its README). Merge it.
      4. Cloudflare: the published application `tudocuatui.mmlabs.online` points to `http://tudocuatui:3000`.
      5. `git push origin main:release/v0.1.0`, then review and merge the PR it opens on the deployment repo.
      6. Open `https://tudocuatui.mmlabs.online` on a phone: local mode (demo items, no login); a deep URL also loads.
      7. After M-1: add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon/publishable key only),
         release `v0.1.1`, merge its deployment PR, log in on the phone with your stoktok email + password (D19).
      8. If a Cloudflare Pages project `tudocuatui` exists from the old M-4, delete it.
      Under D23 this flow continues in M-12 (database) and M-14 (first Node release). Steps 5-7 are superseded by
      M-14 (D23/D26).
- [ ] **M-5 — Verify the migrations** (after M-1), read-only in SQL Editor:
      `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name like 'tudo\_%' and grantee in ('anon','authenticated') order by 1,2,3;`
      Expect SELECT, INSERT, UPDATE, DELETE for `authenticated` on the 4 tables, SELECT on the view
      `tudo_items_with_stats`, and no `anon` rows.
      `select relname, relrowsecurity from pg_class where relname like 'tudo\_%' and relkind = 'r';` Expect true on all 4.
      Settings → API → Exposed schemas must not list `tudo_private`.
      `select has_table_privilege('anon','public.tudo_items','select'), has_table_privilege('anon','public.tudo_items_with_stats','select'), has_schema_privilege('anon','tudo_private','usage'), has_function_privilege('anon','tudo_private.tudo_owns_location(uuid)','execute'), has_function_privilege('anon','public.tudo_set_updated_at()','execute'), has_function_privilege('authenticated','public.tudo_set_updated_at()','execute');` Expect all `false`.
- [ ] **M-6 — Phone checks** after each of these merges, on an iPhone and an Android phone: F-202.1 (photo
      upload), F-1002 (camera / library buttons), F-603 (30 photos), F-101 (login screen, dark mode).
      Write problems as `/ticket`.

- [ ] **M-8 — Regenerate DB types once with the pinned script** (after F-002 is merged; needs Docker Desktop, Git Bash on Windows).
      (F-002's plan calls this "M-7"; renumbered because T-005.1 already uses M-7.)
      From the repo root on an up-to-date `main`:
      `npx supabase start` → `npx supabase db reset` → `pnpm db:types` → `npx supabase stop` (plain stop, no flags).
      Then `pnpm typecheck && pnpm format:check && pnpm test && pnpm build`.
      Expected diff in `src/types/database.ts`: the `graphql_public` blocks disappear from `Database` and `Constants`
      (the script now passes `--schema public`), plus possibly small changes in the helper types from the pinned CLI version.
      Anything else (a `tudo_*` table/column/enum change) means the committed types had drifted: tell Annie.
      If there is a diff and the checks pass, commit it as `solo: regenerate DB types with pinned CLI` (or ask Annie to /solo it).
      Do not run it while `scripts/test-db-shared.sh` is mid-run.
- [ ] **M-9 — Rotate the cloudflared tunnel token** that is committed in plaintext in `mmlabs-online/deployment`
      `proxy/compose.yml` (found in T-007): create a new token, move it out of the repo, revoke the old one.
- [ ] **M-10 — Deploy the AI settings function (T-009)** (superseded by M-14: D23/D26, no Supabase function deploy), after M-1 and after T-009 is merged. Needs `tudo_set_updated_at`
      from the init migration. Dashboard only for SQL and secrets (D17); the one CLI step is D22.
      1. Pre-checks (read-only): SQL Editor `select to_regclass('public.tudo_ai_settings'), to_regclass('public.tudo_ai_calls');`
         gives two nulls; Edge Functions has no `tudo-ai-settings`; Secrets has no `TUDO_AI_KEK` / `TUDO_ALLOWED_ORIGINS`.
         Also check Dashboard → Edge Functions → Secrets has no `ANTHROPIC_*` secret (e.g. `ANTHROPIC_CUSTOM_HEADERS`): the SDK still reads that one (T-009 security review).
      2. Migration: paste `supabase/migrations/20261110000000_tudo_ai_settings.sql` into the SQL Editor and run it once.
         If it fails, stop and report; do not re-run part of it.
      3. Verify (read-only): `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name in ('tudo_ai_settings','tudo_ai_calls') order by 1,2,3;`
         only `service_role` (and owner) rows, no `anon` / `authenticated`.
         `select relname, relrowsecurity from pg_class where relname in ('tudo_ai_settings','tudo_ai_calls');` both true.
         `select count(*) from pg_policies where tablename in ('tudo_ai_settings','tudo_ai_calls');` gives 0.
      4. Secrets (Dashboard → Edge Functions → Secrets; never `secrets set --env-file`):
         `TUDO_AI_KEK` = output of `openssl rand -base64 32`; keep a copy in the password manager BEFORE saving it
         (if lost, every user must re-enter their key). `TUDO_ALLOWED_ORIGINS` = `https://tudocuatui.mmlabs.online,http://localhost:8443`.
      5. Deploy (D22): `npx --yes supabase@3.0.0 login`, then
         `npx --yes supabase@3.0.0 functions deploy tudo-ai-settings --project-ref <stoktok ref>`.
         Add `--use-api` if `functions deploy --help` lists it (no Docker); otherwise Docker Desktop must be running.
         Always name the function. Never run `link`, `db ...`, or a deploy without a name.
         Then Dashboard → Edge Functions → `tudo-ai-settings` → "Verify JWT" shows off.
      6. Optional smoke test before T-010: log in to TuDo, DevTools → Application → Local Storage → `sb-<ref>-auth-token` →
         copy `access_token` (valid 1 h). Never put a token or key on a command line (it lands in shell history and `ps`):
         `read -rs T` (paste the token), `read -rs K` (paste the Claude key, only for `save`), then send the JSON body on stdin and the
         token via a header file on stdin too, e.g.
         `printf '%s' "$K" | jq -Rs '{action:"save",provider:"claude",model:"<model id>",apiKey:.}' | curl -s -X POST https://<ref>.supabase.co/functions/v1/tudo-ai-settings -H @<(printf 'Authorization: Bearer %s' "$T") -H "apikey: <anon key>" -H "Content-Type: application/json" --data-binary @-`
         Same for `get`
         (`jq -n '{action:"get"}' | curl ...`; shows `••••` + last 4), `test`, `deleteKey`. Finish with `unset K T`.
         Without the `Authorization` header expect 401. Gemini is not selectable yet (empty model list).
      7. Local DB tests (needs Docker): `npx supabase db reset && npx supabase test db`, then `bash scripts/test-db-shared.sh`;
         all files must pass, including `supabase/tests/rls_ai_settings.sql`.
      8. Optional: regenerate types with M-8 (`src/types/database.ts` has the two new tables added by hand).
      Rollback: the commented block at the top of the migration, plus Dashboard → delete function `tudo-ai-settings`.

- [x] (2026-11-11, confirmed by Ming) **M-11 — Cloudflare Access for TuDo** (D23, before data goes on the new backend): Cloudflare Zero Trust →
      Access → Applications → Add a self-hosted application for `tudocuatui.mmlabs.online` (same as stoktok), policy
      "Allow" for your email only (one-time PIN). Check that an incognito window gets the Access login page, and that
      `/version.txt` is also behind it. Without this, anyone with the URL can read and change the wardrobe.
- [x] (2026-11-11, mmlabs-online/deployment#38 merged; deploy-postgres run 42960617315 green) **M-12 — Register the TuDo database** (T-011, D23/D24; after T-011 is merged). In a clone of
      `mmlabs-online/deployment` on an up-to-date `main`:
      1. `git switch -c postgres/add-tudocuatui`. The name must NOT start with `release/`, or `pr-scope` fails.
      2. `bash postgres/scripts/add-app-db.sh tudocuatui`. Expect `generated …/tudocuatui.password` and
         `added tudocuatui …`. Never `cat`, paste or print the password file.
      3. Copy `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` from TuDo `main` over the deployment
         repo's copy. Do NOT copy `apps/tudocuatui/compose.yml` yet: it goes in with the first Node release (T-015).
      4. `git status` must show exactly `postgres/config/databases`, `postgres/secrets/apps/tudocuatui.password` and
         `.github/workflows/deploy-tudocuatui.yml`. Then
         `git add postgres/config/databases postgres/secrets/apps/tudocuatui.password .github/workflows/deploy-tudocuatui.yml`,
         `git commit -m "postgres: add tudocuatui database; deploy-tudocuatui writes DATABASE_URL"`, push, open the PR.
         The repo is private; committing the password file there is intended (deployment README, "Secrets").
      5. Merge. Only `deploy-postgres` runs (nothing under `apps/tudocuatui/` changed). Wait for green and the log
         line `role and database 'tudocuatui' ready`. If it fails in the `app databases` step, read which app failed.
      6. Verify on the Mac (read-only, no password):
         - `docker compose -p postgres -f ~/srv/postgres/compose.yml exec postgres psql -U postgres -tAc "select datname from pg_database where datname='tudocuatui'"` returns `tudocuatui`.
         - same command with `-tAc "select rolname, rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname='tudocuatui'"` returns `tudocuatui|f|f|f`.
         - `grep -x tudocuatui ~/srv/postgres/config/databases` matches.
      7. Later (T-015): the first Node release PR also gets `apps/tudocuatui/compose.yml` from the draft (T-015 adds
         its own M-item).
      8. Password rotation: change the file in the deployment repo (a `postgres/**` merge), then run
         `deploy-tudocuatui` with `workflow_dispatch` from `main` so the env file is rewritten.
- [x] (2026-11-11) **M-13 — Cloudflare Access values for the Node server** (D23, after M-11, before T-015): in Zero Trust →
      Access → Applications → TuDo → Overview, copy the **Application Audience (AUD) Tag**, and from Settings →
      Custom Pages the **team domain** (`<team>.cloudflareaccess.com`). Paste both into T-015's *Notes / answers
      from Ming*. Neither is secret. The Node server refuses to start in production without them.
- [x] (2026-11-10) **PR #28 (T-009)** — merged by Ming. Its Supabase parts (Edge Function, migration) are not deployed under D23; T-016 removes or ports them.

- [ ] **M-14 — First Node release** (D26, after T-015 is merged and M-11, M-12, M-13 are done; with A1 option A the
      Supabase repo secrets stay as they are):
      1. From an up-to-date `main`: `git push origin main:release/vX.Y.Z` (next minor, for example `v0.2.0`). Wait for
         `release` to go green. It opens `release/tudocuatui-vX.Y.Z` on the deployment repo. Do not merge it yet.
      2. In a clone of `mmlabs-online/deployment`: `git fetch origin && git switch release/tudocuatui-vX.Y.Z`. Copy
         `deploy/deployment-repo/apps/tudocuatui/compose.yml` from TuDo `main` over `apps/tudocuatui/compose.yml`,
         verbatim.
      3. `git diff --name-only origin/main...HEAD` plus the working tree must show exactly
         `apps/tudocuatui/compose.yml` and `apps/tudocuatui/release.env`. Then
         `git commit -am "tudocuatui: Node server compose (T-015)"` and `git push`. `pr-scope` must be green.
      4. Merge the PR as one push to `main` (squash or merge commit). Never merge the two files separately: the
         rollback pairs them.
      5. Watch `deploy-tudocuatui`: `pull` reports `migrate=true`, then `backup`, `migrate` and `deploy` succeed, and
         the PR comment says `deployed`.
      6. Check: an incognito window gets the Access login page; signed in, `/version.txt` is `vX.Y.Z`;
         `/api/locations` returns 200 JSON (`{"locations":[...]}`). A 401 means JWKS egress or the AUD/team domain is
         wrong: check `docker compose -p tudocuatui logs --tail 50 tudocuatui` on the Mac (never print the env file).
         The app on the phone looks as today (Supabase mode, A1 option A) until T-014.
      7. If the comment says `restored`: nginx is running again with its own compose, migrations are kept (harmless).
         Read `docker logs`, tell Annie, and do not retry by hand. A deliberate rollback later is a non-`release/` PR
         on the deployment repo that reverts both files in `apps/tudocuatui/`.

- [ ] **M-15 — Connect Google Drive for TuDo photos** (D27, after T-005.1 and T-005.5 are merged): follow the runbook T-005.1 adds — create the OAuth client "TuDoCuaTui" in Ricotdin's Google Cloud project (published "In production"), create the `TuDoCuaTui/` folder, run the connect script locally, store the four values where the runbook says (never in chat or the TuDo repo), redeploy, run the smoke command.

## Plan approvals and escalations
<!-- /run appends items here, e.g. "- [ ] Approve plan for F-101: work/tickets/F-101/plan.md" -->
- [ ] (2026-11-11) Approve plan for T-005.1 (branch `claude/loving-fermi-t90upb`): work/tickets/T-005.1/plan.md — Node server ↔ Google Drive; confirm A1–A17 (A2, A4, A5, A6 are the real choices)
- [ ] (2026-11-11) Approve plan for T-016 (branch `claude/loving-fermi-t90upb`): work/tickets/T-016/plan.md — remove Supabase; confirm A1–A6
- [x] (2026-11-11) Approve plan for T-015 (branch `claude/loving-fermi-t90upb`): work/tickets/T-015/plan.md — Node image + deploy switch; confirm A1–A15 (A1: keep or drop `VITE_SUPABASE_*` build args)
- [x] (2026-11-11) Approve plan for T-013.2 (branch `claude/loving-fermi-t90upb`): work/tickets/T-013.2/plan.md — `/api` endpoints; confirm new assumptions A15–A27 (A8–A14 already approved)
- [x] (2026-11-10) Approve plan for T-013 (branch `claude/loving-fermi-t90upb`): work/tickets/T-013/plan.md — slice T-013.1 (Node server shell, static SPA, health, Cloudflare Access guard); confirm A1–A14 (A8–A14 fix the T-013.2 `/api` contract)
- [x] (2026-11-10) Approve plan for T-012 (branch `claude/loving-fermi-t90upb`): work/tickets/T-012/plan.md — Postgres schema + `server/migrate.js` runner; confirm assumptions 1–10 (new `pg` dependency; is there real Supabase data to move?)
- [x] (2026-11-10) Approve plan for T-011 (branch `claude/loving-fermi-t90upb`): work/tickets/T-011/plan.md — `tudocuatui` DB on shared Postgres + migrate-guarded deploy drafts; confirm A1–A9 and decide P1 (R2/RLS for the D23 backend)
- [x] (2026-11-10) Approve plan for T-009 (branch `claude/loving-fermi-t90upb`): work/tickets/T-009/plan.md — AI settings storage + encrypted key + `tudo-ai-settings` function; confirm C1–C9 and A1–A12
- [x] (2026-11-10) Approve plan for T-008 (branch `claude/loving-fermi-t90upb`): work/tickets/T-008/plan.md — release version in the UI footer + version.txt; confirm assumptions 1–9
- [x] (2026-11-10) Approve plan for T-007 (branch `claude/loving-fermi-t90upb`): work/tickets/T-007/plan.md — self-host via Cloudflare Tunnel + stoktok-style release/deploy; confirm assumptions A1–A11
- [x] (2026-11-09) Approve plan for T-006 (branch `claude/loving-fermi-t90upb`): work/tickets/T-006/plan.md — email + password login, magic link removed; confirm assumptions A1–A5
- [x] (2026-11-07) Approve plan for T-003 (branch `ticket/T-003`): work/tickets/T-003/plan.md — new RLS migration; changes vs ticket listed as C1–C9
- [x] (2026-11-08) Approve plan **Revision 2** for T-003 (branch `ticket/T-003`): work/tickets/T-003/plan.md — attempt 1 hit policy recursion; fix uses a `private.owns_location()` helper; new changes C10–C13
- [x] (2026-11-08) Approve plan for T-004 (branch `ticket/T-004`): work/tickets/T-004/plan.md — shared stoktok DB, `tudo_` prefix, explicit grants; changes vs ticket C1–C13
- [x] (2026-11-08) Approve plan for F-007 (branch `ticket/F-007`): work/tickets/F-007/plan.md — drops `_redirects`, see "Changes vs ticket scope"
- [x] (2026-11-07) Approve plan for F-101 (branch `ticket/F-101`): work/tickets/F-101/plan.md
