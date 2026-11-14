## Attempt 1 — 2026-11-14
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (tsc --noEmit + tsconfig.server.json) exit 0, no errors.
- format:check: "All matched files use the correct format." exit 0.
- test: `TEST_DATABASE_URL` pointed at the reviewer's own throwaway Postgres 16.15 (scram password auth, port 55433,
  `/tmp/tudopg-review`, stopped and deleted afterwards). "Test Files 77 passed (77) / Tests 950 passed (950)", none
  skipped. Matches impl-log.
- build: `pnpm build` "built in 399ms".

### Acceptance criteria
- [x] New migration file only; four applied migrations unchanged — evidence: `git diff --stat origin/main...HEAD -- db/migrations`
  lists only `20261113120000_user_ownership_expand.sql` (new, +84) and `README.md`; `migrator.test.ts` forbidden-statement
  test green.
- [x] All five tables get `user_id` = owner on every pre-existing row — evidence: `migrator.db.test.ts` › "ownership expand:
  rows in all five tables get the owner; updated_at unchanged; triggers re-enabled" (pass); `schema.db.test.ts` upgrade
  tests assert `user_id = OWNER` (pass). Hand check on a seeded DB (2 locations, 2 items incl. "Áo dài đỏ"/"Tủ đồ",
  2 photos, 2 wear_logs, 1 ai_settings) via `node server/migrate.js` with `TUDO_OWNER_SUB=" 0190A6F2-…-1F2A3B4C5D6E "`:
  every table "N rows, N owned"; items `updated_at` stayed 2020-01-01, ai_settings stayed 2020-01-02; `pg_trigger.tgenabled`
  = `O` for both triggers; a later `update items` bumped `updated_at`; output was only `applied 20261113120000_…`, owner
  not printed; uppercase/padded input normalised.
- [x] Rows + owner unset rolls back; empty DB passes; malformed owner exit 2, never printed — evidence: tests "rows + no
  owner rejects; nothing applied", "empty DB passes with and without owner", "garbage tudo.owner_sub GUC is rejected
  without echoing it", `parseOwnerSub` unit tests, two `migrate.cli.test.ts` exit-2 tests (all pass). By hand: seeded DB
  without owner → `rows exist but TUDO_OWNER_SUB is not set [P0001]`, exit 1, `schema_migrations` = 4, 0 `user_id`
  columns; `TUDO_OWNER_SUB=leak-ME-123` and the nil UUID → exit 2 "TUDO_OWNER_SUB is not a valid UUID", value absent;
  psql with GUC `leak-ME-456` → "TUDO_OWNER_SUB is not a valid uuid", value absent; empty DB with no owner → all five
  applied, exit 0.
- [x] Existing API code passes current db tests with nullable `user_id` — evidence: `api.db`, `app.db`, `photo-sweep.db`,
  `ai/store.db` tests unchanged in the diff and pass; "null user_id inserts still accepted" passes.
- [x] View keeps old columns in order, `user_id` last — evidence: `schema.db.test.ts` › "items_with_stats columns: existing
  order kept, user_id last"; migration lines 61–85 are the item_photos_drive body plus `i.user_id`; "view still returns
  location_name for a null-user_id item" passes.
- [x] All checks pass — see above.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no SPA/local-mode code touched. R2: new file only; RLS deferred by D32 (decisions.md line 41),
no `src/types/database.ts` in this stack. R3: `TUDO_OWNER_SUB` is non-secret, server-side only, never logged. R5: view
still derives wear stats. R7: all changed files are in the plan's file list (ming-todo.md M-18 text is the orchestrator
step the plan asked for). R8: unit + db tests added. R9/R10: not affected.

### Nits (do not block)
- `server/migrate.cli.test.ts` "DATABASE_URL unset + malformed TUDO_OWNER_SUB" asserts exit 2 and no echo but not the
  message text (the other CLI test does).
- SQL message says "uuid", JS message says "UUID"; harmless, both covered by tests.

### Follow-ups (out of scope)
- T-019.2 must re-run the owner backfill for straggler rows (plan A8) and needs `TUDO_OWNER_SUB` again.

### Ming verification after merge
- At the first release containing T-019.1 (after M-17, with M-18): set `TUDO_OWNER_SUB` on the `migrate` service in the
  release PR's `apps/tudocuatui/compose.yml`; deploy log shows `applied 20261113120000_user_ownership_expand`; read-only
  `select count(*) from <t> where user_id is null` is 0 for all five tables; app behaves as before under Access.
