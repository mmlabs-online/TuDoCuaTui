## Attempt 1 — 2026-11-22 — security-ai-generated-code-auditor

Scope: a read-only review of `db/migrations/20261122120000_credit_ledger.sql`, `server/ai/creditMath.js`, `server/ai/credits.js`, `server/migrator.js` and the new or changed tests. I checked them against `plan.md` (A1–A12 approved), D32, D52, D53 and CLAUDE.md. I did not run git or the checks. The impl-log reports 2211 tests green, including 259 DB tests run against a real Postgres. I did not re-run them.

### Findings

**🔴 Blockers:** none.

**🟡 Should-fix:** none in this diff.

**🟢 Notes (verified safe, or hand-offs to later tickets)**

1. **RLS on the new tables is correct.** `credit_ledger.sql:82-96` turns RLS on with ENABLE + FORCE for all three tables.
   - `credit_grants` and `credit_ops` use the exact `owner_only` text (`user_id = (select app_user_id())`, with a matching WITH CHECK).
   - `credit_settings` has only `credit_settings_read for select using (true)`. Under FORCE, inserts fail with 42501 and update or delete touch 0 rows. `rls.db.test.ts:247-262` proves this.
   - The cross-user tests in `rls.db.test.ts:207-245` cover select, insert (42501) and update/delete (0 rows).
   - The runner guard now covers the three credit tables from `20261122120000` (`migrator.js:113-145`). `migrator.db.test.ts:698-710` proves that a later file that unforces `credit_ops` is rejected and rolled back.

2. **The existing-account snapshot is safe.** `credit_ledger.sql:60-80` turns `no force` and `force` off and on again inside the migrator's single transaction (`migrator.js:225-242`).
   - Any failure rolls back the toggle too.
   - `assertRlsForced` re-checks all eight tables before the commit. `migrator.db.test.ts:667` asserts `rls:true, forced:true` afterwards.
   - The only data that moves is `user_id` values into `credit_grants`. No user content crosses tables.
   - `tudo.owner_sub` is canonicalised by `parseOwnerSub` (`migrator.js:98-103`) before it is set. A hand-run psql with a bad value fails closed (a uuid cast error), so no grant is written.

3. **The price cannot be set by the caller.** `reserve(userId, opKey, kind)` has no `credits` argument. The price comes from `creditPrice(kind)` (`creditMath.js:12-16`), which uses an `Object.hasOwn` check on a frozen map, so `toString` and other prototype keys are rejected.
   - The DB `kind in (...)` check and `credits between 1 and 1000` back this up.
   - `credits.test.ts:37-46` fails if the DB kind list and `CREDIT_PRICES` drift apart.

4. **Concurrency and idempotency hold.** Each method takes `pg_advisory_xact_lock(hashtextextended('credits:'||user))` as its first statement inside `withUser` (`credits.js:109-110`). Under READ COMMITTED, every later statement sees all earlier committed reservations.
   - `unique (user_id, op_key)` plus `on conflict do nothing` backs this up at the DB level.
   - A replay never debits. A different kind under the same key returns `op_key_mismatch` and writes nothing.
   - Refunded or expired keys are terminal (A6).
   - Settling only moves an op out of `state = 'reserved'` (`credits.js:137-143`). Double commit, refund after commit and commit after refund are all no-ops.
   - A commit after expiry is refused (`expires_at > $now`), and the op stays dead (A7).
   - `refund` of an expired op only changes its label. It returns no credits, because the expired op was already not counted.
   - The DB tests with 8 parallel calls on a pool of 5 (single bucket and split bucket) and 6 parallel calls with the same key cover this (`credits.db.test.ts:153-187`).
   - A hash collision between two users' lock keys only serialises their calls. It cannot affect correctness.

5. **A pending welcome grant never counts, and nobody can mint credits through the ledger.** The `lasting` sum counts only `bucket = 'manual'` rows or welcome rows with `approved_at is not null` (`credits.js:88-90`).
   - `ensureGrants` inserts the welcome row without `approved_at`, so it stays pending. It inserts the monthly row with `on conflict do nothing` against the partial uniques.
   - The impl-log's deviation (monthly rows get `approved_at` set to the injected clock) is needed to satisfy the table check. It has no effect on any balance.

6. **The owner has no exemption.** No `ownerSub` or owner branch exists in `credits.js`, and the owner appears only in the one-time snapshot. `credits.db.test.ts:423` checks that the owner is treated like any other user.

7. **The clock is injected only.** `createCreditLedger(pool, { now })` is set at construction time. The SQL takes `$now` parameters for period, expiry, settlement and liveness, and no method accepts a time argument. `vnMonth` is a fixed +7 h offset (`validate.js:63`), independent of the process time zone.

8. **The module is inert, and credits stay out of backup.** Only test files import `credits.js`, which `credits.test.ts:48-58` enforces. `backup.js` never mentions the credit tables (`credits.test.ts:60-62`, grep confirmed). Export and import cannot reset or restore spend.

9. **I found no injection paths and no secrets.** Every value is passed as a `$n` parameter. The only template interpolations are the constants `LIVE` and `OP_COLUMNS`. `userId` must be a canonical UUID and `opKey` must match `^[A-Za-z0-9_-]{1,128}$` before the pool is touched. There are no keys, tokens or environment values.

10. **Defence in depth: `owner_only FOR ALL` lets a user's own transaction mint or erase their own credits** (`credit_ledger.sql:88-96`). In a `withUser(userA)` transaction, RLS allows `update credit_grants set approved_at = now()`, an insert of a `manual` grant, or `delete from credit_ops` for A's own rows. Today only `credits.js` runs SQL on these tables, so this is not exploitable. But a future bug in any `withUser` code path, or a generic "delete all my rows" feature, could self-approve, mint credits or wipe spend history. The approved plan chose identical `owner_only` text, so changing it here would be out of plan (R7).
    - Recommended fix in F-706.5's migration, which already adds credit policies: replace `owner_only` on the credit tables with per-command policies.
      - `credit_grants`: `select` with `user_id = app_user_id()`, plus `insert with check (user_id = app_user_id() and (bucket = 'monthly' or (bucket = 'welcome' and approved_at is null)))`. No user update or delete policy.
      - `credit_ops`: `select` and `insert` as the owner, plus `update` limited to the owner. No delete policy.
    - Manual grants and approvals would then go only through the `withAdmin('credits')` policies.

### Follow-ups (out of scope)
- **F-706.5:** narrow the user-side credit policies as described in note 10. Do it in the same migration that adds the admin policies.
- **F-706.4:** treat `reserve` → `{status:'replay'}` as "do not call the provider". This applies especially to a replay whose `state` is `reserved`, which means a concurrent request already holds the key. Otherwise two parallel requests with one key cause two provider calls. Also never treat `expired: true` as permission to run.
- **F-706.4:** on `commit` → `expired`, decide whether the result is still returned. A7 accepts one free action after a stall of 10 minutes or more. The route should enforce a provider timeout well under `RESERVATION_TTL_MS` so a client cannot cause that stall.
- **OQ-1 / A5:** pending sign-ups get 60 monthly credits before approval, as Ming accepted. Revisit this if the open join gets abused.

### Verdict
**PASS.** No blockers and no should-fix findings in this diff. This assumes the green checks reported in impl-log attempt 1, which the main reviewer must confirm (R8).

## Attempt 2 — 2026-11-22 — security-ai-generated-code-auditor

Scope: a read-only review of the attempt-2 changes only. I read:
- `/home/user/TuDoCuaTui/server/ai/credits.db.test.ts` (the whole file)
- `/home/user/TuDoCuaTui/db/migrations/README.md`
- the lock helper in `/home/user/TuDoCuaTui/server/ai/credits.js:108-110`
- impl-log Attempt 2, and review.md attempts 1 and 2

I did not run git or the checks. The reviewer's attempt-2 run reports 2212 tests passing, the DB suites running, and the lock-removal mutation caught. I relied on that and did not re-run anything. No production code changed, so attempt 1 findings 1–10 still stand as written.

### Findings

**🔴 Blockers:** none.

**🟡 Should-fix:** none.

**🟢 Notes**

1. **The deleted Vitest report (`.vitest/json/output.json`): no secret concern found, with one caveat.** The file is deleted, so I could not read it.
   - A Vitest JSON reporter writes test names, file paths, pass/fail status and failure messages. It does not write environment variables.
   - The only credential that could plausibly appear is in a failure message: the `TEST_DATABASE_URL` of the implementer's throwaway local Postgres cluster. That cluster was local only, used scram auth, and has been stopped and removed (impl-log attempt 1 and 2). Even if it appears, it is not a live secret, so nothing needs rotating.
   - No production secret could be in that file. The app's secrets (Identity, Drive, AI key) are not used by the test suites that produced it.
   - Caveat: the file is still in the history of commit `052b99b` on `ticket/F-706.1`, because `git rm` only removes it from later commits. If anyone wants to be certain, check the blob with `git show 052b99b:.vitest/json/output.json | grep -iE 'postgres(ql)?://|password|secret|token|key='` before merging. A squash merge keeps it out of `main`'s history altogether. This is optional.
   - Adding `.vitest/` to `.gitignore` remains a follow-up, as both reviews already note.

2. **The 8-parallel test is stronger, not weaker** (`credits.db.test.ts:154-165`).
   - It now pre-inserts a pending welcome row. That removes the accidental serialization on the `credit_grants_welcome_once` unique index, so the test now depends on the advisory lock.
   - It also adds two assertions on the pending welcome under concurrency: the 7 losers return `welcome_pending` (not `reserved`), and `balance().total` is 0 afterwards even though a 300-credit welcome row exists. So a pending welcome is now proven never to count while calls run in parallel, on top of the existing serial welcome tests (`:399-425`).

3. **The new lock-wait test matches the production lock and proves it is per user** (`credits.db.test.ts:167-195`).
   - The holder takes `pg_advisory_xact_lock(hashtextextended('credits:' || $1::text, 0))`, the same expression as `credits.js:110`. A real wait therefore proves the module takes that lock before it touches any data.
   - `reserve(OWNER_B)` completes while A's lock is held, so one user's lock does not block another user.
   - `reserve(A)` returns `reserved` after the commit, which shows the waiting call goes on to read committed state.
   - The 300 ms window can only fail safe: a slow machine could at worst let a missing lock pass, never fail a correct implementation. Per the reviewer, the deterministic test failed in 5 of 5 lock-removed runs.
   - Cleanup is sound: `rollback` after `commit` is a caught no-op, and the client is always released.
   - The holder connects through the `admin` pool. That only takes a session-level advisory lock and reads no credit rows, so the test does not go around RLS.

4. **RLS coverage is unchanged.**
   - The `RLS` describe (`:488-507`) is unchanged.
   - The `rls.db.test.ts`, `schema.db.test.ts` and `migrator.db.test.ts` credit tests are not part of this delta.
   - The new tests run the ledger through the owner-role `pool` (NOSUPERUSER, FORCE applies). Only fixtures and the lock holder use `admin`, the same pattern as attempt 1.

5. **The test rename has no security effect.** `:455` is now "two different users behave the same (no owner parameter)". Per the reviewer the body is unchanged, and it still asserts that OWNER_A and OWNER_B get identical results (no owner exemption).

6. **The README change is indentation only** (`db/migrations/README.md:23-26`). The rule text is unchanged: only `credit_settings` gets a narrow policy instead of `owner_only`, and credit tables are not part of backup or restore.

### Follow-ups (out of scope)
- Add `.vitest/` to `.gitignore` (via `/solo`).
- Optional: scan the `052b99b` blob as described in note 1, or squash-merge.
- Carried over from attempt 1 and still open: narrow the user-side credit policies in F-706.5 (attempt 1 note 10), and the F-706.4 route handling for replay, expiry and timeouts.

### Verdict
**PASS.** No blockers and no should-fix findings. The attempt-2 test changes make the security properties more strongly tested: the concurrency and lock tests now fail without the advisory lock, and a pending welcome is shown not to count under concurrency. RLS coverage is unchanged. The deleted report raises no live-secret concern.
