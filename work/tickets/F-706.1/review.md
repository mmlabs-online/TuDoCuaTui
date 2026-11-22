## Attempt 1 — 2026-11-22
Verdict: REWORK

### Checks (run by reviewer)
Run on commit 052b99b against a throwaway Postgres 16.15 cluster (`/tmp/pg-rv7061`, scram auth; stopped and removed afterwards), `TEST_DATABASE_URL` set.
- `pnpm typecheck` — clean (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- `pnpm format:check` — **FAILED**: `Format issues found in above 1 files` → `.vitest/json/output.json` (exit 1). See Issue 1. impl-log says "all matched files use the correct format", which does not match my run.
- `pnpm test` — 151 files, 2211 tests passed, 0 skipped. DB suites all ran, none skipped: 12 `*.db.test.ts` files, 247 tests (credits.db 22, migrator.db 37, rls.db 16, schema.db 25, api.db 53, app.db 2, backup.db 16, isolation.db 17, photo-relocate.db 17, photo-sweep.db 26, photoQuota.db 8, store.db 8). With `server/db.test.ts` (12) that gives impl-log's 13 files / 259. New no-DB tests: creditMath 7, credits 4. (A first run on a trust-auth cluster failed `migrate.cli.test.ts › exit 1 on wrong password`. That came from my setup, not the diff; it passes with password auth.)
- `pnpm build` — built OK.

### Mutation checks (scratch copy, the four DB-heavy suites plus server/ai)
| Mutation | Result |
|---|---|
| Drop the advisory lock (`credits.js:151-152` → no-op) | **Not reliably caught.** Over 4 runs: 3 failed (only the sticker variant) and 1 was all green. The primary AC 1 test (`credits.db.test.ts:154`) never failed. See Issue 2. |
| vnMonth offset +8 h, or UTC | Caught (2 unit and 2 DB month-boundary tests) |
| Commit allowed after expiry | Caught (expiry test) |
| Expired reservations counted as live | Caught (expiry test) |
| Lasting spent before monthly | Caught (unit splitSpend, spend order, month boundary, RLS) |
| `RLS_TABLES` guard applied to all tables regardless of version | Caught (older migrations fail: 18 failures) |
| `force` dropped on credit_ops in the migration | Caught (runner guard) |
| Snapshot without the `no force`/`force` wrapper | Caught (migrator snapshot test) |
| Owner sub or ai_settings dropped from the snapshot | Caught (2 migrator tests) |
| Pending welcome counted | Caught (3 tests) |
| Monthly ops summed across periods | Caught (3 tests) |
| credit_settings policy `for all` | Caught (2 RLS tests) |
| Existing-op lookup skipped | Caught (op_key_mismatch test) |

### Acceptance criteria
- [ ] 1. Concurrent requests cannot overspend. The test exists and passes, but it does not prove the mechanism (see Issue 2). `credits.db.test.ts:154-163` stays green without the advisory lock. A pending welcome row inserted by the first transaction blocks the other seven on `credit_grants_welcome_once`, so the unique index serializes them by accident. The sticker variant (`:165-176`) catches a missing lock only about 3 times in 4.
- [x] 2. Same idempotency key never reserves or charges twice. Evidence: `credits.db.test.ts:178` (6 parallel with one key → 1 reserved, 5 replay), `:190`, `:211`, `:219`, and the unique constraint in `:115`. The mutation that skips the existing-op lookup is caught.
- [x] 3. A refund returns credits and a commit makes them spent. Evidence: `credits.db.test.ts:229` (refund goes back 4/6 to the right buckets) and `:239` (commit, noop, not_found).
- [x] 4. Monthly credits expire at the UTC+7 boundary with no rollover, and are spent first. Evidence: `creditMath.test.ts:29,36,42`; `credits.db.test.ts:294,324,340`. The offset and spend-order mutations are caught.
- [x] 5. Welcome 300 exactly once for existing accounts, pending for new ones, owner like anyone. Evidence: `migrator.db.test.ts` "credit ledger (F-706.1)" (snapshot incl. an ai_settings-only user and an owner with no rows; second run is a no-op); `credits.db.test.ts:367,385,395,411,423`. `credits.js` has no owner parameter or branch: grep finds only the comment on line 5.
- [x] 6. Every new table has RLS ENABLE + FORCE in the same migration and is covered by RLS tests. Evidence: migration `:82-96`; `rls.db.test.ts` credit ledger describe, catalog, pg_policies and maintenance tests; `schema.db.test.ts` lists; migrator guard test for credit_ops. The `for all` policy mutation is caught.
- [ ] 7. All checks pass. FAILED: `pnpm format:check` (Issue 1).
- [x] 8. Inert, and out of backup/restore (plan row, not a ticket AC). Evidence: `credits.test.ts › inert …` and `› backup.js never mentions credit_`. No non-test module imports `credits.js`. The credit tables have no FKs, so no `truncate … cascade` can reach them.

Ming verification after merge (not mine to verify; the PR must carry these):
- Check that `migrate` logs `applied 20261122120000_credit_ledger` on deploy.
- Optional read-only SQL: `select count(*), min(amount), max(amount) from credit_grants where bucket = 'welcome' and approved_at is not null;` should give the number of accounts with saved data (incl. Ming), amount 300.

### Issues
#### Issue 1 — 🔴 blocker — stray generated file committed, breaks format check (scope)
- **Where**: `.vitest/json/output.json` (new, 276 KB, in commit 052b99b)
- **Expected**: only the files in plan.md's file list. impl-log "Out-of-plan files: None".
- **Actual**: a Vitest JSON report is committed. It is not in the plan or impl-log, and it makes `pnpm format:check` exit 1. It also records an 818-test partial run, so impl-log's "format:check clean" cannot have been measured on this commit.
- **Fix instruction**: `git rm .vitest/json/output.json` (remove the `.vitest/` directory). Re-run `pnpm format:check` and record the real output. If you run Vitest with a JSON reporter again, write it outside the repo (scratchpad). Adding `.vitest/` to `.gitignore` is a follow-up, not part of this diff.

#### Issue 2 — 🔴 blocker — the AC 1 concurrency test does not detect a missing advisory lock (test strength, R8)
- **Where**: `server/ai/credits.db.test.ts:154-163` (primary AC 1 test) and `:165-176`; the mechanism under test is `server/ai/credits.js:151-152`.
- **Expected**: removing `pg_advisory_xact_lock` makes the AC 1 test fail every time. The lock is the only overspend guard once a user already has a welcome row, which is the steady state.
- **Actual**: with the lock removed, `:154` passed 4 of 4 runs. The first transaction inserts the pending welcome row, so the other seven wait on the `credit_grants_welcome_once` unique index until it commits, and READ COMMITTED then shows them the reserved op. The sticker variant failed 3 of 4 runs (one fully green run). A real regression could ship with green CI.
- **Fix instruction**:
  1. In the `:154` test, add a pending welcome row before the parallel calls: `await grant(OWNER_A, "welcome", 300, { approved: false });`. That is the steady state, where no unique-index wait serializes the transactions. I checked this in a scratch copy: with the lock removed, the test then failed in 4 of 5 runs, and at least one concurrency test failed in all 5.
  2. Add one deterministic test, e.g. `concurrency › reserve waits for the per-user advisory lock`. Open a transaction on `admin.connect()` and take `select pg_advisory_xact_lock(hashtextextended('credits:' || $1::text, 0))` for OWNER_A. Start `ledger().reserve(OWNER_A, "k1", "photo_fill")` and assert it has not settled after ~300 ms. Commit and release the admin client, then assert the result is `reserved`. Also assert that a reserve for OWNER_B completes while A's lock is held, so the lock is per user.
  3. Confirm in impl-log that removing the lock line makes these tests fail.

### Deviations from the plan (judged)
- **Monthly grants get `approved_at` = the injected clock** (`credits.js:97-103`). Accepted. plan.md Approach §1.2 (`check (bucket = 'welcome' or approved_at is not null)`) and §4 (monthly insert without `approved_at`) contradict each other. Setting it on monthly rows keeps the planned schema unchanged, and the balance query never reads `approved_at` for monthly. F-706.5's manual grants must set it too (the check enforces that).
- **`empty DB passes with and without owner` expects 9 migrations instead of 8** (`migrator.db.test.ts:255`). Accepted. It follows directly from adding a migration file.
- **Scratch cluster outside the scratchpad**. Accepted. This is environment only and touches no repo file; I hit the same mode-700 constraint.

### Rules (CLAUDE.md)
- R1: no client or data-layer change. OK.
- R2/R3/R4 (stale Supabase wording): the project equivalents are met. The new tables are in a new migration with RLS + FORCE in the same file, no applied migration was edited, the module holds no secrets, and no photo paths are involved.
- R5: the balance is computed in `computeBalance` (`credits.js:115-148`) and nothing is stored. OK.
- R7: Issue 1 (out-of-plan file). Otherwise every changed file is in the plan.
- R8: Issue 2. The pure helpers have unit tests, and the module has DB tests.
- R6/R9: not applicable.
- Migration README rules: expand-only header, manual rollback comment, no `begin`/`commit`/`concurrently`, a `no force`/`force` wrapper for the snapshot read, seed before FORCE, `owner_only` text identical to the existing policies. OK.

### Blockers from review agents
- security-ai-generated-code-auditor (security-review.md, attempt 1): PASS, no 🔴/🟡. None.

### Nits (do not block)
- 💭 `db/migrations/README.md:24-25`: the two added continuation lines lost the two-space bullet indent the surrounding lines use. They still render, but the source is uneven.
- 💭 `credits.db.test.ts:423` "OWNER_A as owner sub": the test never configures an owner sub. That is fine because the module has no owner input, but the title overstates what it does. The structural guarantee ("no ownerSub anywhere") could be a one-line source assertion in `credits.test.ts`.
- 💭 `credits.js:246-249`: `row` is computed and then `ins.rows[0]` is checked again. `const row = ins.rows[0]; if (row) …; return replay(findOp…)` would read more simply.

### Follow-ups (out of scope)
- Add `.vitest/` to `.gitignore` (via `/solo`) so reporter output cannot be committed again.
- The plan's follow-ups stand: F-706.4 balance route and one key per attempt; F-706.5 `withAdmin`, admin policies, approval amount rule (A4), manual grant `op_key`; stale R2/R3/R4 wording in CLAUDE.md.
