# T-004: Move TuDoCuaTui onto the shared stoktok Supabase project

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-003 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-08 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/10 |

## Goal
Run TuDoCuaTui on the existing stoktok Supabase project (shared Postgres and Auth) with no name clashes. Every
TuDoCuaTui DB object gets the prefix `tudo_`, so one hosted project serves both apps.

## Feature reference
- No feature in `docs/feature-list.md` covers this. It is an infrastructure decision by Ming (2026-11-08, in chat):
  - Share the stoktok Supabase DB.
  - Use the table prefix `tudo_`.
  - Share Auth with stoktok. Both apps are single-user (Ming only), and Ming accepts the shared blast radius.
  - Edit the existing migration files in place.
  - Rename schema `private` to `tudo_private`.
  - Run this before the in-progress data-layer tickets.
- It touches feature-list §1 (Backend, Current state) and F-001 / F-007 (redirect URLs).
- Record it as D17 in `work/decisions.md`.

## Scope
- Rename every TuDoCuaTui DB object, editing `supabase/migrations/20261106000000_init.sql` and
  `20261107120000_rls_hardening.sql` in place. Neither has been applied to a hosted DB, because M-1 is not done.
  - Tables: `tudo_locations`, `tudo_items`, `tudo_item_photos`, `tudo_wear_logs`.
  - View: `tudo_items_with_stats`.
  - Enums: `tudo_item_category`, `tudo_item_status`, `tudo_season`.
  - Function `tudo_set_updated_at` and its trigger.
  - Schema `private` → `tudo_private`.
  - Policy names.
- Add explicit `grant`s to `authenticated` on every TuDo table and view, plus usage on any sequences. stoktok's
  migration runs `alter default privileges in schema public revoke all ... from anon, authenticated`, so TuDo
  objects would otherwise get no grants. Nothing is granted to `anon`.
- `src/data/repo.ts`: use the new names. Regenerate `src/types/database.ts`.
- pgTAP tests in `supabase/tests/`: use the new names, and add one test that proves the grants exist.
- Docs:
  - `docs/data-model.md` and `docs/qa/smoke-test.md`: new names.
  - README setup: use the stoktok project; run every migration in filename order in Dashboard → SQL Editor; add
    the TuDo URL to Auth → Redirect URLs (Site URL stays stoktok's).
  - Feature-list §1 names.
- `work/ming-todo.md`: rewrite M-1 and M-5 as dashboard steps on the stoktok project. No new project, no CLI
  `db push`.
- D17 in `work/decisions.md`.

## Out of scope
- Storage bucket `wardrobe` and its policies stay as they are. Photos move to Google Drive in a later ticket.
- Any change in the stoktok repo. stoktok objects are never altered.
- Sign-up or multi-user support. Sign-ups stay disabled in the shared project.
- Rebasing the in-progress tickets (F-002, F-004.1, F-005.2, F-401, F-601.1). Each one rebases when it resumes.

## Acceptance criteria
- [ ] No TuDoCuaTui table, view, enum, function, trigger or schema in `supabase/migrations/` lacks the `tudo_`
      prefix. Checked by grep, and by a catalog query after `npx supabase db reset` locally.
- [ ] With stoktok's default-privilege revoke applied first, the TuDo migrations still give `authenticated` the
      grants it needs. A pgTAP test asserts the grants, and `anon` has none.
- [ ] `npx supabase test db` passes with the renamed objects. All RLS and hardening assertions are kept.
- [ ] Checks are green (typecheck, format:check, test, build). `src/types/database.ts` is regenerated and matches
      the new names.
- [ ] Local mode (no env vars) still works unchanged (R1).
- [ ] README and M-1 / M-5 describe dashboard-only setup on the stoktok project. D17 is recorded.

## Technical notes
- Files:
  - `supabase/migrations/*.sql` and `supabase/tests/*.sql`
  - `src/data/repo.ts` and `src/types/database.ts`
  - `docs/data-model.md`, `docs/qa/smoke-test.md`, `docs/feature-list.md` §1, `README.md`
  - `work/ming-todo.md` and `work/decisions.md`
- Risks / open questions:
  - Simulating stoktok's revoke locally: maybe a test-only setup step. The planner decides, and it must not go
    into TuDo's migrations.
  - Editing applied migrations goes against the letter of R2. It is allowed here because they were applied only
    locally (Ming's decision).
  - The local DB needs `db reset`. Never use `supabase stop --no-backup`.
  - In-progress tickets F-002 and F-005.2 touch the same files and will conflict.
  - Migrations applied through SQL Editor are not recorded in `supabase_migrations.schema_migrations`. Do not tell
    Ming to use `db push` later.

## Test plan
- Unit: the existing repo tests pass with the new table names.
- DB: `npx supabase test db` (renamed RLS, storage and hardening tests, plus the new grants test).
- Manual (Ming, after merge): M-1 and M-5 on the stoktok project, then the M-2 smoke test in Supabase mode.

## Notes / answers from Ming
- 2026-11-08: Plan approved (Ming, in chat with Annie: "Plan approved (T-004)"; recorded by Annie).
- 2026-11-08 (chat with Annie): "2 app này chỉ có tôi dùng, k sợ lộ"; edit the migration files in place; photos
  go to Google Drive like Ricotdin (separate ticket); schema `tudo_private` ok; run before the in-progress tickets.

## Handoff

### 2026-11-08 — claude — BLOCKED
- Done: consult (database-optimizer) saved; plan.md READY with changes vs ticket C1–C13 and a local-only simulation of stoktok's default-privilege revoke (`scripts/test-db-shared.sh`).
- In progress / next: Ming approves the plan (write "Plan approved" under Notes); then `/run T-004` implements.
- Gotchas: F-002, F-005.2 and F-007 will need a rebase after this merges; `database.ts` is regenerated with `--local` here (takes over F-002's regenerate step).

### 2026-11-08 — claude — DONE
- Done: attempt 1 REWORK (3 small doc/script fixes from review + security 🟡 Y1/Y2), attempt 2 PASS; security review no 🔴. PR #10.
- In progress / next: Ming reviews/merges PR #10, then M-1 (SQL Editor on the stoktok project), M-5 checks, M-2 smoke test. Then T-005.1, F-007, and the takeover of F-401, F-004.1, F-601.1, F-005.2 (F-002 likely closes: types regenerated here).
- Gotchas: never `db push`/`--linked` from this repo against the shared project (history mismatch with stoktok). `scripts/test-db-shared.sh` resets the local DB.
