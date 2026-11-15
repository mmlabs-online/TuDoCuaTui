## Attempt 1 — 2026-11-15
Verdict: PASS

Reviewed commit `6422232` on branch `claude/magical-cori-2ssw8l` against `origin/main`.

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exited 0 with no errors.
- format:check: "All matched files use the correct format." (239 files)
- test: run with a throwaway Postgres 16 (`initdb --auth=trust`, port 55432, `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres`). Result: 97 files passed, 1 failed; 1305 tests passed, 1 failed. The one failure is `server/migrate.cli.test.ts` › "exit 1 on wrong password". It is a known artifact of trust auth and not related to this diff. These numbers match impl-log exactly.
  - DB-focused suites (`photoQuota.db`, `isolation.db`, `api.db`, `photoQuota`, `scoping`) were run 5 times in a row: 91/91 passed each time. The race test was not flaky.
  - Mutation check, done in a scratch copy that was deleted afterwards: with the `pg_advisory_xact_lock` statement replaced by a no-op, the race test fails 3 out of 3 runs with `expected [ 200, 200 ] to deeply equal [ 200, 409 ]`. So the test really guards the lock.
  - The cluster was stopped and its data dir deleted afterwards.
- build: `vite build` finished: "built in 330ms".

### Acceptance criteria
- [x] A non-owner at the stored cap gets the quota error, the fake Drive sees no `createFile`, and replacing an existing photo at the cap still works.
  - Evidence: `server/photoQuota.db.test.ts` › "at the stored cap a PUT to another item -> 409 …, no Drive POST, no new row" and › "at the stored cap a replace … -> 200, count unchanged, old Drive file deleted".
  - Race: › "two parallel PUTs to different items at cap-1 -> exactly one 200 and one 409; rows = cap; loser's file deleted". It shows 2 creates and 1 delete, and the remaining files are the kept rows.
  - Lock order: › "statements in the putPhoto transaction" checks `for update` → advisory → count → delete → insert.
  - Code: pre-check at `server/photos.js:225-232`; recount under lock at `server/photos.js:260-271`; loser cleanup at `server/photos.js:287-290`.
- [x] A non-owner over the daily count gets 429 before the body is read.
  - Evidence: › "over the daily count: a headers-only PUT gets 429 rate_limited with Retry-After and Connection: close; no Drive request". The test sends raw headers with `Content-Length: 1000` and no body.
  - Code: `reserve` runs at `server/photos.js:150`, before `tryAcquire` (line 156) and before `readBody`, with no `await` in between, and uses `rejectUnread`.
- [x] The owner is not limited.
  - Evidence: › "owner app (storedMax 1, dailyMax 1): A uploads to 3 items -> all 200 …".
  - Unit tests: exempt cases in `server/photoQuota.test.ts`.
  - The exemption is only an exact match against the `ownerSub` from config: `isExempt` at `server/photoQuota.js:34`, wired in `server/app.js:45`.
  - Deviation (accepted): the plan's owner test says "second item 409" for the non-owner, but with `dailyMax 1` the daily check runs first and returns 429. The test asserts 429 on that app and 409 on a second app with `dailyMax 100`. This tests the same behaviour more precisely, and impl-log records it.
- [x] Two users' counts are independent (db test). Evidence: › "A at the stored cap and over the daily count; B's PUT on its own item -> 200". Unit test: "two users" in `photoQuota.test.ts`.
- [x] The UI shows the Vietnamese copy for the new code.
  - Evidence: `src/data/apiErrors.test.ts` › "photo_quota_exceeded and rate_limited have their own Vietnamese copy".
  - `src/data/repo.http.test.ts` › "a 409 photo_quota_exceeded / 429 rate_limited photo step throws PhotoSaveError with that copy".
  - The strings in `src/data/apiErrors.ts:22-23` are word-for-word the two that Ming approved.
- [x] All checks pass. See above. The only failure is the known, unrelated trust-auth case.

Specific points checked:
- **Lock order and deadlocks.**
  - In `putPhoto`, the items row lock (`for update`) is taken before the advisory lock.
  - While holding the advisory lock, the transaction only reads counts, deletes and inserts rows of its own item, and the FK key-share on an items row it already holds. It never asks for another items row.
  - `deleteItem` and photo DELETE never take the advisory lock.
  - So no lock cycle is possible.
  - Under READ COMMITTED, the recount statement starts after the lock is granted, and the lock is held until commit, so the winner's insert is visible to the recount.
- **Replace net zero.** The same `QUOTA_SQL` and `storedAllows` (`total - onItem < cap`) are used in both the pre-check and the locked recount.
- **Daily reservation and refund on every path.**
  - Paths that refund the reservation:
    - 400 (`invalid_photo`, and an aborted body, which `readBody` reports as 400).
    - 404, 408 and 413 (stream).
    - Pre-check 409.
    - Drive 502/503.
    - DB errors before the create (`finally` at `server/photos.js:200`).
    - Busy slot 503 (`server/photos.js:158`).
  - It is kept only after `createFile` resolves (`onDriveStored`, `server/photos.js:244`). That matches plan A3, including the race-loser case.
  - A rejected `reserve` records nothing.
  - Idle keys are pruned on every reserve for that user and by the periodic sweep. Unit test: "idle sweep".
- **RLS and scoping.**
  - Both count subqueries filter on `user_id = $2` and run through `withUser`.
  - The `isolation.db.test.ts` control regex is anchored (`^…$`) and accepts exactly `select pg_advisory_xact_lock(hashtextextended('photo-quota:' || $1::text, 0))` and nothing broader. The guard still ran and passed.
- **R6.** The server sends only codes. Vietnamese copy exists only in `src/data/apiErrors.ts`.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: server-only, plus copy. The local repo is untouched.
- R2: no migration.
- R3: no new env variable or secret.
- R4: Drive naming is unchanged, and the loser's file is deleted.
- R5: the counts are computed on each request.
- R6: copy only in `apiErrors.ts`.
- R7: every changed file is in the plan. The edits to `work/ming-todo.md` and `ticket.md` are orchestrator bookkeeping: the plan-approval tick and the state and claim fields.
- R8: unit tests and DB tests were added.
- R9: no UI change.
- R10: no Figma Make files were touched.

### Nits (do not block)
- `server/photoQuota.js:58-63`: with `dailyMax: 0`, `mine[0]` is undefined, so `retryAfterSec` becomes `NaN`. This cannot happen with `PHOTO_LIMITS`. A guard such as `mine.length ? … : windowMs/1000` would make the option total.
- `server/photoQuota.js:56`: once more than 1024 users hold entries, every `reserve` call sweeps the whole map (O(n) per upload). This is fine at the current scale. Note it if the user count grows.
- `size()` and `sweepNow()` are exported only for tests. That is acceptable, but they could be marked `@internal`.

### Follow-ups (out of scope)
- Index on `item_photos(user_id)` once the table reaches tens of thousands of rows (plan A10, consult finding 2). Check whether `server/migrator.js` wraps files in a transaction before using `CONCURRENTLY`.
- Optional structured log event for quota refusals, if Ming wants to tune the numbers from logs (plan A10).

### For the PR (Ming verification after merge)
- Limits: 500 stored photos per user, 50 uploads per user per rolling 24 h, owner exempt. Approved; they live in `PHOTO_LIMITS` in `server/photoQuota.js`.
- Optional: a second test account that uploads more than 50 photos in a day should see "Bạn đã tải lên nhiều ảnh trong 24 giờ qua, thử lại sau nhé".
- No new Ming item. M-24 (production PG ≥ 15) already covers `hashtextextended`.
