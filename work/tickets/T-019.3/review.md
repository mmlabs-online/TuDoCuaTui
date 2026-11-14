# Review — T-019.3

## Attempt 1 — 2026-11-14
Verdict: PASS

### Checks (run by reviewer)
DB tests ran against the reviewer's own throwaway PostgreSQL 16.15 cluster (scram-sha-256 password auth, fresh
directory `/tmp/rev-t0193-pg`, port 55439; `TEST_DATABASE_URL` set). No skipped DB suites.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format." (204 files).
- test: Test Files 81 passed (81), Tests 1014 passed (1014). Matches impl-log.md.
- build: `vite build` ok, "built in 349ms".

### Acceptance criteria
- [x] "`ai_settings` primary key is `user_id`; the legacy ciphertext is cleared." — evidence: only new file
  `db/migrations/20261114180000_ai_settings_per_user.sql` (+ README); the six applied migrations are unchanged
  (`git diff origin/main...HEAD --name-only -- db/migrations`). Green: `server/schema.db.test.ts` (PK `(user_id)`, no
  `id`, `user_id` NOT NULL on all five tables), `server/migrator.db.test.ts` › "legacy v1 row: owner set, key columns
  cleared, provider/model kept, updated_at bumped; PK is user_id", "a row already owned …", "a row and no owner …",
  "a row owned by someone else …", "an empty table passes …", `server/ai/store.db.test.ts` (23502/23505/two rows).
  Hand-check on a DB seeded at the contract state (first six files applied, then a `v1:` row):
  - null `user_id` + owner A → row gets A, `key_ciphertext`/`key_hint`/`key_updated_at` null, provider/model kept,
    `updated_at` bumped; `\d ai_settings`: `PRIMARY KEY, btree (user_id)`, `user_id` NOT NULL, no `id` column, `check (id)`
    gone, key/hint/pair checks kept.
  - row + no owner (also whitespace-only owner) → `rows exist but TUDO_OWNER_SUB is not set`; rolled back (`id` column
    still there, ciphertext still present).
  - row owned by B + owner A → `existing owner differs from TUDO_OWNER_SUB`; row unchanged, no uuid in the message.
  - garbage owner / nil uuid → `TUDO_OWNER_SUB is not a valid uuid` (value not echoed).
  - row already owned by A + owner A → kept, cleared. Empty table without owner → passes, PK `(user_id)`.
- [x] "AAD v2 binds the ciphertext to the `sub`: a ciphertext copied to another row does not open." — evidence:
  `server/ai/crypto.js:10-17` (AAD `tudocuatui-ai-key|v2|<userId>|<provider>`, canonical-uuid check), only `v2:` opens;
  `server/ai/crypto.test.ts` (other sub, real v1 ciphertext → `key_unreadable`, malformed users) green;
  `server/isolation.db.test.ts:355` "row copy: A's ciphertext in B's row -> 409 key_unreadable, no fetch" green.
  Hand-check (script against the hand-migrated DB, real `createApp`, fake fetch): migrated row → A `/test` 409
  `not_configured`; A saves key, B saves provider/model, SQL copies A's ciphertext+hint into B's row → B `/test` 409
  `key_unreadable`, B tag-photo 409 `key_unreadable`, 0 fetches; A `/test` 200 with 1 fetch.
- [x] "Each user's get/put/delete is independent; per-user limiter windows with eviction." — evidence:
  `server/isolation.db.test.ts:330-380` (independence, B → `not_configured` with no fetch, runtime recorder: every AI
  statement mentions `user_id`); `server/ai/store.js` every statement uses `user_id = $1` / `on conflict (user_id)`,
  `need()` before SQL; `server/ai/rateLimit.test.ts` (per user, global ceilings ×3, rejected call records nothing,
  eviction, sweep > 1024); `server/ai/tagPhoto.test.ts` (1 per user / 2 total, busy/415/413 consume no quota, separate
  instances); `server/scoping.test.ts:11,71-73` (`ai_settings` in `TABLE_RE`, negative fixtures).
- [x] "Parity test with `src/shared/ai` updated; all checks pass." — evidence: `server/ai/parity.test.ts` green;
  `git diff origin/main...HEAD -- src` empty (A5/A10: no new error code, so nothing to mirror); all four checks green.

### Implementer's deviation (rateLimit.js deletes the entry on a rejected call when all windows are empty)
Accepted. `server/ai/rateLimit.js:269-271`: the deletion can only trigger on a global-ceiling rejection (a per-user
rejection means `mine[kind]` is at max, so not empty). It records nothing, never removes a live timestamp, and is exactly
the plan's eviction rule ("a user whose arrays are all empty is deleted on their own check", Approach 5); without it a
user whose calls expired would keep an empty entry until the next sweep. Covered by `rateLimit.test.ts:95` "a user whose
calls all expired is deleted on the rejection path too". Not really out of plan; impl-log could have named it.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: server only, `src/` untouched. R2: new migration file only, no applied file edited; no RLS by
design (D32, RLS in T-019.4, plan approved by Ming); no `src/types/database.ts` in this setup (umbrella A18). R3: no new
secret or `VITE_*`; logs keep fixed fields (no userId/key/hint). R4/R5/R6/R9/R10: not affected. R7: every changed file is
in the plan or workflow-owned (`work/ming-todo.md` M-18 line per A13, ticket/plan/consult). R8: tests for all changed
logic, green.

### Ming verification after merge (from plan.md; carry into the PR)
- Deploy log shows `applied 20261114180000_ai_settings_per_user` after expand and contract; app container healthy.
- `select user_id, provider, model, key_ciphertext is null as cleared from ai_settings;` → no row, or one row with
  Ming's `sub` and `cleared = t`; `\d ai_settings` shows PK `(user_id)` and no `id` column.
- Re-enter the AI key in Settings and press "Kiểm tra" (`/test` ok). Optional M-23 smoke test.
- PR description must say: "not image-rollback-safe; AI routes of an older image fail on the new schema; the saved AI
  key is cleared and must be re-entered".

### Nits (do not block)
- `server/ai/routes.js:376-380`: `sealKey` (which can throw `bad_user`) runs outside the handler's `try`; unreachable
  today because `userId` always comes from `toUserId`, but a throw there would skip the route's own error mapping.
- `server/ai/rateLimit.js:270`: second `prune(mine, t)` re-filters arrays already pruned at line 266; checking
  `KINDS.every(k => mine[k].length === 0)` would be enough.
- impl-log.md "Out-of-plan files: None" while the rejection-path deletion was a judgement call worth one line.

### Follow-ups (out of scope)
- None new.
