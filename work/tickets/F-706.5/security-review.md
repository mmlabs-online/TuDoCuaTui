# Security review — F-706.5

## Attempt 1

**Verdict: no blockers.** There is one should-fix (🟡): it hardens the database rules as a backup layer and is not an exploitable hole today. There are also two notes and a list of confirmed-good checks.

**I did not run any checks.** I had no Bash tool in this session, so I did not run `git diff`, `pnpm test`, the typecheck or the DB suites. I reviewed from the files listed in the brief and the plan. The orchestrator needs to confirm the checks are green, including the DB suites on Postgres 17, before PASS (R8).

### Findings

**🟡 1. Under the database rules alone, a user can still insert self-grants with any amount.**
- **Where:** `db/migrations/20261123120000_credit_admin.sql:58-62` (policy `credit_grants_user_insert`).
- **What the policy checks:** only `bucket`, `approved_at` and `grant_key is null`. It does not check `amount` or `period`.
- **Risk:** inside `withUser(A)`, any statement can insert:
  - a monthly grant of up to 100000 credits, approved, for the current period (if none exists yet) or for any other period;
  - a pending welcome row of up to 100000. Under A1 the owner then approves that stored amount. `listPending` does show the amount, but nothing stops it.
- **Today the only writer is `credits.js:58-68`, which takes the amounts from `credit_settings`.** So this matters only if a future bug or SQL path in user code is added. The brief asked for "no user can grant their own credits" at the RLS layer, and this is the remaining gap.
- **Fix (same migration, not yet applied):**
  ```sql
  with check (
    user_id = (select app_user_id()) and grant_key is null
    and ((bucket = 'monthly' and approved_at is not null
          and amount = (select monthly_amount from credit_settings))
      or (bucket = 'welcome' and approved_at is null
          and amount = (select welcome_amount from credit_settings)))
  )
  ```
  - `credits.js` reads from `credit_settings` in the same statement, so this check stays consistent with what it inserts.
  - Optionally also bind `period` to the current UTC+7 month. If that is hard in SQL, leave it as a follow-up.
  - Add an RLS test: inside `withUser(A)`, inserting a monthly row with a non-settings amount fails with 42501.

**💭 2. Users can update any column of their own `credit_ops` rows.**
- **Where:** `credit_ops_user_update` at `20261123120000_credit_admin.sql:68-70`.
- **Risk:** at the RLS layer, a user transaction can change `credits`, `state` (for example committed back to reserved) or `period` on its own ops. This matches what `credits.js` needs and was out of note 10's scope.
- **Follow-up:** a guard trigger, like `credit_grants_guard`, that allows only `reserved` to `committed` or `refunded` plus `settled_at`. File it as a `debt` issue.

**💭 3. Admin JSON reads have no body timeouts and do not close the connection on 413.**
- **Where:** `adminCreditRoutes.js:64,112`. This matches the F-706.3 `adminRoutes.js`.
- **Risk:** negligible, because the routes are owner-only and the prefix check refuses non-owners before any body is read.

### Confirmed good (🟢)
- **Owner check comes first, with no route enumeration.** At `server/api.js:133-137`, every path with `parts[2] === "admin"` gets 403 `forbidden` for non-owners, before `match()`, the 405 check and the `Sec-Fetch-Site` check. `match()` only matches when `a === "admin"`, so every matchable admin route is covered.
  - Paths are never decoded (`app.js:112`), so variants like `%61dmin` or `admin;x` can only 404, never reach a handler.
  - `adminCreditRoutes.js:39-42` and `adminRoutes.js:46` repeat the check as a second layer.
  - `isOwner` (`me.js:5-7`) rejects a null or undefined owner, and `auth.js:23-25` refuses to start unless `TUDO_OWNER_SUB` is a valid UUID.
  - The test at `adminCreditRoutes.test.ts:111-137` covers 10 paths × 4 methods, checks the exact 403 body, and asserts zero calls to the fakes.
- **The admin database setting is out of reach from user transactions.**
  - `withUser` (`db.js:87`) clears `tudo.maintenance` in every transaction, and it is set transaction-locally (`set_config(..., true)`).
  - `MAINTENANCE_TASKS` (`db.js:40`) is only `["photo-sweep"]`, so `withMaintenance` cannot be asked for `credit-admin`.
  - `withCreditAdmin` (`db.js:159-169`) clears `app.user_id`.
  - FORCE RLS is on for `credit_grants`, `credit_ops` and `credit_settings` (`20261122120000_credit_ledger.sql:83,87,93`), so the table-owner role is bound by the policies too.
- **Users cannot approve their own welcome credits.**
  - No user update or delete policy exists on `credit_grants`.
  - Admin approve allows only a pending welcome becoming approved (`:74-78`).
  - Admin manual insert requires `bucket = 'manual'`, `approved_at`, no `period`, and a `grant_key` (`:79-81`).
  - There is no admin delete and no admin policy on `credit_ops`.
- **Guard trigger** (`:34-51`):
  - It blocks changes to every identity and value column, and any change to `approved_at` once it is set. It fires for every role.
  - `search_path = ''` is set, and the function uses no unqualified objects.
  - Updates only, which is fine because no delete policy exists.
- **Input validation** (`adminValidate.js`):
  - Bodies must have exactly the expected keys. A `__proto__` key from `JSON.parse` is an own key, so it is rejected.
  - Amounts must be integers from 1 to 100000. This matches the `int` columns, so `row.amount !== amount` at `creditAdmin.js:154` compares numbers correctly.
  - The request key must match `^[A-Za-z0-9_-]{1,128}$`, the same pattern as the DB check.
  - User ids must be canonical lowercase, non-nil UUIDs, and `creditAdmin.js:14` checks again (`needUser`).
  - All SQL is parameterised.
- **Idempotency:**
  - Manual add uses a partial unique index on `(user_id, grant_key)` plus `on conflict do nothing`, re-reads the existing row on conflict, and returns `grant_key_mismatch` when the amount differs.
  - It takes the per-user advisory lock first. The lock statement in `creditLock.js` is the same one `credits.js:132,167,224` now uses.
  - Approve is idempotent (`already_approved`).
- **Logging:**
  - `adminCreditRoutes.js:38` logs only `{event, id, action, code}`, and `api.js:135` logs only `{event, id, code}`.
  - The access log (`app.js:99-106`) records the route template, not the raw path, so user ids in the URL never reach logs.
  - Error bodies return `field`/`reason` only and never echo input.
- **CSRF:** `api.js:148-152` rejects `cross-site` and `same-site` writes. Auth is a bearer token (`identity.js:109`), not a cookie, so the browser never attaches it automatically; this check is extra protection on top.
- **No secrets** touched. Nothing reaches the client.

### Follow-ups (out of scope)
- If 🟡 1 is deferred rather than fixed here, file it as `debt` with `project:tudocuatui`.
- 💭 2, a guard trigger on `credit_ops`, as `debt`.
