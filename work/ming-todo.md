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

- [x] (2026-11-11, v0.2.0 live via mmlabs-online/deployment#40; deploy run 42981344358 green: backup → migrate → deploy) **M-14 — First Node release** (D26, after T-015 is merged and M-11, M-12, M-13 are done; with A1 option A the
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

- [ ] **M-15 — Connect Google Drive for TuDo photos** (D27; after T-005.1 and T-005.5 are merged). Never paste a
      client secret or token into chat, a ticket, the TuDo repo or a command line.
      1. Google Cloud console, Ricotdin's project: APIs & Services → enable **Google Drive API** (if not on).
         OAuth consent screen → Publishing status **In production** (in "Testing" the token dies after 7 days).
         Credentials → Create credentials → OAuth client ID → type **Desktop app**, name `TuDoCuaTui` →
         Download JSON (`client_secret_….json`).
      2. No GitHub environment (D28): the four values are **repository secrets** of `mmlabs-online/deployment`
         (Settings → Secrets and variables → Actions), set in step 5. No secrets yet at this point.
         The secrets were first added to the TuDoCuaTui repo by mistake: delete them there (Settings → Secrets →
         Actions), nothing in TuDoCuaTui reads them.
      3. Merge the setup PR the orchestrator opened (`setup/tudocuatui-drive-secrets`, two files). Its merge runs
         `deploy-tudocuatui` once: expect `deployed`, and the app not
         restarted (no secrets yet, photos stay off).
      4. On your computer (Node 22, Mac or Windows), in an up-to-date TuDo checkout:
         `node scripts/drive-connect.mjs --client-file <path to client_secret_….json>`.
         Open the printed URL, sign in with **Ricotdin's** Google account, allow. Check the printed account email.
         The script finds or creates the `TuDoCuaTui` folder (do not create it by hand), prints its id, and writes
         the file `drive-secrets.env` in the folder `.config/tudocuatui` of your home folder (mode 600; outside any git folder);
         the script prints the full path, use that exact path in steps 5 and 6.
      5. `gh auth status` (an account with admin on `mmlabs-online/deployment`), then run the command the script
         printed (it has the full path; do not type `~`, PowerShell and cmd do not expand it), for example
         `gh secret set -f /Users/<you>/.config/tudocuatui/drive-secrets.env -R mmlabs-online/deployment`
         or `gh secret set -f C:\Users\<you>\.config\tudocuatui\drive-secrets.env -R mmlabs-online/deployment`.
         Check `gh secret list -R mmlabs-online/deployment` shows exactly
         `TUDOCUATUI_DRIVE_FOLDER_ID`, `TUDOCUATUI_GOOGLE_CLIENT_ID`, `TUDOCUATUI_GOOGLE_CLIENT_SECRET`,
         `TUDOCUATUI_GOOGLE_REFRESH_TOKEN`. If `gh` rejects `-f`, set each one with
         `gh secret set <NAME> -R mmlabs-online/deployment` and paste the value at the hidden prompt.
      6. Delete `drive-secrets.env` (the path from step 4) and the downloaded `client_secret_….json`
         (Windows: also empty the Recycle Bin).
      7. Deploy. Check `https://tudocuatui.mmlabs.online/version.txt`. If that release is older than the first release
         that contains T-005.1, cut one: `git push origin main:release/vX.Y.Z`, then merge its deployment PR. Otherwise:
         Actions → `deploy-tudocuatui` → Run workflow from `main`. Expect `deployed`. On the Mac:
         `docker compose -p tudocuatui logs --tail 20 tudocuatui` shows `drive configured`. Never print the env file.
      8. Smoke, on the Mac in a clone of `mmlabs-online/deployment` on an up-to-date `main`:
         `docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js`.
         Expect every step `ok` and exit 0. Exit 2 = not configured (secrets missing, or the image predates T-005.1).
         `FAIL drive_auth` → Recovery. `FAIL drive_folder_not_found` → the folder id is wrong: re-run steps 4–7.
      9. In Ricotdin's Drive: the folder `TuDoCuaTui` exists and holds no `tudo-smoke-…` file.
      Recovery (photos fail with `drive_auth`: token revoked, 6 months unused, consent screen back in Testing, client
      secret reset or client deleted): if the client is gone or its secret was reset, do step 1's Credentials part again.
      If the cause was the consent screen back in "Testing", set it to **In production** again first (step 1), otherwise
      the new token dies in 7 days.
      Then steps 4, 5 (overwrites all four), 6, then Run workflow `deploy-tudocuatui` from `main` (the changed env file
      restarts the app), then step 8. The script finds the same folder, so the id does not change.
      Turn photos off (or undo a bad deploy): `gh secret delete <NAME> -R mmlabs-online/deployment`
      for all four names, then Run workflow from `main`: the env file goes back to `DATABASE_URL` only and the app
      restarts with `drive not configured`. A manual run has no automatic restore, so this is the way back.
      Deleting the GitHub secrets does not revoke the token. When turning photos off for good, also revoke it at
      Google: Google Account → Security → Third-party connections → TuDoCuaTui → Remove access.
      If a secret leaked (file committed, pasted, shared): (a) Google Account → Security → Third-party connections →
      remove TuDoCuaTui (revokes the refresh token); (b) Cloud console → Credentials → the `TuDoCuaTui` client →
      reset the client secret (or delete the client and create a new one, step 1); (c) redo steps 4, 5, 6 and Run
      workflow `deploy-tudocuatui` from `main`; (d) delete every copy of the leaked file.

### T-018.2 — AI key encryption (D30; plan `work/tickets/T-018.2/plan.md`)
- [ ] **M-16 — Deploy the AI KEK** (after T-018.2 is merged). Never paste the value into a chat, ticket or log.
      1. On the Mac: `mkdir -p ~/.config/tudocuatui && umask 077 && openssl rand -base64 32 | tr -d '\n' >
         ~/.config/tudocuatui/ai-kek.txt`. Do not `cat` the file.
      2. Bitwarden, **personal** collection, item "TuDoCuaTui AI_KEK": paste the value from the file. Copy it with
         `pbcopy < ~/.config/tudocuatui/ai-kek.txt` and clear the clipboard afterwards.
      3. `gh secret set TUDOCUATUI_AI_KEK -R mmlabs-online/deployment < ~/.config/tudocuatui/ai-kek.txt`. Check that
         `gh secret list -R mmlabs-online/deployment` shows the name.
      4. `rm ~/.config/tudocuatui/ai-kek.txt`.
      5. Merge the setup PR `setup/tudocuatui-ai-kek` on `mmlabs-online/deployment`, which contains the two drafted
         files (`deploy/deployment-repo/` here). If no PR was opened, copy the two files into one, on a branch whose
         name does not start with `release/`.
      6. Check that `/version.txt` shows a release that contains T-018.1. If it does not, cut a release, as in M-15
         step 7. Then go to Actions → `deploy-tudocuatui` → Run workflow from `main`. On the Mac,
         `docker compose -p tudocuatui logs --tail 20 tudocuatui` should show `ai configured`.
      7. Signed in through Access, `https://tudocuatui.mmlabs.online/api/ai-settings` should return
         `{"settings":null}`.
      8. Optional (real-key check; T-010 has no UI yet). In the browser console on the signed-in app:
         `await fetch("/api/ai-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"claude",model:"claude-haiku-5-5",apiKey:prompt("key")})}).then(r=>r.status)`
         then `await fetch("/api/ai-settings/test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>r.json())`.
         Expect `{ok:true}`; a wrong key gives `invalid_key`.
      A key saved now is cleared by T-019.3 (per-user keys, D33); enter it again after that release.
      KEK lost or leaked: generate a new one (steps 1-4), Run workflow, enter the key again.
      Turn AI off: `gh secret delete TUDOCUATUI_AI_KEK -R mmlabs-online/deployment`, then Run workflow.

### T-019 — sign in with mmlabs Identity (D31; plan `work/tickets/T-019/plan.md`, where these are numbered M-16–M-21)
- [ ] **M-17 — Your mmlabs `sub`** (before T-019.1 can run). Create / use your account on `api.mmlabs.online`
      (sign-up exists, USR-01); read `user.id` from the login response (or ask the org-admin-api operator). Paste it
      under T-019 *Notes / answers from Ming*. Not secret. Double-check it: a wrong value hands the wardrobe to
      another account.
- [ ] **M-18 — Backup before the ownership migration** (before merging the first release PR that contains T-019.1):
      take a manual `pg_dump` of `tudocuatui` on the Mac (in addition to the deploy's `backup` step) and keep it;
      after deploy, run the read-only `user_id is null` count (expect 0).
- [ ] **M-19 — Register app `tudocuatui`** in org-admin-api production (after its USR-07 CLI exists): origin
      `https://tudocuatui.mmlabs.online` only (no localhost), `join_policy = open`.
      Status 2026-11-13: USR-07 is DONE on org-admin-api branch `claude/blissful-wozniak-fx4lm9`, not yet merged to
      its `main`. Once merged and deployed: Actions → `ops-org-admin-api` → command `register-app`, inputs
      `key=tudocuatui`, `name=TuDoCuaTui`, `origins=https://tudocuatui.mmlabs.online`, `join_policy=open`,
      `org_mode=none`; run with `dry_run` on first, approve the `org-admin-api-ops` environment, then again with
      `dry_run` off (org-admin-api `docs/deploy.md`, "Register an app"). After this, M-17 (your `sub`) becomes possible:
      sign up from TuDo's sign-up page once T-019.7 is live, or from another registered app.
- [ ] **M-20 — Make your account usable:** verify your email (after org-admin-api USR-04) and become a member of
      `tudocuatui` through the staff role assignment (USR-02c) until USR-03b ships the join flow (A9).
- [ ] **M-21 — Switch production to Identity (Access stays on):** release containing T-019.5–T-019.8; set
      `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER: https://api.mmlabs.online` in the release PR's compose;
      verify sign-in/out on phone and desktop, photos, and isolation with a second test account temporarily added to
      the Access policy (A16). Rollback: `TUDO_AUTH_MODE: access`.
- [ ] **M-22 — Remove Cloudflare Access (last step):** only after T-019.9 is released and M-21 verified: delete the
      Access application for `tudocuatui.mmlabs.online`; check incognito shows TuDo's sign-in and `/api/items` → 401.

## Plan approvals and escalations
<!-- /run appends items here, e.g. "- [ ] Approve plan for F-101: work/tickets/F-101/plan.md" -->
- [x] (2026-11-13, approved in session) Approve plan for T-018.2 (branch `claude/magical-cori-2ssw8l`): work/tickets/T-018.2/plan.md — AI key test endpoint + AI_KEK deploy wiring, seams for per-user keys (D33); confirm A1–A12 (A1 refuse AI when auth off, A3 saving a real key now means one re-entry after T-019.3) and C1–C6
- [x] (2026-11-13, approved in session) Approve plan for T-019.11 (branch `claude/magical-cori-2ssw8l`): work/tickets/T-019.11/plan.md — auth screens UI only (sign-in, sign-up, verify email), dev-only preview `/auth-preview.html`; confirm A1–A15 and the draft Vietnamese copy
- [x] (2026-11-13, approved in session, A1–A20 defaults) Approve plan for T-019 (branch `claude/magical-cori-2ssw8l`): work/tickets/T-019/plan.md — sign in with mmlabs Identity; umbrella plan, split T-019.1–T-019.10; confirm A1–A20 (A1 two-step migration, A3 RLS now, A5 photos as blob URLs, A6 per-user AI keys, A7 quotas as follow-up, A9 interim membership via USR-02c)
- [x] (2026-11-12) Approve plan for T-018 (branch `ticket/T-018`): work/tickets/T-018/plan.md — AI settings on the Node server; split T-018.1/T-018.2; changes C1–C14, assumptions A1–A12
- [x] (2026-11-12) Approve plan for T-005.2 (branch `claude/loving-fermi-t90upb`): work/tickets/T-005.2/plan.md — photo upload/delete via Drive (slice 1; sweep → T-005.6); confirm A1–A19
- [x] (2026-11-11) Approve plan for T-005.5 (branch `claude/loving-fermi-t90upb`): work/tickets/T-005.5/plan.md — Drive connect script + deploy secrets + M-15 runbook; confirm A1–A14 (A2, A3, A7)
- [x] (2026-11-11) Approve plan for T-005.1 (branch `claude/loving-fermi-t90upb`): work/tickets/T-005.1/plan.md — Node server ↔ Google Drive; confirm A1–A17 (A2, A4, A5, A6 are the real choices)
- [x] (2026-11-13, approved in session) Approve plan for T-016 (branch `claude/loving-fermi-t90upb`): work/tickets/T-016/plan.md — remove Supabase; confirm A1–A6
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
- [x] (2026-11-12) Approve plan for T-017 (branch `claude/loving-fermi-t90upb`): work/tickets/T-017/plan.md — new category list; confirm A1–A10 (A1 mapping bag→Phụ kiện, sport/home→Loại khác; A2 ids; A4 Supabase left as-is)
