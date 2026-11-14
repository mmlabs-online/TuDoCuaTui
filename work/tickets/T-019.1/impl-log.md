
## Attempt 1 — 2026-11-14

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261113120000_user_ownership_expand.sql` (new) | AC1-AC3, AC5: nullable `user_id` x5, owner check + trigger-safe backfill, two indexes, view with `user_id` last |
| `server/migrator.js` | `parseOwnerSub`; `ownerSub` option; transaction-local `set_config('tudo.owner_sub')` |
| `server/migrate.js` | passes `TUDO_OWNER_SUB`; header comment |
| `db/migrations/README.md` | D32 text replaces the "no RLS" bullet; owner GUC; `end $$;` note |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | `TUDO_OWNER_SUB: ""` on `migrate` only, comment (D37) |
| `docs/data-model.md` | line 3 made true (D32) |
| `server/migrator.test.ts`, `server/migrator.db.test.ts`, `server/migrate.cli.test.ts`, `server/schema.db.test.ts` | tests listed in the plan |

### Tests added / changed
- migrator.test.ts: parseOwnerSub (unset/blank, trim+lowercase v4/v7, malformed + nil rejected, never echoed)
- migrator.db.test.ts: ownership expand backfill (five tables, updated_at unchanged, triggers re-enabled); rows + no owner rejects; empty DB passes; garbage GUC rejected without echo; null user_id inserts; NOSUPERUSER test now seeds rows and passes an owner
- migrate.cli.test.ts: malformed owner exit 2 (unreachable URL, unset URL); valid owner exit 0 not printed
- schema.db.test.ts: two upgrade tests pass `ownerSub` and assert `user_id`; "no RLS; user_id nullable uuid on five tables"; view column order ends with `user_id`; ownership indexes; view for null-user_id item

### Checks (actual output summary)
- typecheck: clean (tsc --noEmit + tsconfig.server.json)
- format:check: "All matched files use the correct format."
- test: 77 files, 950 tests passed, with TEST_DATABASE_URL set to a throwaway local Postgres 16 (password auth), so all `*.db.test.ts` ran (not skipped). CI uses Postgres 17.
- test:coverage: 77 files, 950 tests passed, no threshold error
- build: built OK
- `git diff --stat db/migrations`: README.md only modified; new expand file untracked/added; four applied .sql files unchanged.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- M-18 text in `work/ming-todo.md` (set `TUDO_OWNER_SUB` in the release PR compose) was already handled by the orchestrator commit.
- T-019.2 must backfill stragglers with `TUDO_OWNER_SUB` again (plan A8).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see `git diff --stat` of the commit.
