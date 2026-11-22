## software-architect consult: F-706.1 (credit ledger)

Read-only consult. I edited no files.

### Findings
1. **Transactions and locking are already in place.** `withUser` (server/db.js:83-97) is the only way to reach user tables. It rejects nested transactions (db.js:51). The pool has 5 connections and a 5 s statement timeout (db.js:14,17). There is a per-user advisory-lock precedent at server/photos.js:270-273, with the key `hashtextextended('photo-quota:'||uid,0)`.
2. **The store pattern to copy is `createAiStore(pool)`** (server/ai/store.js:36). All SQL lives in one module and `need(userId)` validates the caller. The AI context is built once in server/app.js:76-86 and handed to the routes.
3. **The existing cross-user read path is narrow on purpose.** `withMaintenance` is read-only and uses a fixed allow-list (db.js:38,106-114). The policy it unlocks is `photo_sweep_read`, which keys on `tudo.maintenance` (20261114200000_row_level_security.sql:49-50). It cannot write, so F-706.5 (approve welcome credits, manual grants) will need a new write path.
4. **Hotspots for test lists:** server/rls.db.test.ts:15 (`TABLES`), :40 (truncate), :201-213 (catalog), :215-243 (exact pg_policies list), :248-251 (maintenance "nothing else" loop). server/schema.db.test.ts:251,259 also hard-codes the table list, which the ticket does not mention.
5. **The owner's identity lives only in Node.** It comes from `ownerSubOf` (auth.js:31) and `meBody` (me.js:8). Owner exemptions exist only in the in-memory limiters (rateLimit.js:75-81, app.js:51-86).
6. **`created_at` cannot be trusted to define "existing account".** Restore writes `created_at` from the backup file (server/backup.js:123-128), so a user can fake an old date. Migrations do receive `tudo.owner_sub` (server/migrator.js:215). The README rule that any migration reading the 5 user tables must wrap the read in `no force` / `force` applies (db/migrations/README.md).
7. **Error mirrors:** `AI_ERROR_STATUS` is defined in src/shared/ai/errors.ts:4 and server/ai/catalog.js:27, and server/ai/parity.test.ts enforces that they match. The client-side code list is `AI_BATCH_OFF` (src/data/photoImport.ts:36). F-706.4's scope already owns the new codes (out of credit, welcome pending), and F-706.2 owns the cap code.
8. **Provider timeouts are short compared with a 10-minute expiry.** Tag-photo times out at 45 s (gemini.js:159) and key checks at 10 s (gemini.js:72). The suggest timeout is similar.

### Recommendations
**R-a. Module boundary (scope; R1/R7).** Add `server/ai/credits.js` exporting `createCreditLedger(pool, { now })`, next to store.js. Put the pure helpers in `server/ai/creditMath.js`:
- `vnMonth(now)`: build it on `vnToday` from server/validate.js:63.
- `split(price, monthlyAvail, lifetimeAvail)`: monthly credits first, then lifetime.
- `isLive(op, now)`: drops `reserved` ops past `expires_at`.

Proposed API. Every call goes through one `withUser` transaction and takes `pg_advisory_xact_lock(hashtextextended('credits:'||$1,0))` first:
- `reserve(userId, opKey, kind)` returns one of:
  - `{ ok: true, opKey, state: 'reserved', replay: false }`
  - `{ ok: true, replay: true, state }` when the key already exists
  - `{ ok: false, reason: 'insufficient' | 'welcome_pending' | 'op_key_mismatch' }`
- The price comes from a server-side `CREDIT_PRICES = { photo_fill: 1, suggest: 1, sticker: 10 }` table (D53), not from the caller. The ticket's `credits` argument then becomes derived, so no caller can underprice an action.
- `commit(userId, opKey)` and `refund(userId, opKey)` change state only from `reserved`. Repeat calls are idempotent, and they return a flag for a wrong-state call; they do not throw.
- `balance(userId)` returns `{ monthly, lifetime, total, period, welcome: 'approved' | 'pending' | 'none' }`.
- Every function returns reasons, never HTTP codes. F-706.4 maps reasons to codes. Inner logic does not import http.js.
- No `ownerSub` parameter at all, so there is structurally no owner exemption (D53).
- Leave **`grant` and approval out of F-706.1** (R7; approval is F-706.5). Tests insert grants and approvals through the admin pool.
- Use one injected clock for both `period` and `expires_at`. Do not use DB `now()`, so fixed-clock tests stay deterministic.

**R-b. Schema (AC concurrency, idempotency, RLS).**
- `credit_grants(id, user_id, bucket check in ('welcome','monthly','manual'), period text, amount int > 0, approved_at timestamptz null, created_at)`:
  - unique `(user_id, bucket, period)`
  - `period` = `'YYYY-MM'` for monthly, `'welcome'` for welcome, and a uuid text for manual
  - check `bucket = 'welcome' or approved_at is not null`
  - Pending welcome approvals live here: welcome rows with `approved_at is null`. F-706.5 lists and approves them, so no extra table is needed.
- `credit_ops(id, user_id, op_key text, kind text check (kind ~ '^[a-z_]{1,32}$'), monthly_part int, lifetime_part int, period text, state check in ('reserved','committed','refunded'), expires_at, created_at, updated_at)`:
  - unique `(user_id, op_key)`
  - `kind` is validated in JS so that adding stickers later needs no migration
- `credit_settings`: a singleton holding `welcome_amount` 300 and `monthly_amount` 60, seeded in the migration. It is app-wide and holds no user data. Policy: `for select using (true)` only. F-706.5 adds the narrow write policy keyed on a GUC with its own `with...` helper, the same shape F-706.2 will use for `ai_budget_months`.
- `credit_grants` and `credit_ops` get `owner_only`. Every table gets ENABLE + FORCE in the same file.
- Monthly grant amounts are copied into the grant row when the row is created, so "later grants use the new amounts" (F-706.5 AC) holds automatically.

**R-c. Balance arithmetic (AC spend order and expiry).**
- monthly available = this period's monthly grant − Σ `monthly_part` of live or committed ops with `period` = current.
- lifetime available = Σ approved welcome + manual − Σ `lifetime_part` of live or committed ops.
- Last month's monthly credits stop counting, which gives "no rollover" with no sweeper.
- Lazy grants happen inside the locked transaction: insert this month's monthly grant and a pending welcome row with `on conflict do nothing`. `balance` should therefore run in the same write transaction, not a read-only one. That keeps one code path, and it puts a newly joined user into the approval queue the first time they touch credits.

**R-d. "Existing account" (D53). Recommend a snapshot taken in the migration.**
- Inside `no force` / `force`, insert an **approved** welcome grant of 300 for every distinct `user_id` found in locations ∪ items ∪ item_photos ∪ wear_logs ∪ ai_settings.
- Anyone else gets a pending row lazily.
- This cannot be spoofed, unlike a `created_at` cutoff (finding 6). It needs no new config and is exactly-once through the unique key.
- Option rejected: a lazy check "has rows created before the cutoff", because restore can fake the dates.
- Ming should confirm: "existing" means present when F-706.1's migration runs, not at the F-706.4 cutover. If Ming means the cutover, F-706.4 adds one more idempotent snapshot migration (`on conflict do nothing`), which is cheap. Users who signed in but never saved a row count as new; flag that too.
- The owner is covered by the snapshot because the owner has rows. The owner gets no special path in code.

**R-e. Balance route: put it in F-706.4, not F-706.1.**
- F-706.7 needs the "AI off" state, which comes from F-706.2's meter, and the price list. A route built in F-706.1 would have to change in F-706.4 anyway.
- Without a route, F-706.1 stays fully inert: no pending rows get created and nothing is visible before the cutover.
- Suggested shape for F-706.4: `GET /api/credits` returning `{ balance…, welcome, prices, aiOff }`. The prices come from the server, so no new client mirror is needed.

**R-f. Inertness.** Nothing in app.js, api.js or the AI routes imports credits.js. Only the tests do. The migration is expand-only (new tables plus a seed), so it is safe to roll back to an older image. The reviewer can check this with a grep; add a test only if it is cheap.

**R-g. Error codes.** F-706.1 adds no new codes to either mirror. F-706.4 adds `out_of_credits`, `welcome_pending` and the cap code to both mirrors and to `AI_BATCH_OFF` together. Adding them now would add dead parity entries and split the work F-706.4 owns.

**R-h. How the later splits plug in.**
- F-706.2: `reserveSpend` stays a separate module (`server/ai/spend.js`) with its own global row and lock. F-706.4 orders the calls as reserve credits → reserveSpend, and refunds the credits if the spend reservation is refused.
- Do not put spend inside the credit transaction. Holding a global lock inside a per-user lock creates contention, and the two have different refund rules (D53).
- F-706.4 runs reserve, then the provider call, then commit or refund, as three short transactions. It never holds a transaction open across the provider call.
- The stored result for replay (F-706.4 AC) is not added now. F-706.4 can add a nullable `result jsonb` column, or its own table, as an expand-safe migration.

**R-i. Tests (R8).**
- **Unit, creditMath:**
  - Month boundary: `2026-11-30T16:59:59Z` falls in 2026-11 and `T17:00:00Z` in 2026-12. Cover December → January.
  - `split` puts monthly first, with partial splits.
  - Expiry predicate.
- **DB, `server/ai/credits.db.test.ts` with `createTestDb({owner:true})` so RLS applies:**
  - Enough balance for one action, N=8 parallel `reserve` calls: exactly one row in `reserved`.
  - Same `opKey` twice gives one row and `replay` true. Same key with a different kind gives `op_key_mismatch`.
  - Refund restores the balance. Commit keeps credits spent. Commit after refund does nothing.
  - An expired reservation stops counting.
  - With a fixed clock across the UTC+7 boundary, monthly credits drop and lifetime credits stay.
  - A pending welcome row does not count until `approved_at` is set through the admin pool.
  - A second `balance` call creates no second welcome or monthly row.
  - The owner's user id behaves the same as any other user.
- **Migration seed:** copy the earlier migrations to a temp dir (the pattern at migrator.db.test.ts:162-165), insert rows for users A and the owner, apply the new migration, and assert one approved welcome grant each and none for B.
- **Existing test lists:** update rls.db.test.ts (`TABLES`, truncate, catalog, exact pg_policies including the `credit_settings` select-only policy, maintenance loop) and schema.db.test.ts:251,259.

**R-j. Size.** M, no split. Roughly: migration about 80 lines, module about 200, pure helpers about 50, tests about 400.

### Risks
- **Restore must never touch credit tables.** If backup or restore ever exports or truncates them, a user can reset their spend. Keep them out of backup.js and add a note or test.
- **Commit after expiry.** If a crash leaves a reservation unsettled and its credits are reused after the 10-minute expiry, a late commit could overspend by one action. Expiry is far beyond the 45-60 s provider timeouts, so the planner should pick one rule: allow commit only while `now < expires_at`, or allow it and accept that bounded overspend.
- **Retry semantics.** A refunded `opKey` is terminal under this design, so a retry needs a new key from the client. F-706.4's client must create one key per user action.
- **Pool pressure.** `balance` uses a write transaction with a lock. Under N parallel calls it queues on 5 connections with a 3 s connect timeout. Keep the transaction to a few statements.
- **CLAUDE.md is stale.** R2/R4 still name `supabase/migrations` and storage buckets; the real migrations are in `db/migrations/`. Not in this ticket's scope; add it to follow-ups.

### Open questions (planner to flag to Ming)
1. Is "existing account" measured at F-706.1's migration or at the F-706.4 cutover? Do signed-in users with zero rows count as new?
2. Is the pending welcome amount fixed when the row is created, or read at approval?
3. Should a `reserved` op whose expiry has passed be re-reservable in place with the same `opKey`, or always need a new key?
4. Do we confirm the balance route goes in F-706.4 (recommended), so F-706.1 adds no route?
