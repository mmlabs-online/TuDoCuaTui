# Implementation log — T-019.3

## Attempt 1 — 2026-11-14

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261114180000_ai_settings_per_user.sql` (new) | AC1: owner contract, clear v1 key, drop `id`, PK `user_id` NOT NULL |
| `db/migrations/README.md` | A12: exception bullet for the new migration |
| `server/ai/store.js` | per-user get/save/clearKey/getSecret, `need(userId)` |
| `server/ai/crypto.js` | v2 AAD with the user, no v1 fallback |
| `server/ai/rateLimit.js` | per-user windows, global ceilings, eviction, `size()` |
| `server/ai/routes.js` | `loadSettingsKey(ai, userId)` required; userId plumbing |
| `server/ai/tagPhoto.js` | userId, per-user/total in-flight via `tagSlots`, new check order (A9) |
| `server/app.js` | `tagSlots: createInFlight({ perUser: 1, total: 2 })` |
| `server/api.js` | pass `userId` to both AI handlers |
| `server/test/auth.ts` | `OWNER_C`, `x-test-user: c` (test-only) |
| `server/scoping.test.ts` | `ai_settings` in `TABLE_RE`, negative fixtures |
| `docs/data-model.md`, `server/README.md` | docs per plan |
| test files (below) | R8 |

### Tests added / changed
- `server/ai/crypto.test.ts`: v2 round trip, other sub, v1/v3 prefixes, real v1 ciphertext (old AAD), malformed users.
- `server/ai/rateLimit.test.ts`: per user, global ceilings (test/save/tag), rejected call records nothing, eviction, sweep > 1024.
- `server/ai/routes.test.ts`: fakes take `userId`; every store call gets the user; `loadSettingsKey` without user rejects; per-user 429.
- `server/ai/tagPhoto.test.ts`: 1 per user / 2 total in flight; busy/415/413 consume no quota; instances do not share the counter; default secret sealed per asking user.
- `server/ai/store.db.test.ts`: schema (23502/23505/23514), two users independent, bad user throws without SQL, v2 round trip.
- `server/isolation.db.test.ts`: AI block (independence, B `/test` and tag-photo `not_configured` with no fetch, row-copy `key_unreadable`, runtime recorder).
- `server/migrator.db.test.ts`: `contractDir()`, legacy v1 row cleared, owner cases, empty table, version count 7.
- `server/schema.db.test.ts`: user_id NOT NULL on all five tables; PK `(user_id)`, no `id`.

### Checks (actual output summary)
DB tests ran against a throwaway PostgreSQL 16 cluster (scram-sha-256, under /tmp, stopped and removed afterwards; `TEST_DATABASE_URL` set).
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: all matched files use the correct format.
- test (with DB): 81 files passed, 1014 tests passed (0 skipped).
- test:coverage (with DB): 81 files / 1014 tests passed; All files 95.12 % stmts, 94.49 % branches.
- build: built in 424ms.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The plan assumes PG 17 in CI; local run used PG 16 (fine: nothing here needs 17).
- The default `/tmp/tudopg` dir existed before this run and was left alone.

### Scope self-check
- Could the diff be smaller? No; production diff is as planned, the rest is tests.
- Diff size: about +780 / -200 lines (incl. tests).
