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
