# database-optimizer consult: F-706.1 credit ledger

## Findings
1. **Transaction plumbing.** `withUser` sets `app.user_id` per transaction and refuses nested transactions (`server/db.js:43-77`, `:83-97`). Pool: max 5 connections, 3 s to get a connection, 5 s statement timeout (`server/db.js:12-17`). So every ledger call (reserve, commit, refund, balance) needs its own short `withUser` transaction. None of them can be called from inside another `withUser`.
2. **Advisory-lock pattern to copy.** `photos.js:270-273` uses `pg_advisory_xact_lock(hashtextextended('photo-quota:' || $1::text, 0))`, then recounts under the lock, and returns a flag rather than throwing so the pooled connection survives (`photos.js:268`). The ledger should use its own prefix (`'credits:'`) so it never shares a lock key with photo-quota.
3. **RLS conventions.**
   - A new table needs `enable` + `force` + `owner_only` with the exact form `user_id = (select app_user_id())` (`db/migrations/20261114200000_row_level_security.sql:15-45`).
   - The only non-owner path today is a policy keyed on a transaction-local setting (`photo_sweep_read`, `:47-48`; `withMaintenance`, `db.js:105-114`).
   - SECURITY DEFINER does not help, because the app is the owner role under FORCE (`docs/ai-stylist-notes.md:65`).
   - A migration that reads or writes existing rows must wrap them in `no force` ... `force` (`db/migrations/README.md`, "RLS rules").
4. **Hardcoded table lists that break on a new table.**
   - `server/rls.db.test.ts:15` (`TABLES`), `:42` (truncate), `:201` (catalog: exact set of RLS tables), `:209-237` (exact `pg_policies` list).
   - `server/schema.db.test.ts:246-264`: hardcoded RLS list and `user_id NOT NULL` list. The `user_id` query matches any table with a `user_id` column, so a settings table without one is fine there.
   - `server/migrator.db.test.ts:23` (`TABLES`, only used for the five original tables; fine to leave).
   - `server/migrator.js:111-131`: `RLS_TABLES` is the runner guard. Adding the new tables there naively would break every file between `20261114200000` and the new migration: the table does not exist yet, so `r` is undefined and the guard throws. It needs a per-table "from version" (for example `{credit_grants: '2026112...'}`), or the tables stay out of the runner guard and are covered by the catalog test only. Planner should pick one; I recommend per-table versions, a small change.
5. **No users table** (D50). The only identity is `user_id = sub`. The owner sub is known at runtime (`server/auth.js:23-26`, passed as `ownerSub` in `server/app.js:43`) and at migrate time as `tudo.owner_sub` (`server/migrator.js:215`).
6. **UTC+7 helper already exists:** `vnToday(now)` in `server/validate.js:62-63`. Month = `vnToday(now).slice(0,7)`. It is pure and takes an injected clock, which fits the fixed-clock test.
7. **Postgres 17** in CI (`.github/workflows/ci.yml:22,58`), so `NULLS NOT DISTINCT` and partial-unique `on conflict` inference are available.
8. **Reservation expiry vs provider timeouts.** The longest provider timeout is 45 s (`server/ai/gemini.js:159`). An expiry of about 10 min is far above that, so a commit arriving after expiry should be practically impossible.
9. **Backup** export and import cover locations, items, wear_logs and photos only (`server/backup.js:62-77`). Credit tables must stay out of backup and import, or a user could restore credits.

## Recommendations

### Tables (one migration, e.g. `2026112xxxxxxx_credit_ledger.sql`)

**`credit_grants`** (credits in)
- Columns:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null`
  - `bucket text not null check (bucket in ('monthly','welcome','manual'))`
  - `period text null`: `'YYYY-MM'` UTC+7 month for monthly, null otherwise. Use `check ((bucket='monthly') = (period is not null))` and `check (period ~ '^\d{4}-(0[1-9]|1[0-2])$')`.
  - `amount int not null check (amount > 0 and amount <= 100000)`
  - `status text not null default 'active' check (status in ('active','pending'))`
  - `check (status='active' or bucket='welcome')`: only welcome can be pending.
  - `approved_at timestamptz null`
  - `op_key text null`: idempotency for admin manual adds in F-706.5.
  - `created_at timestamptz not null default now()`
- Uniques (partial, so `on conflict` can target them):
  - `unique (user_id) where bucket='welcome'`: at most one welcome grant per user, so "exactly once" holds in the DB.
  - `unique (user_id, period) where bucket='monthly'`
  - `unique (user_id, op_key) where bucket='manual'`
- Snapshot `amount` at insert time. Later admin changes to the setting only affect new grants (welcome-pending keeps its snapshot; planner may choose to re-read at approval in F-706.5).

**`credit_ops`** (credits out)
- Columns:
  - `id uuid pk`
  - `user_id uuid not null`
  - `op_key text not null check (length(op_key) between 1 and 128)`
  - `kind text not null check (kind in ('photo_fill','suggest','sticker'))`
  - `credits int not null check (credits > 0)`
  - `monthly_part int not null check (monthly_part >= 0)`
  - `lasting_part int not null check (lasting_part >= 0)`. I suggest renaming the notes' `welcome_part`, because it covers welcome and manual credits together.
  - `check (monthly_part + lasting_part = credits)`
  - `period text not null`: the UTC+7 month of the reservation; `monthly_part` counts against this month.
  - `state text not null check (state in ('reserved','committed','refunded'))`
  - `expires_at timestamptz not null`
  - `created_at`, `settled_at timestamptz null`
  - `check ((state='reserved') = (settled_at is null))`
- `unique (user_id, op_key)`. This also serves as the per-user scan index, since `user_id` leads. No other index is needed at this scale (tens of users, hundreds to thousands of ops per user per year). If wanted, add `(user_id, period)` for the monthly sum.
- No FKs: there is no users table, and ops do not reference a specific grant. Allocation is computed from the bucket totals.

**`credit_settings`** (single app-wide row)
- Columns: `id boolean pk default true check (id)`, `welcome_amount int not null default 300 check (> 0)`, `monthly_amount int not null default 60 check (> 0)`, `updated_at`.
- No `user_id`. RLS:
  - `enable` + `force`.
  - Policy `credit_settings_read for select using (true)`: non-secret numbers every user needs at grant time.
  - No write policy in F-706.1. The admin write policy (`for update using (current_setting('tudo.admin', true) = 'credits')`) lands with F-706.5.
- Seed with `insert ... values (default)` in the migration, before `force`.
- Alternative: keep the amounts in config until F-706.5. Not recommended, because the ticket says "read from admin-adjustable settings".

### Balance: computed, never stored (R5)
- "Live" ops are `state='committed' or (state='reserved' and expires_at > $now)`.
- `monthly_avail = coalesce(amount of active monthly grant for period P, 0) - sum(monthly_part of live ops where period = P)`
- `lasting_avail = sum(amount of active welcome/manual grants) - sum(lasting_part of all live ops)`
- `pending_welcome`: returned separately for the F-706.7 waiting state. It never counts toward the balance.
- Spend order on reserve: `monthly_part = least(credits, greatest(monthly_avail, 0))`, `lasting_part = credits - monthly_part`. Refuse when `lasting_part > lasting_avail`.
- Expiry with no rollover follows from computing only against the current `P`. An old month's grant is never summed again. No job is needed.
- Pass `$now` and `P` from Node; SQL never calls `now()` for logic. Only `created_at` defaults use the DB clock. This keeps the fixed-clock tests exact.

### Concurrency (AC1)
- Inside one `withUser` transaction (READ COMMITTED), in this order:
  1. `pg_advisory_xact_lock(hashtextextended('credits:' || $1, 0))` as the first statement.
  2. `ensureGrants`.
  3. Check for an existing `op_key`.
  4. Compute the balance.
  5. Insert the op.
- Each statement in READ COMMITTED takes a new snapshot, so after the lock is acquired the reads see the previous holder's committed insert.
- Do not use SERIALIZABLE (retry noise for no benefit).
- Return an `insufficient` flag instead of throwing (photos.js pattern).
- Lock waits count toward the 5 s statement timeout. Each transaction lasts milliseconds, so that is fine.

### Idempotency (AC2)
- Look up `(user_id, op_key)` under the lock before inserting. If found, return the existing op: `{replay: true, state}`. Never insert again or re-debit.
- Keep `insert ... on conflict (user_id, op_key) do nothing returning` as a belt, in case a caller skips the lock.
- Commit: `update credit_ops set state='committed', settled_at=$now where user_id=$1 and op_key=$2 and state='reserved' returning ...`. Refund is the same with `'refunded'`.
- Zero rows updated means already settled or missing. Return the current state; do not throw. A double commit or a commit after refund is then a no-op, and the result tells the caller which.
- Commit is allowed even after `expires_at`, so the charge stays truthful. The worst case is a bounded negative balance. Practically impossible, given the 45 s timeout vs 10 min (Finding 8).
- Retry semantics (open question 2):
  - Option (a), recommended: one `op_key` per user action. A refunded key may be re-reserved by flipping `refunded` to `reserved` under the lock with a fresh balance check and new `expires_at`.
  - Option (b): a refunded key is final, and the client must mint a new key per attempt.
  - Either way, a reserved-but-expired op with the same key should be re-armed (balance re-check, new `expires_at`), not duplicated.

### Crash recovery
- Stale `reserved` rows past `expires_at` drop out of the balance. No sweeper is needed.
- A TTL of about 10 min is fine (60 s+ would also do). Make it a constant in the ledger module.
- Rows stay `reserved` forever in the table. That is harmless; optionally report them as `expired` in reads.

### Lazy grants (D50, D53)
`ensureGrants(c, userId, now, ownerSub)` runs under the same lock:
- Monthly: `insert into credit_grants (user_id,bucket,period,amount) select $1,'monthly',$P,monthly_amount from credit_settings on conflict (user_id, period) where bucket='monthly' do nothing`.
- Welcome: `insert ... bucket='welcome', status = case when $1 = $owner then 'active' else 'pending' end ... on conflict (user_id) where bucket='welcome' do nothing`.
  - For existing accounts the row already exists (see below), so `do nothing` keeps it active, once.
  - The owner case covers a DB that was empty at migration time and satisfies "owner spends like anyone".
- Call `ensureGrants` from `balance()` too, not only from `reserve()`. A new account then shows up as pending (admin queue in F-706.5, waiting state in F-706.7) as soon as it opens the credit UI, not only after its first paid tap.
  - This makes `balance()` a write transaction. Planner should note the accepted trade-off; it also takes the lock.

### "Existing account gets 300 once; new accounts after approval" without a users table
- **Option A (recommended): snapshot in the migration.**
  - The migration inserts an `active` welcome grant (amount 300) for every distinct `user_id` in `items ∪ locations ∪ item_photos ∪ wear_logs ∪ ai_settings`.
  - Wrap those five tables in `alter table … no force row level security; … force row level security;` (README rule; the runner re-checks, `migrator.js:120-131`).
  - Insert into `credit_grants` before it is forced, or `force` it at the end of the file.
  - Pros: deterministic, no runtime cross-table query, "exactly once" enforced by the partial unique, trivially testable in `migrator.db.test.ts`.
  - Con 1: a user who signed in but never saved a row is not "existing" and becomes pending. They are indistinguishable without a users table; flag this to Ming.
  - Con 2: the snapshot moment is the F-706.1 deploy, not the F-706.4 cutover. Accounts created in between are pending. Arguably correct; confirm with Ming.
  - Image-rollback-safe: an older image never touches the new tables.
- **Option B: cutoff timestamp.** A `credit_settings.existing_before timestamptz`, set at migration. Lazily, the caller is existing if any of their own rows (visible under RLS) has `created_at < cutoff` (items, locations and item_photos have `created_at`, `init.sql:35,58,87`). Cons: a runtime query over four tables on first grant; a user who deleted all old rows loses the status. Backup import does not set `created_at` (`backup.js:132`), so the status cannot be forged that way.
- **Option C: separate `credit_approvals(user_id pk, approved_at, approved_by)` table**, with welcome grants inserted only when approved. Cons: more tables and policies, and pending is implicit (ever seen but not approved), which needs a "seen" record anyway. So pending-as-`status` on `credit_grants` (A/B) is simpler. Approval in F-706.5 is `update credit_grants set status='active', approved_at=… where bucket='welcome' and status='pending' and user_id=$1`.

### RLS and the admin path
- `credit_grants` and `credit_ops`: `owner_only` (identical text, so the `pg_policies` assertion stays uniform). `credit_settings`: select-only `using (true)`.
- Admin, deferred to F-706.5 migration: a `withAdmin(pool, task)` helper modelled on `withMaintenance`, with setting `tudo.admin = 'credits'` and `app.user_id` cleared.
  - `credit_grants`: policies `credit_admin_read for select`, `credit_admin_approve for update` (with check `bucket='welcome'`), `credit_admin_manual for insert with check (bucket='manual')`.
  - `credit_ops`: `credit_admin_read for select` only.
  - `credit_settings`: `credit_admin_write for update`.
  - The Node route checks `sub === ownerSub` before using it, the same trust model as photo-sweep.
- Do not add admin policies in F-706.1 (R7). Do pick the column shape now so F-706.5 needs no table change.
- RLS for `user_id`-keyed tables is per-user even for the owner. The owner reading their own balance goes through `withUser` like anyone.

### Migration and down-migration notes
- One forward file, no `begin`/`commit`, no `create index concurrently` (README).
- Header comment with a manual rollback: `drop table credit_ops; drop table credit_grants; drop table credit_settings;` (and the policies go with them). Never run automatically.
- Expand-only, safe for an older image, unless the snapshot wrap mis-orders `force` (the runner will catch that).
- Extend `RLS_TABLES` in `migrator.js` with per-table versions, or deliberately leave it and rely on the catalog test (decide in the plan).
- No changes to `items_with_stats`.

### DB tests (owner role, real Postgres, `createTestDb({ owner: true })`)
- **`rls.db.test.ts`:** add the three tables to the catalog set (`:201`), the `pg_policies` expectation (`:209-237`) and the truncate (`:42`). Cross-user tests: B cannot read, update or insert A's grants and ops (insert gives 42501, update touches 0 rows). Every user can select `credit_settings`; no one can update it via `withUser` (0 rows).
- **`schema.db.test.ts:246-264`:** update the RLS list and the `user_id` NOT NULL list (adds `credit_grants`, `credit_ops`). Add check-constraint tests: parts sum, bucket/period coupling, pending only for welcome, the three partial uniques.
- **New `server/credits.db.test.ts`:**
  - Concurrency: balance = 1 credit, N = 8 parallel `reserve(…, 1)` with distinct keys, more than the pool size so queueing is exercised. Exactly 1 reserved, 7 insufficient. Also a sticker variant: balance 15, 3 × 10, exactly 1.
  - Parallel same `op_key`: exactly one row, all callers see the same op.
  - Commit/refund: refund restores the balance; commit keeps it spent; double commit and commit after refund are no-ops returning state; commit after expiry succeeds.
  - Stale reservation: a fixed clock past `expires_at` restores the balance.
  - UTC+7 boundary: `now = 2026-11-30T16:59:59Z` is period 2026-11; `17:00:00Z` is 2026-12. Unspent November monthly credits are gone and the new 60 appears. Monthly is spent before lasting; a 10-credit sticker with 4 monthly left splits 4 + 6.
  - Welcome: migration snapshot gives existing users one active grant (in `migrator.db.test.ts` with seeded rows). A second `ensureGrants` does not duplicate it. A new user gets pending, and the balance excludes it. Owner on an empty DB gets active. Approval flip (via admin SQL in the test) makes it count.
  - Settings: changing `monthly_amount` affects only the next period's grant.
- **Pure unit tests (no DB)** for the period helper and the split function, if they are factored out.

## Risks
- **Pool starvation:** many parallel AI calls for one user each hold a connection while waiting on the lock. Mitigated by millisecond transactions and the existing in-flight slots (`server/app.js:59-75`), but do not do any I/O inside the reserve transaction.
- **`RLS_TABLES` / `rls.db.test.ts` hotspot:** F-706.2, F-707.3 and F-708 also add tables. Expect merge conflicts; keep the list edits minimal.
- **Snapshot (Option A) misses** accounts with zero saved rows, and treats accounts created between the F-706.1 deploy and the F-706.4 cutover as new. This needs Ming's OK.
- **`balance()` as a write** creates a pending welcome row for anyone who opens the credit UI, including drive-by sign-ups. Accepted: it is what populates the approval queue.
- **Clock mixing:** if any SQL uses `now()` for expiry or period while Node passes `$now`, fixed-clock tests become flaky. Enforce "params only" in review.

## Open questions
1. Definition of "existing account": Option A snapshot at the F-706.1 deploy (recommended), Option B cutoff timestamp, or Option C approvals table. Is "has at least one saved row" acceptable to Ming? Likely needs a decisions.md entry.
2. `op_key` after refund: re-reservable (recommended) or final?
3. Does the caller's own balance read route land here or in F-706.4? From the DB side `balance()` is ready either way; routing it here lets F-706.7 start earlier.
4. Welcome amount for pending accounts: keep the amount snapshotted at first sight, or re-read `welcome_amount` at approval (F-706.5)?
5. `RLS_TABLES` in the migrator: per-table version (recommended) or catalog test only?
