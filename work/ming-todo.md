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
- [ ] **M-4 — Cloudflare Pages** (after F-007 is merged): follow README → "Deploy": connect the repo, set the
      production-only env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, then log in on a phone with your stoktok email + password (D19).
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

## Plan approvals and escalations
<!-- /run appends items here, e.g. "- [ ] Approve plan for F-101: work/tickets/F-101/plan.md" -->
- [ ] Approve plan for T-007 (branch `claude/loving-fermi-t90upb`): work/tickets/T-007/plan.md — self-host via Cloudflare Tunnel + stoktok-style release/deploy; confirm assumptions A1–A11
- [x] (2026-11-09) Approve plan for T-006 (branch `claude/loving-fermi-t90upb`): work/tickets/T-006/plan.md — email + password login, magic link removed; confirm assumptions A1–A5
- [x] (2026-11-07) Approve plan for T-003 (branch `ticket/T-003`): work/tickets/T-003/plan.md — new RLS migration; changes vs ticket listed as C1–C9
- [x] (2026-11-08) Approve plan **Revision 2** for T-003 (branch `ticket/T-003`): work/tickets/T-003/plan.md — attempt 1 hit policy recursion; fix uses a `private.owns_location()` helper; new changes C10–C13
- [x] (2026-11-08) Approve plan for T-004 (branch `ticket/T-004`): work/tickets/T-004/plan.md — shared stoktok DB, `tudo_` prefix, explicit grants; changes vs ticket C1–C13
- [x] (2026-11-08) Approve plan for F-007 (branch `ticket/F-007`): work/tickets/F-007/plan.md — drops `_redirects`, see "Changes vs ticket scope"
- [x] (2026-11-07) Approve plan for F-101 (branch `ticket/F-101`): work/tickets/F-101/plan.md
