# Consult — database-optimizer — F-706.5

**Consult: F-706.5 admin API (db / security)** (read-only; nothing edited)

## Findings
- **credit_grants** has only `owner_only`, so `user_id = app_user_id()`. Under `withUser` the owner cannot see other users' grants, so the cross-user list and approve need a new access path. Pending welcome rows are `bucket='welcome' and approved_at is null`.
- **credit_settings** has only `credit_settings_read` (select using true). It is readable under any GUC, including a maintenance one. Update has no policy, and the F-706.1 header says F-706.5 adds one.
- **ai_spend_ops** already has what the spend read needs. `createSpendMeter(pool).status()` in `server/ai/spend.js` returns `{period, capMicroUsd, spentMicroUsd, remainingMicroUsd, priceVersion}` using `withSpendMeter` read-only. It sums `estimate_micro_usd` where `state <> 'released'`, and `ai_spend_ops_period` indexes it. The route can call it directly, so no migration and no new SQL. The cap is compared against reserved plus charged estimates, which is the figure the owner should see. The route should say so.
- **Owner check** has precedent: `GET /api/admin/ai-keys` returns 403 `forbidden` unless `userId === TUDO_OWNER_SUB`. The README documents this.
- **db.js** has `withMaintenance` (task list `["photo-sweep"]`, read-only), `withSpendMeter` and `withAppKeys`. Each sets `tudo.maintenance` and clears `app.user_id`. There is no credit-admin helper yet.
- **Ledger concurrency**: `credits.js` takes `pg_advisory_xact_lock(hashtextextended('credits:' || userId, 0))` for every reserve, commit, refund and balance call. `ensureGrants` upserts with `on conflict ... do nothing` and creates the welcome grant pending. Monthly grants are created approved.
- **Period consistency**: ledger periods use `vnMonth` and spend periods use `spendPeriod`. Both should be UTC+7, but confirm they agree in the test.
- **No users table (D50)**: the pending list can only show user ids and `created_at`, not emails.

## Recommendations
1. **A new migration is needed.** Name it something like `2026112x_credit_admin.sql`. It is expand-only, adds policies only, never edits an applied migration (R2), and carries a manual rollback comment of `drop policy ...`. It is High tier, so the plan gate applies. Policies are keyed on `current_setting('tudo.maintenance', true) = 'credit-admin'`, matching the `ai-spend` and `app-keys` pattern:
   - `credit_grants` select for admin: `using (maintenance='credit-admin')`.
   - `credit_grants` insert for admin (manual add): `with check (maintenance='credit-admin' and bucket='manual' and approved_at is not null)`.
   - `credit_grants` update for admin (approve): `using (maintenance='credit-admin' and bucket='welcome' and approved_at is null)` and `with check (maintenance='credit-admin' and bucket='welcome' and approved_at is not null)`. Policies cannot restrict columns, so the approve SQL must set only `approved_at`. Optionally add a `before update` trigger that rejects changes to `user_id`, `amount`, `bucket` and `period`, as a second line of defence.
   - No delete policy for admin, so grants cannot be removed through the app.
   - `credit_settings` update for admin: `using` and `with check` both on the maintenance value. No insert or delete, so the single-row table stays single.
   - Do not widen `credit_ops`: the admin does not need it.
2. **Narrowest access path**: add `withCreditAdmin(pool, fn, {readOnly})` to `server/db.js`, in the same shape as `withAppKeys`. Put all admin SQL in a new `server/ai/creditAdmin.js`, the only caller. The maintenance value is only ever set by that helper, so user-controlled `withUser` transactions, which reset it to `''`, can never reach it. The route layer gates with `userId === TUDO_OWNER_SUB` before touching the DB (403 on every admin route, including method-mismatch paths, which should be 405 only after the owner check).
3. **Routes** (suggested):
   - `GET` and `PUT /api/admin/credits/settings` (welcome and monthly amounts, validated 1..100000 as in the CHECKs).
   - `POST /api/admin/credits/grants` with `{userId, amount}`; the server forces `bucket='manual'` and `approved_at=now()`.
   - `GET /api/admin/credits/pending` (welcome grants awaiting approval).
   - `POST /api/admin/credits/pending/:userId/approve`.
   - `GET /api/admin/spend`.
4. **Settings update** is a single-row `update credit_settings set welcome_amount=$1, monthly_amount=$2, updated_at=now()`. Later grants use the new amounts because `ensureGrants` reads `credit_settings` at insert time. Existing grants are not rewritten, which satisfies "later grants". Document that the pending welcome grant keeps the amount it was created with. Decide whether approve should apply the current welcome amount or the stored one (see questions).
5. **Concurrency**:
   - **Approve**: `update credit_grants set approved_at=now() where user_id=$1 and bucket='welcome' and approved_at is null returning ...`. It is idempotent, so a second approve touches 0 rows and the route returns 200 with `already approved` or 404 when the user has no welcome row (check with a select). Never insert a welcome row in approve.
   - **Locking**: take the same per-user advisory lock (`credits:<userId>`) inside the admin transaction for approve and manual add. This serialises them with reserve and balance. It is not strictly needed, because adding credits only increases the balance, but it keeps a reserve from seeing a half-visible state and is cheap. Export the lock helper or its key from credits.js rather than duplicating the string.
   - **Manual add**: it has no natural idempotency, so a double click gives two grants. Recommend an optional `request_key text` column plus a unique partial index on `(user_id, request_key) where bucket='manual'`, or have the admin UI (F-706.6) disable the button. The column fits in the same migration if Ming wants it.
6. **Indexes**: the pending list is a scan of a tiny table (one welcome row per user). A partial index is still cheap: `create index credit_grants_welcome_pending on credit_grants (created_at) where bucket='welcome' and approved_at is null`. Order by `created_at`, with `limit` (e.g. 100) and a clamp. The existing `credit_grants_welcome_once` unique index already covers lookup by `user_id`. No index is needed for spend.
7. **Tests to add**:
   - **`server/rls.db.test.ts`**, new `describe("credit admin (F-706.5)")`:
     - `withCreditAdmin` selects grants of both users and inserts a manual grant for another user.
     - It cannot insert `bucket='welcome'`, or a manual grant with `approved_at null` (42501).
     - It approves a pending welcome (1 row), and a second approve touches 0 rows.
     - It cannot update an already approved grant, a manual grant or a monthly grant (0 rows).
     - It cannot delete a grant (0 rows).
     - It updates `credit_settings`, but cannot insert or delete settings (insert 42501, delete 0 rows).
     - `withUser` and the other maintenance values (`photo-sweep`, `ai-spend`, `app-keys`) still see only their own grants and cannot write cross-user.
     - Update the catalog and `pg_policies` expectations (lines ~272-380) with the new policies. The existing `credit_settings: update/delete touch 0 rows` test (line 251) must stay green under `withUser`.
   - **Module tests** (unit, mocked pool, as for appKeys): `creditAdmin.js` SQL shape and statuses (approved, already_approved, not_found, invalid amount).
   - **Route tests**: 403 for non-owner and for missing or other auth on every route, plus 405 for wrong methods. Settings change then a fresh `ensureGrants` uses the new amount. A manual grant counts in `balance().lasting` and never expires (no `period`, not tied to the month). Approve makes the 300 credits count in `balance()` and clears `welcome_pending`. The spend read shows the cap against `spendMeter.status()`.
   - **Integration** (db test): approve concurrent with `reserve` for the same user, so a reserve that returned `welcome_pending` can succeed after the approve.

## Risks
- **Policy breadth**: an update policy cannot restrict columns. Without the trigger or strict SQL, a bug could rewrite `amount`. Mitigate with the trigger, or at least the WITH CHECK and tests above.
- **FORCE RLS** means a bug in the helper (wrong maintenance string) fails closed with 0 rows and not an error, which can look like a silent "not found". Tests must assert on `rowCount`.
- **`statement_timeout` is 5s and the pool max is 5**: admin transactions should be short, with no external I/O inside.
- **Pending list leak**: it exposes user ids to the owner only. Keep it out of logs and use `Cache-Control: no-store`.
- **Tier**: the migration and `server/**` are High, so the plan needs Ming's approval. Applying the migration to the real DB is Ming's step.
- **Cap estimate vs real**: spend uses reservation estimates, not billed cost. The owner is not exempt from the cap (D53).
- **`credit_settings` change timing**: a settings change races with a reserve's `ensureGrants`. Either order is acceptable, because each grant takes whatever amount is current at insert.

## Open questions (proposed defaults)
1. Should approve grant the amount stored at creation (default) or the current `welcome_amount`? Default: stored amount, so the owner sees what was promised.
2. Add `request_key` idempotency for manual add? Default: yes, an optional key with a unique partial index.
3. Add the update-guard trigger on `credit_grants`? Default: yes.
4. Should a manual add to a UUID with no ledger row be allowed? There is no users table (D50), so the server cannot verify the user exists. Default: allow and return the id.
5. Should the pending list also show emails? Default: ids only. Emails would need Identity lookups, out of scope for F-706.5 and a candidate for F-706.6.
6. Confirm the D53 text on whether the owner's own welcome grant is exempt. It is seeded approved for `TUDO_OWNER_SUB` in F-706.1.

I could not display the long D53 lines in `work/decisions.md` (the output was omitted), so the D53 specifics above come from the F-706.1 migration comments and the ticket.

Files: db/migrations/20261122120000_credit_ledger.sql, server/db.js, server/ai/credits.js, server/ai/spend.js, server/rls.db.test.ts.
