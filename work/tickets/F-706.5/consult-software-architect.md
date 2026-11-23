# F-706.5 consult: software architect (read-only)

## Findings

1. **The owner check in F-706.3 sits inside each handler, after method matching.**
   - `handleAdminAiKeys` checks `!ownerSub || userId !== ownerSub` first (`server/ai/adminRoutes.js:45`).
   - But `match()` in `server/api.js:42-50` and the 405 check (`api.js:117`) run before it. A non-owner who uses the wrong method gets **405, not 403**. A non-owner on an unknown `/api/admin/*` path gets 404.
   - That conflicts with the feature-list AC "Non-owners get 403 on every key and admin route" (`docs/feature-list.md:315`), and it reveals which admin routes exist.
   - `ownerSub` is always set in production (`auth.js:24-25` refuses to start without it). The `!ownerSub` branch only guards tests.

2. **The F-706.3 admin handler depends on the AI context.** It gets `appKeys` from `ai?.appKeys`, and that only exists when the KEK is configured (`app.js:69-74`). Credit admin needs only `pool`. It must not depend on `ai`, or credit management goes down whenever AI config is missing.

3. **The cross-user path chosen in F-706.1 is documented but not built** (`work/tickets/F-706.1/plan.md:231-242`). It specified:
   - a `withAdmin(pool, 'credits', fn)` helper that sets `tudo.admin = 'credits'` and clears `app.user_id`;
   - policies `credit_admin_read`, `credit_admin_approve` (update, welcome), `credit_admin_manual` (insert, manual), `credit_admin_write` (credit_settings update), plus read on `credit_ops`.

   F-706.2 and F-706.3 then set a different precedent. They reuse the **`tudo.maintenance`** setting with named values (`'ai-spend'`, `'app-keys'`), through `withSpendMeter` and `withAppKeys` (`server/db.js:119-149`). `withUser` explicitly clears `tudo.maintenance` (`db.js:87`). A new `tudo.admin` setting would not be cleared by `withUser`, `withMaintenance`, `withSpendMeter` or `withAppKeys` unless every one of them is edited.

4. **A user can still change their own credits (security note 10 from F-706.1, still open).**
   - `owner_only FOR ALL` on `credit_grants` and `credit_ops` (`db/migrations/20261122120000_credit_ledger.sql:88-96`) lets any `withUser(A)` transaction approve A's own welcome grant, insert a manual grant for A, or delete A's ops.
   - `work/tickets/F-706.1/security-review.md:51-58` asks F-706.5 to replace these with per-command policies, in the same migration as the admin policies.
   - This ticket adds the admin write path, so this is the natural (and agreed) place to close it.

5. **`credit_settings` cannot be written by anyone yet.** It has only `credit_settings_read using (true)`, under FORCE. F-706.5 needs a narrow update policy.

6. **Spend read already exists.** `createSpendMeter(pool).status()` returns period, cap, spent, remaining and price version, in a read-only `withSpendMeter` transaction (`server/ai/spend.js:135-155`). It needs no new DB path.

7. **Approval is a single update.** The schema already models pending as `approved_at is null`, with at most one welcome row per user (`credit_grants_welcome_once`), and the balance only counts welcome rows that have `approved_at` (`credits.js:88-90`).
   - The check `bucket = 'welcome' or approved_at is not null` means manual grants must set `approved_at` (`work/tickets/F-706.1/review.md:59`).
   - There is no idempotency column for manual grants. F-706.1 deferred a nullable key with a partial unique index to this ticket.

8. **An inertness test fixes where code can go.**
   - `server/ai/credits.test.ts:48-58` asserts that no non-test file imports `credits.js`, and that only `credits.js` imports `creditMath.js`. If admin SQL goes into `credits.js` and is wired to a route, that test breaks before F-706.4.
   - The comment at `credits.js:2-3` says "All SQL for the credit tables lives here." It needs a one-line update if admin SQL lives elsewhere.

9. **There is no users table (D50).** The pending queue can only show a `user_id`, the grant `created_at` and the amount. Email is in the token (`result.email`, `app.js:137`), but the ledger never receives it. F-706.6 will show Ming bare UUIDs.

10. **Hotspots.** The new migration touches the same files as other in-flight work:
    - the policy list in `server/rls.db.test.ts`
    - `RLS_TABLES` (`server/migrator.js:117-127`) if versions are bumped
    - the migration version, which must stay newest on main

## Recommendations

**R-a. Check the owner once, at the `/api/admin` prefix, before route matching** (AC 1, feature-list AC at `docs/feature-list.md:315`).
- In `handleApi`, before `match(parts)`: if `parts[2] === "admin"` and the caller is not the owner, call `setRoute("/api/admin")` and return `403 forbidden`.
- Every current and future admin route, including unknown paths and wrong methods, then returns 403 to non-owners.
- Keep the check inside each handler as a second layer.
- This changes F-706.3's non-owner wrong-method answer from 405 to 403. It tightens the same AC; list it in the plan so the reviewer does not read it as scope creep (R7).
- Put the owner test in one shared helper, e.g. `isOwner(userId, ownerSub)` in `server/me.js` next to `meBody` (which already computes the role), so the route check and `/api/auth/me` cannot drift apart.

**R-b. Use the setting pattern F-706.2 and F-706.3 established, not the `tudo.admin` setting from the F-706.1 plan.**
- Add `withCreditAdmin(pool, fn, { readOnly })` to `server/db.js`, shaped like `withAppKeys`: it sets `tudo.maintenance = 'credit-admin'` and `app.user_id = ''`.
- Every policy keys on `current_setting('tudo.maintenance', true) = 'credit-admin'`.
- One setting, which every helper already resets.
- Record this as a deliberate departure from F-706.1 plan §8, with that reason, under "Specialist input used".

**R-c. Migration (High tier): admin policies and narrowed user policies in one file.**

Admin policies:
- `credit_settings`: `credit_admin_settings for update using (admin) with check (admin)`. No insert or delete (singleton).
- `credit_grants`:
  - `credit_admin_read for select using (admin)`;
  - `credit_admin_approve for update using (admin and bucket = 'welcome' and approved_at is null) with check (admin and bucket = 'welcome' and approved_at is not null)`;
  - `credit_admin_manual for insert with check (admin and bucket = 'manual' and approved_at is not null)`.
- `credit_ops`: no admin policy. Nothing in this ticket's AC reads ops across users (R7).

User policies (security note 10): drop `owner_only` on `credit_grants` and `credit_ops` and replace it with:
- `credit_grants`: select own rows; insert own rows with `bucket = 'monthly' or (bucket = 'welcome' and approved_at is null)`; no update, no delete.
- `credit_ops`: select, insert and update own rows; no delete.
- First confirm that `credits.js` never needs anything else (it only runs insert, update and select). The `credits.db.test.ts` suite proves it.

Manual-grant idempotency:
- Add nullable `grant_key text` with `check (grant_key ~ '^[A-Za-z0-9_-]{1,128}$')`.
- Add a partial unique index on `(user_id, grant_key) where grant_key is not null`.
- Enforce `(bucket = 'manual') = (grant_key is not null)` if Ming wants the key mandatory (see Open question 3).
- These changes only add things (expand-only), so rolling back to an older image is safe.

**R-d. Put SQL in a new module, `server/ai/creditAdmin.js` (`createCreditAdmin(pool)`), not in `credits.js`.**
- The `credits.js` inertness test then stays valid until F-706.4.
- Update the `credits.js` header comment to say credit-table SQL lives in `credits.js` and `creditAdmin.js`.
- Add a source test that only `creditAdmin.js` calls `withCreditAdmin` (as the comments on `withSpendMeter` and `withAppKeys` state, made enforceable).
- Methods return statuses and never throw on business outcomes, the same style as `credits.js` and `spend.js`. Validate user ids with `toUserId` before touching the pool.
- Methods:
  - `getSettings()`: read-only.
  - `updateSettings({ welcomeAmount, monthlyAmount })`: update, set `updated_at = now`, return the row.
  - `listPending({ limit })`: `select user_id, amount, created_at from credit_grants where bucket = 'welcome' and approved_at is null order by created_at, user_id limit $1`. Read-only.
  - `approveWelcome(userId)`:
    - Run `update ... set approved_at = $now [, amount = (select welcome_amount from credit_settings)] where user_id = $1 and bucket = 'welcome' and approved_at is null returning ...`.
    - If no row was updated, look the user up: an already-approved row gives `already_approved`; no row gives `not_found`.
    - Take the per-user advisory lock `credits:<uuid>` (`credits.js:109-110`) so the approval is ordered against lazy `ensureGrants`. It is cheap and makes "pending row appears while approving" deterministic.
  - `addManual(userId, amount, grantKey)`:
    - Under the same per-user lock, insert with `on conflict (user_id, grant_key) where grant_key is not null do nothing returning`.
    - If no row was inserted, read the existing one. Same amount gives `replay`; a different amount gives `grant_key_mismatch`.
- Spend view: call the existing `createSpendMeter(pool).status()`; add no new SQL.

**R-e. Route shapes.** All routes are under `/api/admin`, return JSON with `Cache-Control: no-store` (as `sendJson` already does), and write routes keep the `Sec-Fetch-Site` check (`api.js:121-124`).

| Method | Path | Body | 200/201 response | Errors |
|---|---|---|---|---|
| GET | `/api/admin/credits/settings` | — | `{ welcomeAmount, monthlyAmount, updatedAt }` | 503 `db_unavailable` |
| PUT | `/api/admin/credits/settings` | exactly `{ welcomeAmount, monthlyAmount }`, integers 1..100000 | same as GET | 400 `invalid_input` `{field, reason}`, 413, 503 |
| GET | `/api/admin/credits/pending` | — | `{ accounts: [{ userId, amount, createdAt }] }`, oldest first, capped (e.g. 200) | 503 |
| POST | `/api/admin/credits/pending/:userId/approve` | `{}` or empty | `{ status: "approved" \| "already_approved", userId, amount, approvedAt }` | 400 `invalid_input` (`field: "userId"`), 404 `not_found`, 503 |
| POST | `/api/admin/credits/users/:userId/grants` | exactly `{ amount, requestKey }`, amount 1..100000, key `^[A-Za-z0-9_-]{1,128}$` | 201 `{ grant: { id, userId, amount, createdAt } }` on create; 200 with the same body plus `replay: true` on replay | 400 `invalid_input`, 409 `grant_key_mismatch`, 503 |
| GET | `/api/admin/spend` | — | `{ period, capMicroUsd, spentMicroUsd, remainingMicroUsd, priceVersion }` | 503 |

- Use full PUT for settings (both fields required): simple, idempotent, no partial-merge rules.
- Approve is idempotent by nature, so it needs no key.
- Reject strict bodies with extra keys, as `parsePutKeyBody` does (`adminRoutes.js:21-29`). Keep parsers in a pure module (e.g. `server/ai/adminValidate.js`) so they get unit tests (R8).
- Monetary values stay integer micro-USD. The UI (F-706.6) formats them.
- Log fixed events only (`{ event: "admin_credits", id, action, code }`). Never log amounts with user ids, or request bodies.

**R-f. Router wiring.**
- Add the routes to `match()` with exact `parts.length` checks so they cannot collide with the `ai-keys` patterns.
- Dispatch with `m.route.startsWith("/api/admin/credits") || m.route === "/api/admin/spend"` to a new `handleAdminCredits(req, res, { route, parts, userId, ownerSub, pool, creditAdmin, spendMeter, id, log, now })`.
- Build `creditAdmin` and `spendMeter` once in `app.js` from `pool` (null when there is no pool, which answers 503). Allow test injection, as `ai.appKeys` does.
- Passing `route` (the template) is cleaner than re-parsing `parts`, which F-706.3 does. Follow F-706.3 only if consistency matters more.

**R-g. Testability.**
- Route tests (no DB), with a fake `creditAdmin` and `spendMeter` injected through `createApp`:
  - non-owner gets 403 on each route × each method, plus an unknown `/api/admin/x`;
  - owner gets 200 or 201 per route;
  - strict body validation;
  - 503 when there is no pool;
  - `Sec-Fetch-Site: cross-site` on writes gets 403.
- DB tests (`creditAdmin.db.test.ts`):
  - settings change, then a new user's first `balance()` gets the new welcome and monthly amounts (AC 2; use a fixed clock and the next month);
  - pending list contains only unapproved welcome rows;
  - `approveWelcome` makes `balance().lasting` +300 and `welcome = 'approved'` (AC 4);
  - a second approve returns `already_approved`;
  - approving an unknown user returns `not_found`;
  - manual add raises `lasting` and still counts in a later month (never expires, AC 3);
  - manual add replay, and key mismatch.
- RLS tests:
  - inside `withUser(A)`: approve-own, insert manual, delete ops and update settings all fail (42501 or 0 rows);
  - inside `withCreditAdmin`: `credit_ops` is invisible and inserting a welcome or monthly grant fails;
  - `withMaintenance`, `withSpendMeter` and `withAppKeys` see no grants;
  - update the exact `pg_policies` list.
- Source test: only `creditAdmin.js` imports `withCreditAdmin`; `backup.js` still never mentions `credit_`.

## Risks

1. **Trust model.** A route bug that skips the owner check gives any user write access to grants. The database cannot tell owner from non-owner (one app role, FORCE RLS, `SECURITY DEFINER` is useless here, per `docs/ai-stylist-notes.md:65`). Mitigations: the prefix check plus the per-handler check, the test sweep over every route and method, and the policies limited to welcome-approve and manual-insert (no delete, no update of amounts on approved or manual rows).
2. **Policy migration on hot tables.** Swapping `owner_only` for per-command policies could break `credits.js` in a way unit tests miss. The full `credits.db.test.ts` and `rls.db.test.ts` suites must run against the new migration in CI (Postgres 17). This ticket is High tier; Ming applies the migration.
3. **Changing the monthly amount mid-month treats users unevenly.** Users who already have this month's monthly grant keep the old amount; users who first touch credits later in the month get the new one. That fits "later grants use the new amounts", but Ming may find it surprising. Document it in the API response or the F-706.6 copy.
4. **Typo'd user ids.** A manual add to an arbitrary UUID creates credits for an account that may not exist (no users table). It is harmless to the cap (credits are not dollars) but confusing. See Open question 2.
5. **Pending queue growth.** With join `open` (D38), drive-by sign-ups fill the queue (F-706.1 A8). Cap the list and order it deterministically. Deny and delete are out of scope, so rows stay pending forever.
6. **An optional admin balance read would create data.** If F-706.6 later wants "show this user's balance", calling `credits.balance(target)` creates grant rows for any UUID through lazy grants. Do not add it here. Any future admin balance read must be read-only, without `ensureGrants`.
7. **Hotspot merge conflicts** with F-706.4, F-707.x and F-708.x on the migration version, `rls.db.test.ts` and `RLS_TABLES`. Re-stamp the migration before merge.

## Open questions (batch for Ming; each has a default)

1. **What amount does an approval grant (F-706.1 A4 "fixed at creation for now")?** Default: approval re-reads the current `welcome_amount`, so a settings change also applies to accounts still waiting, which matches AC 2. Alternative: keep the amount snapshotted at creation. Reversible; one SQL clause.
2. **Can manual credits go to any UUID?** Default: only user ids the ledger already knows (any `credit_grants` row); otherwise 404 `unknown_user`. This prevents typos; Ming can still grant once the user has opened the credit UI. Alternative: any valid UUID.
3. **Is `requestKey` required for manual adds?** Default: yes. F-706.6 creates one per form submit, so a double-click or retry never doubles the credits. Alternative: optional, with keyless adds not deduplicated.
4. **How does Ming recognise the UUIDs in the pending queue?** There is no users table, so the queue shows only user ids. Default: the API returns `userId`, `amount` and `createdAt` only, and Ming looks the sub up in the mmlabs Identity console. Alternative: store the token email on the pending welcome row. That puts personal data into the ledger, changes F-706.1's `balance()`/`reserve()` signatures, and needs a privacy decision, so it would be its own ticket.
5. **Should the spend view include a breakdown?** Default: no. Return exactly `spend.status()` (the AC needs only the current month against the cap). A per-kind or per-provider breakdown would be a follow-up for F-706.6 if wanted.
6. **Non-owner 405 → 403 change on the F-706.3 routes (R-a).** Default: apply it in this ticket, because it is the same AC. Alternative: a separate `/solo` change.

Relevant files: server/api.js, server/app.js, server/db.js, server/ai/adminRoutes.js, server/ai/credits.js, server/ai/credits.test.ts, server/ai/spend.js, server/me.js, server/migrator.js, db/migrations/20261122120000_credit_ledger.sql, db/migrations/20261122160000_ai_app_keys.sql, work/tickets/F-706.1/plan.md, work/tickets/F-706.1/security-review.md.
