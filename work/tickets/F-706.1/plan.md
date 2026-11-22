Status: READY

# Plan — F-706.1: Credit ledger with reserve, commit and refund

## Scope summary
Sources quoted:

- `docs/feature-list.md` F-706: "**F-706.1 Ledger:** Postgres ledger with reserve, commit and refund; welcome and monthly grants applied lazily on first AI use (there is no users table, D50)."
- F-706 AC, the parts that belong to this split:
  - "Concurrent requests cannot overspend: with a balance for one action, N parallel requests produce exactly one reservation (DB test)."
  - "Monthly credits expire without rollover at the month boundary in UTC+7 (see OQ-4)."
  - The idempotency half: "The same idempotency key never charges ... twice". The provider-call and replay half belongs to F-706.4.
- F-706 technical notes: "new tables follow D32 RLS. App-wide rows and admin reads across users do not fit the `owner_only` policy, so the plan must propose a narrow access path." The proposal is under Approach §8. F-706.5 builds it.
- **D53:**
  - "Postgres credit ledger with reserve → commit on success → refund on failure (no in-memory limiter)."
  - "Prices: cached result or existing chibi 0; AI photo fill 1; new AI suggestion (incl. shuffle) 1; draw or redraw a sticker 10."
  - "Grants: welcome +300, monthly +60 with no rollover; the admin can change the grant numbers and add credits."
  - "**Existing accounts get the 300 welcome credits once; accounts that join later get theirs only after the admin approves them** (join stays `open`, D38)."
  - "The owner spends credits like anyone and can top up. Welcome and manual credits never expire; monthly credits are spent first; months follow UTC+7."
- **D52:** credits are what limit the shared key. This ticket adds nothing to the key.
- **D50:** "**no users table**: rows stay keyed by `user_id` = mmlabs `sub`" and "**no admin role**: `TUDO_OWNER_SUB` stays the only special user (D38)".
- **D31/D32:** data is owned by `sub`. "Every table gets `user_id uuid` ... RLS `ENABLE` + `FORCE`". The migrations README requires RLS in the same migration for a new table.
- **D38:** the owner `sub` is exempt from the global AI ceilings only. D53 says "Owner exemptions from rate limits (D38) do not exempt anyone from the cap", so the ledger has no owner path.
- Ticket F-706.1 scope covers: the migration; the server module `reserve`/`commit`/`refund`/`balance` under a per-user advisory lock inside `withUser`; lazy grants with amounts from admin-adjustable settings; the welcome rules; the spend order and expiry; the `rls.db.test.ts` update.
- Ticket out of scope:
  - cap and USD price table (F-706.2)
  - shared key (F-706.3)
  - route wiring (F-706.4)
  - admin routes and UI (F-706.5, F-706.6)
  - user UI (F-706.7)

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Concurrent requests cannot overspend: with a balance for exactly one action, N parallel requests produce exactly one reservation. | `server/ai/credits.db.test.ts › concurrency › 8 parallel reserves (pool max 5) with balance for one photo_fill -> exactly one reserved row`. There are also sticker and mixed-bucket variants. All run on the real `createPool` (max 5, 5 s statement timeout) against a `createTestDb({ owner: true })` database, so RLS and FORCE apply. |
| 2 | The same idempotency key never reserves or charges twice for a user. | `credits.db.test.ts › idempotency`: sequential replay, 6 parallel calls with one key, a different kind with the same key, the same key for two users, and double commit/refund. The DB belt is `unique (user_id, op_key)`, tested under `schema constraints`. |
| 3 | A refund returns the reserved credits to the balance; a commit makes them spent. | `credits.db.test.ts › settle`: refund restores; commit keeps spent; commit after refund and refund after commit are no-ops; commit after expiry is refused. |
| 4 | Monthly credits expire without rollover at the UTC+7 month boundary, and are spent before welcome and manual credits (fixed clock). | Unit: `server/ai/creditMath.test.ts › vnMonth` and `› splitSpend`. DB, all with an injected fixed clock: `credits.db.test.ts › month boundary (UTC+7)` and `› spend order`. |
| 5 | An existing account receives the 300 welcome credits exactly once. A newly joined account's welcome credits do not count until approved. The owner gets and spends credits like anyone. | `server/migrator.db.test.ts › credit ledger (F-706.1)`: the snapshot gives existing users and `TUDO_OWNER_SUB` one approved 300 grant and none to others, and a re-run does not duplicate. `credits.db.test.ts › welcome`: pending does not count; approval via the admin pool makes it count; `ensureGrants` repeated or in parallel never duplicates; the owner id takes the same path as anyone. |
| 6 | Every new table has RLS `ENABLE` + `FORCE` in the same migration and is covered by the RLS tests. | `server/rls.db.test.ts › catalog …` and `› pg_policies …` (updated lists), plus new `› credit ledger` cross-user tests. `server/schema.db.test.ts › RLS enabled and forced …` (updated list). `server/migrator.db.test.ts › a later file that leaves credit_ops unforced fails the guard`. |
| 7 | All checks pass. | `pnpm format:check && pnpm typecheck && pnpm test && pnpm build`, with `TEST_DATABASE_URL` set so the DB tests run (CI enforces this, `server/test/pg.ts:7`). |
| 8 | The module is inert, and the credit tables stay out of backup and restore. This is not a ticket AC. It is the scope boundary with F-706.4 and the consults' risk "Restore must never touch credit tables". | `server/ai/credits.test.ts › inert: no non-test module imports credits.js except …` and `› backup.js never mentions credit tables`. |

## Ming verification after merge
- When the release that contains the migration is deployed, check that `migrate` logs `applied <version>_credit_ledger`.
- Optionally run read-only SQL on production (Ming's step):
  ```sql
  select count(*), min(amount), max(amount)
    from credit_grants
   where bucket = 'welcome' and approved_at is not null;
  ```
  Expect: count = the number of accounts that had saved data, including Ming; amount 300.
- Nothing else is visible. The ledger stays inert until F-706.4.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `db/migrations/<YYYYMMDDHHMMSS>_credit_ledger.sql` (new) | Adds `credit_settings`, `credit_grants`, `credit_ops`, the partial uniques, the settings seed, the existing-account welcome snapshot inside `no force`/`force`, ENABLE + FORCE + policies, and a manual-rollback header. | AC 1–6; D32/D53. | **Yes** (`db/migrations/**`) |
| `server/ai/creditMath.js` (new) | Pure helpers: `CREDIT_PRICES`, `creditPrice`, `vnMonth`, `splitSpend`, `isLive`, `isValidOpKey`, `RESERVATION_TTL_MS`. | R8: pure logic first; AC 4. | **Yes** (`server/**`) |
| `server/ai/credits.js` (new) | `createCreditLedger(pool, { now })` with `reserve`, `commit`, `refund`, `balance`. All SQL for the ledger lives here. | Ticket scope; AC 1–5. | **Yes** |
| `server/migrator.js` | `RLS_TABLES` becomes a map from table to the version it is guarded from. The three credit tables are guarded from the new migration's version. | Consult choice (Specialist input §7). Keeps the runner guard on the new tables without breaking older files. | **Yes** |
| `server/ai/creditMath.test.ts` (new) | Unit tests for the pure helpers. | R8. | **Yes** |
| `server/ai/credits.test.ts` (new) | No DB: argument validation, inertness, backup exclusion, and parity between the migration `kind` check and `CREDIT_PRICES`. | AC 8; drift guard. | **Yes** |
| `server/ai/credits.db.test.ts` (new) | DB tests as the owner role: schema constraints, concurrency, idempotency, settle, expiry, month boundary, spend order, welcome, settings. | AC 1–5. | **Yes** |
| `server/rls.db.test.ts` | Adds the three tables to the catalog set, the exact `pg_policies` list, the truncate and the maintenance loop. Adds cross-user credit tests. | AC 6; the catalog test rejects any new table (`:201`, `:209-237`). | **Yes** |
| `server/schema.db.test.ts` | Updates the hardcoded RLS list and the `user_id NOT NULL` list (`:246-264`). | Without this the test fails on the new tables. | **Yes** |
| `server/migrator.db.test.ts` | `withExtra` file version `20261114210000` becomes `29991231235959`. Adds a `credit ledger (F-706.1)` describe. | Without the version change, the four existing `withExtra` tests fail as "older than the newest applied one" (`migrator.js:64-68`). The new describe tests the snapshot and the guard. | **Yes** |
| `db/migrations/README.md` | One sentence: an app-wide table without user data (only `credit_settings` so far) gets ENABLE + FORCE and a narrow named policy instead of `owner_only`. Credit tables are not part of backup. | Without it the README rule "a new table gets … an `owner_only` policy" is wrong. | **Yes** (`db/migrations/**`) |
| `docs/data-model.md` | Short "Credit ledger (F-706.1, D53)" paragraph: the three tables, the computed balance, the `credit_settings` policy exception, not in backup. | The line-3 claim "every table has … `user_id = app.user_id`" stops being true. | No |
| `server/README.md` | Adjusts line 94 ("Every TuDo table has RLS … `owner_only`") to name the `credit_settings` exception. | Same reason. | **Yes** (`server/**`) |

No other file. In particular: `server/app.js`, `server/api.js`, the AI routes, `server/backup.js`, the error mirrors and `src/**` stay untouched.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `creditMath.test.ts › CREDIT_PRICES matches D53 (photo_fill 1, suggest 1, sticker 10) and is frozen` | D53 prices |
| `creditMath.test.ts › creditPrice returns null for an unknown kind, '' and 'toString'` | Validation; no prototype keys |
| `creditMath.test.ts › vnMonth: 2026-11-30T16:59:59.999Z -> 2026-11; 2026-11-30T17:00:00Z -> 2026-12; 2026-12-31T17:00:00Z -> 2027-01; 2026-02-28T17:00:00Z -> 2026-03` | AC 4, UTC+7 boundary incl. year rollover |
| `creditMath.test.ts › vnMonth does not depend on process TZ` (compute under the default `TZ=Asia/Ho_Chi_Minh` and compare with a hand-computed UTC value) | Domain focus: UTC vs UTC+7 |
| `creditMath.test.ts › splitSpend: monthly first (10 with 60/0 -> 10+0), partial (10 with 4/6 -> 4+6; 10 with 4/100 -> 4+6), lasting only (1 with 0/5 -> 0+1), exact (10 with 0/10), insufficient (10 with 4/5 -> null), negative or NaN avail treated as 0` | AC 4 spend order |
| `creditMath.test.ts › isLive: committed always; reserved when expiresAt > now (strict); refunded never` | Expiry rule |
| `creditMath.test.ts › isValidOpKey: 1..128 chars of [A-Za-z0-9_-]; rejects '', 129 chars, space, 'đ', non-string` | Key validation incl. diacritics |
| `credits.test.ts › reserve/commit/refund/balance throw on a non-canonical userId, an invalid opKey or an unknown kind before touching the pool` (pool stub that fails the test if `connect` is called) | Programmer-error contract |
| `credits.test.ts › migration kind check lists exactly Object.keys(CREDIT_PRICES)` (reads the migration file, regex on the `kind in (...)` check) | Drift guard (Specialist input §3) |
| `credits.test.ts › inert: no non-test file under server/ or src/ imports credits.js, and only credits.js imports creditMath.js` | AC 8 (R7, F-706.4 owns the wiring) |
| `credits.test.ts › backup.js never mentions credit_` | AC 8 (credits out of backup/restore) |
| `credits.db.test.ts › schema constraints › credit_grants: bucket/period coupling, period format, amount bounds, approved_at null only for welcome, one welcome per user, one monthly per user and period (23505/23514)` | Schema |
| `credits.db.test.ts › schema constraints › credit_ops: parts sum to credits, parts ≥ 0, credits 1..1000, kind list, state list, settled_at null iff reserved, op_key 1..128, unique (user_id, op_key) with the same key allowed for two users` | AC 2 belt |
| `credits.db.test.ts › schema constraints › credit_settings: a single row (second insert fails); amounts 1..100000; seeded 300/60` | Settings |
| `credits.db.test.ts › concurrency › 8 parallel reserves (pool max 5) with balance for one photo_fill -> exactly one reserved row` | AC 1 (N > pool size). Fixture: an admin-inserted monthly grant of 1 for the current period; welcome pending. Expect 1 `reserved` and 7 `welcome_pending`; one `reserved` row in the DB; then `balance().total === 0`. |
| `credits.db.test.ts › concurrency › balance for one sticker split across buckets (monthly 4 + approved welcome 6), 8 parallel sticker reserves -> exactly one, split 4 + 6` | AC 1 and AC 4 together |
| `credits.db.test.ts › concurrency › 6 parallel reserves with the same opKey -> one row; one 'reserved', five 'replay' of that op` | AC 2 under concurrency |
| `credits.db.test.ts › idempotency › same key replays the op (state, parts) and does not debit again; after commit replay shows committed; after refund replay shows refunded and does not re-reserve` | AC 2; terminal refunded key |
| `credits.db.test.ts › idempotency › same key with a different kind -> op_key_mismatch, nothing written` | AC 2 |
| `credits.db.test.ts › idempotency › the same key for users A and B gives two independent reservations` | Per-user key |
| `credits.db.test.ts › settle › refund returns the parts to the right buckets` (monthly 4 + lasting 6 back to 4/… exactly) | AC 3 |
| `credits.db.test.ts › settle › commit keeps credits spent; double commit -> noop (committed); refund after commit -> noop (committed); commit after refund -> noop (refunded); unknown key -> not_found` | AC 3, idempotent settle |
| `credits.db.test.ts › expiry › a reserved op counts until expires_at and not from expires_at on (clock +10 min −1 ms vs +10 min); commit at/after expiry -> 'expired' and the op stays reserved; refund after expiry -> refunded; a replay of an expired key reports expired: true and debits nothing` | Crash recovery; commit-after-expiry rule |
| `credits.db.test.ts › month boundary (UTC+7) › November: spend 50 of 60 monthly; at 2026-11-30T16:59:59Z monthly = 10; at 17:00:00Z period 2026-12, monthly = 60, lasting unchanged; no November credit carries over` | AC 4 no rollover |
| `credits.db.test.ts › month boundary (UTC+7) › an op reserved at 16:59:59Z (period 2026-11) and committed at 17:00:01Z counts against November, not December` | Period fixed at reserve |
| `credits.db.test.ts › spend order › 60 monthly + 300 welcome: photo_fill takes monthly; with 4 monthly left a sticker takes 4 + 6; once monthly is 0 everything comes from lasting; manual grants (admin-inserted) add to lasting and never expire across months` | AC 4 spend order; manual never expires |
| `credits.db.test.ts › welcome › a user without a snapshot grant gets one pending row on first balance(); it is not counted (total = 60) and balance.welcome = 'pending'; reserve beyond monthly -> welcome_pending` | AC 5 new account |
| `credits.db.test.ts › welcome › after the admin pool sets approved_at, the 300 count and balance.welcome = 'approved'` | AC 5 approval (F-706.5 does the real route) |
| `credits.db.test.ts › welcome › balance() twice and 5 parallel balance() calls create exactly one welcome and one monthly row` | Exactly once |
| `credits.db.test.ts › welcome › an approved snapshot row is kept (no second welcome row, stays approved) when ensureGrants runs` | Existing account, once |
| `credits.db.test.ts › welcome › OWNER_A as owner sub behaves exactly like OWNER_B (pending without a snapshot row, spends monthly first)` | AC 5 "owner like anyone"; there is no owner parameter |
| `credits.db.test.ts › settings › changing monthly_amount mid-month leaves this month's grant; next month's grant uses the new amount; welcome_amount is copied at row creation` | D53 admin-adjustable; F-706.5 AC "later grants use the new amounts" |
| `credits.db.test.ts › RLS › a ledger call for user B never reads or changes A's rows` (A's grants and ops intact; B's balance independent) | Isolation through the module |
| `rls.db.test.ts › credit ledger › B cannot select A's credit_grants/credit_ops; insert for A -> 42501; update/delete of A's rows touch 0 rows` | AC 6 |
| `rls.db.test.ts › credit ledger › credit_settings: readable in any withUser transaction; insert -> 42501; update/delete touch 0 rows` | AC 6, narrow policy |
| `rls.db.test.ts › catalog …` and `› pg_policies …` (updated expectations) | AC 6 |
| `rls.db.test.ts › maintenance › withMaintenance sees item_photos and the one credit_settings row, and nothing else` (credit tables added to the loop) | No new cross-user path |
| `schema.db.test.ts › RLS enabled and forced on all tables; user_id is NOT NULL on all user tables` (lists updated; test title adjusted) | AC 6 |
| `migrator.db.test.ts › credit ledger (F-706.1) › existing users (rows in any of the five tables, incl. one with only an ai_settings row) and TUDO_OWNER_SUB with no rows get one approved welcome grant of 300; a user with no rows gets none; run as the NOSUPERUSER owner` | AC 5 snapshot |
| `migrator.db.test.ts › credit ledger (F-706.1) › empty DB, no owner sub: no grants; settings seeded; all eight tables forced` | Empty-DB path |
| `migrator.db.test.ts › credit ledger (F-706.1) › second run is a no-op (grant rows unchanged)` | Exactly once at migration level |
| `migrator.db.test.ts › credit ledger (F-706.1) › a later file that leaves credit_ops unforced fails the guard and rolls back` | `RLS_TABLES` per-table version |

## Approach
1. **Migration** `db/migrations/<YYYYMMDDHHMMSS>_credit_ledger.sql`.
   - **Version.** Use the implementation timestamp. It must be newer than every file on `main` when merged. F-706.2 and F-706.3 also add migrations, so rename before merge if needed, and never after the file has been applied.
   - **Header comment:**
     - It is expand-only: three new tables and a seed. An older image never reads them, so a rollback to an older image is safe.
     - Existing-account snapshot (D53), as defined in Assumptions A1.
     - The tables are excluded from backup and restore.
     - Manual rollback, never run automatically:
       `drop table credit_ops; drop table credit_grants; drop table credit_settings;` (the policies and indexes go with the tables).
   - **No `begin`/`commit`, no `concurrently`** (README).
   - **Content, in this order.**
     1. **`credit_settings`**
        - `id boolean primary key default true check (id)`
        - `welcome_amount int not null default 300 check (welcome_amount between 1 and 100000)`
        - `monthly_amount int not null default 60 check (monthly_amount between 1 and 100000)`
        - `updated_at timestamptz not null default now()`
        - Then `insert into credit_settings default values;`.
     2. **`credit_grants`**
        - `id uuid pk default gen_random_uuid()`
        - `user_id uuid not null`
        - `bucket text not null check (bucket in ('welcome','monthly','manual'))`
        - `period text` with `check ((bucket = 'monthly') = (period is not null))` and `check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`
        - `amount int not null check (amount between 1 and 100000)`
        - `approved_at timestamptz` with `check (bucket = 'welcome' or approved_at is not null)`. Pending = a welcome row with `approved_at is null`.
        - `created_at timestamptz not null default now()`
        - `create unique index credit_grants_welcome_once on credit_grants (user_id) where bucket = 'welcome';`
        - `create unique index credit_grants_monthly_once on credit_grants (user_id, period) where bucket = 'monthly';`
     3. **`credit_ops`**
        - `id uuid pk default gen_random_uuid()`
        - `user_id uuid not null`
        - `op_key text not null check (length(op_key) between 1 and 128)`
        - `kind text not null check (kind in ('photo_fill','suggest','sticker'))`
        - `credits int not null check (credits between 1 and 1000)`
        - `monthly_part int not null check (monthly_part >= 0)`
        - `lasting_part int not null check (lasting_part >= 0)`, with `check (monthly_part + lasting_part = credits)`
        - `period text not null` with the same format check
        - `state text not null check (state in ('reserved','committed','refunded'))`
        - `expires_at timestamptz not null`
        - `created_at timestamptz not null default now()`
        - `settled_at timestamptz`, with `check ((state = 'reserved') = (settled_at is null))`
        - `constraint credit_ops_user_op_key unique (user_id, op_key)`. `user_id` leads, so this also serves the per-user scans; no other index is needed at this scale.
     4. **Snapshot.**
        - `alter table <t> no force row level security;` for locations, items, item_photos, wear_logs and ai_settings.
        - Then:
          ```sql
          insert into credit_grants (user_id, bucket, amount, approved_at)
          select u, 'welcome', (select welcome_amount from credit_settings), now()
            from (select user_id from locations
                  union select user_id from items
                  union select user_id from item_photos
                  union select user_id from wear_logs
                  union select user_id from ai_settings
                  union select nullif(current_setting('tudo.owner_sub', true), '')::uuid) s(u)
           where u is not null;
          ```
        - Then `alter table <t> force row level security;` for the same five tables (README "RLS rules"; the runner re-checks).
     5. **RLS.**
        - `credit_settings`: enable + force + `create policy credit_settings_read on credit_settings for select using (true);`.
        - `credit_grants` and `credit_ops`: enable + force + `owner_only for all using (user_id = (select app_user_id())) with check (user_id = (select app_user_id()))`. This is the exact text of the existing policies, so the `pg_policies` test stays uniform.
   - **No write policy on `credit_settings` yet.** Under FORCE nobody can change it through the app until F-706.5. The seed runs before `force`.
2. **Runner guard** (`server/migrator.js`).
   - Replace `RLS_TABLES` (array) with a frozen map:
     - the existing five → `RLS_VERSION`
     - `credit_settings`, `credit_grants`, `credit_ops` → `CREDIT_LEDGER_VERSION` (the new file's 14 digits)
   - `assertRlsForced` checks only the tables whose from-version ≤ the file being applied.
   - Activation stays by version, never by a table flag (the existing comment and test).
3. **Pure helpers** (`server/ai/creditMath.js`, `// @ts-check`, no I/O).
   - `CREDIT_PRICES = Object.freeze({ photo_fill: 1, suggest: 1, sticker: 10 })`. These are the D53 prices. Price-0 actions (cached result, existing chibi) never call `reserve`.
   - `creditPrice(kind)` uses an own-property check and returns `number | null`.
   - `vnMonth(nowMs) = vnToday(nowMs).slice(0, 7)`, reusing `server/validate.js:63`.
   - `splitSpend(price, monthlyAvail, lastingAvail)` returns `{ monthlyPart, lastingPart } | null`:
     - `monthlyPart = min(price, max(monthlyAvail, 0))`
     - `null` when `price − monthlyPart > max(lastingAvail, 0)`
   - `isLive({ state, expiresAt }, nowMs)` mirrors the SQL rule exactly: committed, or reserved with `expiresAt > now`.
   - `isValidOpKey(s)` matches `/^[A-Za-z0-9_-]{1,128}$/`.
   - `RESERVATION_TTL_MS = 10 * 60_000`.
4. **Ledger module** (`server/ai/credits.js`), built on the `createAiStore` shape (`server/ai/store.js:36`).
   - `createCreditLedger(pool, { now = Date.now } = {})` takes one injected clock, used for `period`, `expires_at`, `settled_at` and liveness. SQL never calls `now()` for logic; only the `created_at` defaults use it.
   - Every method:
     - validates its input first (`need(userId)` as in store.js, `isValidOpKey`, `creditPrice(kind) !== null`; programmer errors throw)
     - then runs **one** `withUser(pool, userId, …)` write transaction
     - whose first statement is `select pg_advisory_xact_lock(hashtextextended('credits:' || $1::text, 0))`
   - The `credits:` prefix never collides with `photo-quota:` (`photos.js:270-273`).
   - No I/O happens inside the transaction. Methods return result objects and never throw for business outcomes, so the pooled connection survives (`photos.js:268` pattern).
   - **`ensureGrants(c, userId, period)`** (internal, under the lock):
     - `insert into credit_grants (user_id, bucket, period, amount) select $1, 'monthly', $2, monthly_amount from credit_settings on conflict (user_id, period) where bucket = 'monthly' do nothing;`
     - `insert into credit_grants (user_id, bucket, amount) select $1, 'welcome', welcome_amount from credit_settings on conflict (user_id) where bucket = 'welcome' do nothing;` (approved_at stays null, i.e. pending)
   - **`computeBalance(c, userId, period, nowIso)`** (internal): one SQL statement that returns
     - `monthly = greatest(coalesce(monthly grant amount for $period, 0) − Σ monthly_part of live ops with period = $period, 0)`
     - `lasting = greatest(Σ amount of welcome grants with approved_at not null + manual grants − Σ lasting_part of all live ops, 0)`
     - `welcomePending = exists(welcome row with approved_at is null)`
     - live = `state = 'committed' or (state = 'reserved' and expires_at > $now)`
   - **`reserve(userId, opKey, kind)`.** The ticket's `credits` argument is dropped; the price is derived from `kind` on the server (Specialist input §9). Steps, under the lock:
     1. Look up `(user_id, op_key)`. If it exists: a different kind gives `{ status: 'op_key_mismatch' }`; otherwise `{ status: 'replay', op }`. There is no new debit and no re-arm, even when the op is refunded or expired.
     2. Run `ensureGrants`, then compute the balance.
     3. Call `splitSpend`. If it returns `null`, the result is `{ status: welcomePending ? 'welcome_pending' : 'insufficient', balance }`.
     4. Otherwise `insert … on conflict (user_id, op_key) do nothing returning *` as a belt, then `{ status: 'reserved', op }`.
   - **`commit(userId, opKey)`.** Under the lock:
     - `update credit_ops set state = 'committed', settled_at = $now where user_id = $1 and op_key = $2 and state = 'reserved' and expires_at > $now returning *`, which gives `{ status: 'committed', op }`.
     - If no row was updated, read the op:
       - missing gives `not_found`
       - reserved and expired gives `{ status: 'expired', op }` (the op stays reserved and dead)
       - otherwise `{ status: 'noop', op }`
   - **`refund(userId, opKey)`.** Under the lock: from `reserved`, with or without expiry, it gives `{ status: 'refunded', op }`. Otherwise it returns `noop` or `not_found`.
   - **`balance(userId)`** runs `ensureGrants` and `computeBalance` and returns `{ period, monthly, lasting, total, welcome: 'approved' | 'pending' }`. It is a write transaction on purpose (Assumption A8).
   - `op` is `{ opKey, kind, credits, monthlyPart, lastingPart, period, state, expiresAt (ISO), expired: !isLive && state === 'reserved' }`.
   - No `ownerSub` option exists anywhere, so there is structurally no owner exemption (D53, D38).
   - No HTTP codes and no import of `http.js`; F-706.4 maps statuses to error codes (R-g, the architect consult).
5. **Inertness.** Nothing outside tests imports `credits.js`. No route, no error code and no client change. `credits.test.ts` asserts it.
6. **Backup.** `server/backup.js` is not touched. A test asserts that it never names `credit_`, so export and import can never reset or restore spend.
7. **Existing tests.** Update the lists in `rls.db.test.ts` and `schema.db.test.ts`, and the `withExtra` version in `migrator.db.test.ts`. The reasons are in Files above, and the edits are kept minimal because these files are hotspots.
8. **Narrow access path for F-706.5.** Proposed here; nothing of it is built in F-706.1 (R7).
   - **Helper.** `withAdmin(pool, 'credits', fn)` in `server/db.js`, modelled on `withMaintenance`:
     - it uses a fixed task allow-list
     - it sets `tudo.admin = 'credits'` and clears `app.user_id`
     - it is read-write
   - **Policies,** in F-706.5's own migration:
     - `credit_grants`: `credit_admin_read for select`, `credit_admin_approve for update` (using/with check `bucket = 'welcome'`), and `credit_admin_manual for insert with check (bucket = 'manual')`
     - `credit_ops`: `credit_admin_read for select` only
     - `credit_settings`: `credit_admin_write for update`
     - every policy `using (current_setting('tudo.admin', true) = 'credits')`
   - **Trust model.** The route checks `sub === ownerSub` before calling it, the same model as the photo sweep.
   - The current column shape needs no table change for this. A manual-grant idempotency key (nullable `op_key` + partial unique) is an expand-safe add in F-706.5.
9. **CLAUDE.md rules.**
   - **R1:** server-side only; no client data access changes.
   - **R2/R3/R4** as written name Supabase. The project's real equivalents are met: RLS in the same migration (db/migrations README); the migration is never applied by agents; no secrets (the module holds none).
   - **R5:** the balance is computed and never stored.
   - **R7:** admin path, route, error codes and replay storage are deferred.
   - **R8:** unit tests for the pure helpers; DB tests for the repo-like module.
   - **R6/R9:** not applicable (no UI).

## Specialist input used
1. **Column name `lasting_part` vs `lifetime_part`.** Adopted the DB consult's `lasting_part`, and `lasting` in `balance()`. It names what welcome and manual credits share (they never expire). "Lifetime" reads like "all-time totals". One name is used in SQL, JS and tests.
2. **Grant uniqueness.** Adopted the DB consult's **partial uniques**, with `period` null for welcome and manual. Rejected the architect's `(user_id, bucket, period)` with sentinel periods (`'welcome'`, a uuid text):
   - Partial uniques keep the strict period format check.
   - "One welcome per user" becomes a direct DB fact.
   - `on conflict (…) where …` inference works on Postgres 17 (CI, ci.yml).
   - The manual-grant idempotency unique is deferred to F-706.5 (R7; expand-safe).
3. **Pending state: `status` column vs `approved_at is null`.** Adopted the architect's single `approved_at`, guarded by `check (bucket = 'welcome' or approved_at is not null)`. One column cannot disagree with itself (R5 spirit), and the approval in F-706.5 is a single `update … set approved_at`.
4. **`kind`: DB check vs JS-validated.** Adopted the DB consult's **enumerated DB check**, plus a parity unit test against `CREDIT_PRICES`.
   - The area is security, and the ledger is the record of money-like value.
   - A new kind needs a D53-style price decision anyway, and adding it is a one-line, expand-safe constraint swap.
   - Rejected the architect's `^[a-z_]{1,32}$`: it accepts unpriced kinds at the DB layer.
5. **`credits` column on ops.** Kept, from the DB consult. It states the charged price explicitly, and `check (monthly_part + lasting_part = credits)` catches split bugs.
6. **Refunded `op_key`: re-reservable vs terminal.** Adopted **terminal**, as the architect proposed and as option (b) in the DB consult.
   - F-706.4's AC says "the same idempotency key never charges **or calls the provider** twice". Re-arming a refunded key would allow a second provider call under one key.
   - The same applies to a reserved op whose key has expired: replay reports `expired: true` and debits nothing.
   - F-706.4 mints one key per attempt. Recorded as Assumption A6.
7. **Commit after expiry.** Adopted **refuse** (`status: 'expired'`). The DB consult preferred to allow it; the architect asked for one rule.
   - Refusing keeps the invariant "available ≥ 0", which is the AC 1 promise, and makes it testable.
   - The worst case is one free action after a ≥10-minute stall, versus provider timeouts of ≤45 s (`gemini.js:159`). Its USD cost still lands in F-706.2's meter.
   - Recorded as Assumption A7.
8. **`RLS_TABLES`: per-table version vs catalog test only.** Adopted the DB consult's **per-table from-version**. The runner guard is the layer that catches a later migration doing `no force` on a credit table and forgetting `force`. It is a small change, and a new migrator test covers it.
9. **Balance route.** Both consults: **not in F-706.1**. The architect's reasons: the route also needs F-706.2's AI-off state and the price list; without a route F-706.1 is fully inert and creates no pending rows before the cutover. F-706.4's ticket scope does not list it yet (follow-up).
10. **Price derived on the server from `kind`.** Adopted from the architect. No caller can underprice an action. The ticket's `reserve(user, opKey, kind, credits)` becomes `reserve(user, opKey, kind)`.
11. **Owner handling.** Adopted the architect's "no `ownerSub` parameter at all". From the DB consult's lazy owner case, the snapshot unions `tudo.owner_sub`, which the migrator already passes (`migrator.js:215`). The owner is then approved even on a DB where the owner has no rows, with no runtime owner code.
12. **"Existing account."** Both consults recommend Option A, a migration snapshot. Adopted (A1).
    - Rejected Option B, a `created_at` cutoff: restore writes `created_at` from the file (architect finding 6) and it needs a runtime cross-table query.
    - Rejected Option C, an approvals table: more tables, and pending would be implicit.
13. **Lazy grants in `balance()`.** Both consults agree; adopted, with the trade-off in A8.
14. **Settings table** with a select-only `using (true)` policy and no write policy until F-706.5: both consults; adopted. The amounts are snapshotted into grant rows.
15. **Concurrency test.** Uses N = 8 > pool max 5 (DB consult), on the real `createPool` and the owner role.
16. **Fixed clock** injected via `{ now }`; SQL takes `$now` parameters only (both consults).
17. **Also adopted:**
    - one TTL constant
    - the "no I/O in the transaction" rule
    - flags rather than throws
    - per-call short transactions (both consults)
18. **Not adopted in this ticket:** a `(user_id, period)` index ("if wanted"; not needed at tens of users). Admin policies and `withAdmin` are deferred to F-706.5 (both consults).
19. **Architect risk "CLAUDE.md is stale (R2/R4 name Supabase)".** Goes to follow-ups, not into the diff (R7).

## Assumptions
Items **A1–A7** need Ming's explicit approval at the plan gate. Each has a default that the plan implements.

**A1. Definition of "existing account" (D53).** It is a user id that, when this ticket's migration runs in production:
- has at least one row in `locations`, `items`, `item_photos`, `wear_logs` or `ai_settings`, **or**
- equals `TUDO_OWNER_SUB`.

Each such user gets one **approved** welcome grant of `welcome_amount` (300). Every other user gets a **pending** welcome grant the first time the ledger sees them. The snapshot is deterministic, cannot be spoofed afterwards (unlike a `created_at` cutoff), and is enforced "exactly once" by `credit_grants_welcome_once`.

**A2. Signed-in users with zero saved rows at migration time count as new (pending).** Without a users table (D50) they cannot be told apart from people who never signed in. Ming can approve them by hand in F-706.6.

**A3. Accounts created between the F-706.1 deploy and the F-706.4 cutover count as new (pending).** The line is the F-706.1 deploy, not the cutover.
- Alternative, if Ming wants the cutover as the line: F-706.4 adds one more idempotent snapshot migration (`on conflict … do nothing`). It is cheap. Nobody touches the ledger before the cutover, because the module is inert, so those users have no grant rows yet.
- Edge case: before the F-706.1 deploy, a brand-new user could import a backup to gain rows and become "existing". This is accepted; it needs a deliberate action before a fixed date.

**A4. The pending welcome amount is copied from `welcome_amount` when the pending row is created.** The column must be non-null.
- Recommendation for F-706.5: approval re-reads the current `welcome_amount` (`update … set amount = <current>, approved_at = …`), so "later grants use the new amounts" also holds for approvals.
- The schema supports both. Ming picks; F-706.5 implements it.

**A5. New (pending) accounts receive the monthly +60 immediately.** D53 gates only the welcome grant. This means each open sign-up can spend up to 60 credits (about 6 stickers, roughly $0.24) a month before approval, which is relevant to OQ-1 abuse.
- Alternative: no monthly grant until the welcome grant is approved. That is a small change in `ensureGrants`.
- Default: literal D53, monthly for everyone.

**A6. An idempotency key is terminal once refunded or expired.** A retry after a failure needs a new key; F-706.4's client mints one key per attempt. This follows F-706.4's AC "never calls the provider twice".

**A7. A commit after the reservation expired (10 min) is refused.** The op stays reserved, and the action is effectively free. This keeps the balance from ever going negative. It only happens after a stall far longer than any provider timeout.

**A8. `balance()` is a write transaction that applies lazy grants.**
- After F-706.4, a user who merely opens the credit UI gets their pending welcome row, which puts them in the admin approval queue, plus this month's monthly grant.
- The trade-off: drive-by sign-ups appear in the queue. That is the queue's purpose.

**A9. The balance read route lands in F-706.4 (`GET /api/credits`), not here.** F-706.4's ticket scope must be amended (follow-up). F-706.7 depends on it.

**A10. Bounds.** Grant and setting amounts are 1..100000, and an op is 1..1000 credits.
- An admin cannot set a grant to 0 to switch monthly credits off. If Ming wants that, F-706.5 relaxes the check (expand-safe) and `ensureGrants` skips 0.
- Welcome and manual credits are one "lasting" pool; the order inside it does not matter, because neither expires.

**A11. Production runs `migrate` with `TUDO_OWNER_SUB` set**, as it already must whenever rows exist (`db/migrations/README.md`). If it is unset, the owner is still covered by the snapshot, because Ming has saved rows.

**A12. `credit_settings` is visible (one row) to every transaction, including `withMaintenance`.** The numbers are not secret; the RLS maintenance test asserts this explicitly.

**Hotspots.** No other ticket is `IN_PROGRESS`, `REVIEW` or `DONE` today. F-706.2 (`ai_budget_months`), F-706.3 (app keys table), F-707.3 and F-708.1 will edit the same lists:
- `server/rls.db.test.ts`
- `server/schema.db.test.ts`
- `RLS_TABLES` in `server/migrator.js`
- `server/migrator.db.test.ts`

Their migrations also compete for the newest version. Expect rebases, and re-stamp the migration file name before merge if another migration lands first.

## Blocking questions
None. A1–A7 are defaults that Ming confirms or changes at the plan-approval gate. A change to A3 or A5 alters at most one SQL statement or one small follow-up migration.

## Split proposal
None. The ticket is about 350 lines of production code (migration ~90, `credits.js` ~200, `creditMath.js` ~50, migrator ~15, docs ~10). Tests come to about 500 lines, mostly DB fixtures. The architect consult estimates size M with no split.

## Follow-ups (not in this diff)
- **F-706.4 ticket:** add `GET /api/credits`, returning balance, welcome state, prices and the AI-off state, to its scope (A9). Make its client mint one idempotency key per attempt (A6). Add the stored-result replay (a nullable `result jsonb` on `credit_ops` or its own table) as an expand-safe migration.
- **F-706.5 ticket:**
  - the `withAdmin` helper and policies from Approach §8
  - the approval amount rule (A4)
  - an optional manual-grant `op_key` with a partial unique
  - relaxing the amount bounds if Ming wants 0 (A10)
- If Ming wants the cutover as the "existing" line (A3), F-706.4 adds the second snapshot migration.
- **CLAUDE.md:** R2/R3/R4 still name Supabase migrations, Edge Function secrets and the storage bucket. The real paths are `db/migrations/`, server env and Drive. This is stale documentation; route it via `/solo` (or a kit or CLAUDE.md fix).
- `server/migrator.db.test.ts` uses a fixed far-future `withExtra` version after this ticket. Consider deriving "after the newest real file" if more such tests appear.
