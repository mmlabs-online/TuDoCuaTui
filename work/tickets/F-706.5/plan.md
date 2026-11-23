Status: READY

# Plan — F-706.5: Owner-only admin API for grants, credits, approvals and spend

## Scope summary
- `docs/feature-list.md` E7 → F-706, split line: "**F-706.5 Admin API:** owner-only grant settings, manual credit add, approval of welcome credits for new accounts (D53), and spend view."
- `docs/feature-list.md` F-706 AC: "Non-owners get 403 on every key and admin route, and no response ever contains the key or its hint for them."
- `docs/feature-list.md` E7 locked decisions: "The admin can adjust the grant numbers and add credits manually." and "App-wide spend cap: $20/month."
- `work/decisions.md` D53: "Grants: welcome +300, monthly +60 with no rollover; the admin can change the grant numbers and add credits. **Existing accounts get the 300 welcome credits once; accounts that join later get theirs only after the admin approves them** (join stays `open`, D38). The owner spends credits like anyone and can top up. Welcome and manual credits never expire; monthly credits are spent first; months follow UTC+7. … Owner exemptions from rate limits (D38) do not exempt anyone from the cap."
- `docs/feature-list.md` OQ-1 (answered, D53): "existing accounts get 300 once; new accounts get theirs after the admin approves."
- `work/decisions.md` D52: the owner is `TUDO_OWNER_SUB`, "the `owner` role for v1, D50".
- Carried-over follow-up, `work/tickets/F-706.1/security-review.md` "Follow-ups": "**F-706.5:** narrow the user-side credit policies as described in note 10. Do it in the same migration that adds the admin policies."

Out of scope (ticket): admin screen (F-706.6), shared key routes (F-706.3, except the 403-before-405 tightening in step 6), paid credit purchase (non-goal), wiring `credits.js` into AI routes (F-706.4).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Non-owners get 403 on every admin route. | `server/ai/adminCreditRoutes.test.ts` › "non-owner gets 403 forbidden on every admin route × every method, including unknown /api/admin/* paths and wrong methods" (covers the new routes and the F-706.3 `/api/admin/ai-keys*` routes). The fake `creditAdmin` / `spendMeter` record zero calls. |
| 2 | The owner can change the welcome and monthly grant amounts, and later grants use the new amounts. | Route test "owner PUT /api/admin/credits/settings → 200 and GET returns the new values"; DB test `server/ai/creditAdmin.db.test.ts` › "updateSettings, then a new user's first balance() gets the new monthly amount and a pending welcome row with the new welcome amount; existing grants are unchanged". |
| 3 | The owner can add credits to a user; manual credits never expire (D53). | DB test › "addManual raises balance().lasting, and the credits still count with a clock in the next UTC+7 month"; › "replay with the same requestKey adds nothing; a different amount → grant_key_mismatch"; route test "POST …/users/:userId/grants → 201, replay → 200 replay:true, 409, 404 unknown_user, 400 cases". |
| 4 | The owner can list accounts waiting for welcome-credit approval and approve one; the approved account's 300 credits then count. | DB test › "listPending returns only unapproved welcome rows, oldest first"; › "approveWelcome → balance().lasting +300 and welcome 'approved'; second approve → already_approved; unknown user → not_found"; › "a reserve that returned welcome_pending succeeds after approve". Route tests for the 200/404/400 shapes. |
| 5 | The owner can read the current month's spend against the $20 cap. | Route test "GET /api/admin/spend returns spendMeter.status() verbatim"; DB test › "GET /api/admin/spend through createApp with a real pool shows a reserved estimate against capMicroUsd 20000000". |
| 6 | All checks pass (format, typecheck, test, build). | `pnpm format:check`, `pnpm typecheck`, `pnpm test` (DB suites must run against Postgres 17, not be skipped), `pnpm build`. |

## Ming verification after merge
- Applying `20261123120000_credit_admin.sql` to the production database is Ming's step (guardrail). After the deploy's migrate run, Ming confirms the migrate log shows the file applied.
- Optional, with an owner token: `GET /api/admin/spend` and `GET /api/admin/credits/pending` answer 200, and the same call with a non-owner account answers 403. F-706.6 provides the screen, so this is a smoke check only.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `db/migrations/20261123120000_credit_admin.sql` | New. `grant_key` column and partial unique index; guard trigger on `credit_grants`; drop `owner_only` on `credit_grants` / `credit_ops` and add per-command user policies; admin policies on `tudo.maintenance = 'credit-admin'`; manual rollback comment. | AC 2–4 need a cross-user write path; security note 10 (F-706.1) | Yes |
| `server/db.js` | Add `withCreditAdmin(pool, fn, { readOnly })` in the `withAppKeys` shape (`tudo.maintenance = 'credit-admin'`, `app.user_id = ''`). | The only access path for the admin policies | Yes |
| `server/ai/creditLock.js` | New. `lockCreditUser(client, userId)`: the advisory lock expression moved verbatim from `credits.js:109-110`. | Admin approve and manual add take the same per-user lock without importing `credits.js` (the inertness test forbids that) | Yes |
| `server/ai/credits.js` | Import `lockCreditUser` instead of the local `lock`; update the header comment ("credit-table SQL lives in credits.js and creditAdmin.js"). | Share the lock; keep the comment true | Yes |
| `server/ai/creditAdmin.js` | New. `createCreditAdmin(pool, { now })` with `getSettings`, `updateSettings`, `listPending`, `approveWelcome`, `addManual`. The only caller of `withCreditAdmin`. Returns statuses, never throws on business outcomes. | AC 2–4 | Yes |
| `server/ai/adminValidate.js` | New, pure. `parseSettingsBody`, `parseManualGrantBody`, `parseUserIdParam`. Strict keys, integers 1..100000, key `^[A-Za-z0-9_-]{1,128}$`. | R8: parsers in a pure module with unit tests | Yes |
| `server/ai/adminCreditRoutes.js` | New. `handleAdminCredits(req, res, ctx)` for the six routes; owner check as a second layer; fixed log events. | AC 1–5 | Yes |
| `server/api.js` | Owner check for the whole `/api/admin` prefix before `match()`; add the six routes to `match()` with exact `parts.length`; dispatch to `handleAdminCredits`; pass `creditAdmin`, `spendMeter`. | AC 1 (403 on every admin route, incl. wrong method / unknown path) | Yes |
| `server/app.js` | Optional deps `creditAdmin`, `spendMeter` (test injection); default `createCreditAdmin(pool, { now })` / `createSpendMeter(pool, { now })` when a pool exists, else `null`. Independent of the `ai` context. | Wiring; credit admin must work without `AI_KEK` | Yes |
| `server/me.js` | Add `isOwner(userId, ownerSub)`; `meBody` uses it. | One owner test shared by `/api/auth/me`, the prefix check and both admin handlers | Yes |
| `server/ai/adminRoutes.js` | Replace the inline owner comparison with `isOwner` (no behaviour change). | Same owner test everywhere | Yes |
| `server/README.md` | Document the six routes and that non-owners get 403 on any `/api/admin/*` path and method. | Route table is documented there | Yes |
| `db/migrations/README.md` | One line: `credit_grants` / `credit_ops` use per-command user policies (not `owner_only`) since F-706.5; `credit-admin` maintenance value. | The README states the policy rule the catalog test enforces | Yes |
| `server/ai/adminValidate.test.ts` | New unit tests. | R8 | Yes |
| `server/ai/creditAdmin.test.ts` | New unit tests (fake pool) and source tests. | R8 | Yes |
| `server/ai/creditAdmin.db.test.ts` | New DB tests. | AC 2–5 against real Postgres | Yes |
| `server/ai/adminCreditRoutes.test.ts` | New route tests (fakes injected through `createApp`). | AC 1–5 | Yes |
| `server/db.test.ts` | `withCreditAdmin` tests next to `withSpendMeter`. | New helper | Yes |
| `server/rls.db.test.ts` | New `describe("credit admin (F-706.5)")`; update the `pg_policies` expectation (owner_only rows for the credit tables replaced by the new names) and its title. | Policy changes | Yes |
| `server/migrator.db.test.ts` | `beforeCredit()` also unlinks the new file (it depends on `credit_grants`). | Otherwise the "before credit ledger" fixtures fail on the new migration | Yes |
| `server/ai/adminRoutes.test.ts` | Only if an existing assertion expects 405 for a non-owner (none found today); otherwise untouched. | 405 → 403 for non-owners | Yes |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `adminValidate.test.ts` › parseSettingsBody: accepts `{welcomeAmount, monthlyAmount}` integers 1..100000; rejects extra keys, missing keys, 0, 100001, 1.5, "300", null, arrays, `__proto__` key | AC 2, R8 |
| `adminValidate.test.ts` › parseManualGrantBody: accepts `{amount, requestKey}`; rejects bad amount, empty key, 129-char key, key with space/`đ`/`/`, extra keys | AC 3, R8 |
| `adminValidate.test.ts` › parseUserIdParam: canonical lowercase UUID only; rejects uppercase, nil UUID, `%2e%2e`, empty | AC 3–4 |
| `creditAdmin.test.ts` › every method throws on an invalid userId before `connect()`; approveWelcome / addManual take `lockCreditUser` as the first statement after the set_config | Lock order, input guard |
| `creditAdmin.test.ts` › source: only `creditAdmin.js` imports `withCreditAdmin`; `creditAdmin.js` never imports `credits.js`; `backup.js` never mentions `credit_`; the existing credits.js inertness test stays green | Narrow access path |
| `db.test.ts` › withCreditAdmin: begins read-write, sets `tudo.maintenance='credit-admin'`, clears `app.user_id`, commits; `{ readOnly: true }` begins read only; nested inside withUser throws | Helper |
| `creditAdmin.db.test.ts` › updateSettings then getSettings returns the new values and a later `updated_at` | AC 2 |
| `creditAdmin.db.test.ts` › after updateSettings(500, 100), a new user's first `balance()` has monthly 100 and a pending welcome row of 500; an existing user's grants are unchanged | AC 2 |
| `creditAdmin.db.test.ts` › listPending returns only `bucket='welcome' and approved_at is null` rows, oldest first, capped at 200, `{userId, amount, createdAt}` | AC 4 |
| `creditAdmin.db.test.ts` › approveWelcome → `approved`; `balance().lasting` +300 and `welcome: 'approved'`; amount is the stored amount even after a settings change (A1) | AC 4 |
| `creditAdmin.db.test.ts` › second approveWelcome → `already_approved`; unknown UUID → `not_found`; no welcome row is ever inserted by approve | AC 4 |
| `creditAdmin.db.test.ts` › a reserve that returned `welcome_pending` returns `reserved` after approveWelcome (same user) | AC 4, concurrency |
| `creditAdmin.db.test.ts` › addManual for a known user → `created`; `balance().lasting` rises by the amount and still counts with a clock in the next UTC+7 month (and across 2026-12-31T17:00Z, the UTC+7 boundary) | AC 3, UTC+7 |
| `creditAdmin.db.test.ts` › addManual replay (same key, same amount) → `replay`, one row; same key, other amount → `grant_key_mismatch`; same key for a different user → `created` | AC 3, idempotency |
| `creditAdmin.db.test.ts` › addManual for a UUID with no credit_grants row → `unknown_user`, nothing written (A2) | AC 3 |
| `creditAdmin.db.test.ts` › GET /api/admin/spend through `createApp` with a real pool and a reserved `ai_spend_ops` row → 200 with `capMicroUsd: 20000000`, `spentMicroUsd` = the estimate | AC 5 |
| `rls.db.test.ts` › credit admin: withCreditAdmin selects both users' grants; inserts a manual grant (with key) for another user; cannot insert welcome/monthly or manual without `approved_at` or `grant_key` (42501); approves a pending welcome (1 row) and touches 0 rows on approved welcome, monthly and manual rows; delete touches 0 rows; sees no `credit_ops` rows; updates `credit_settings` but insert → 42501 and delete → 0 rows | Policies |
| `rls.db.test.ts` › user side (note 10): inside withUser(A): update of own welcome `approved_at` → 0 rows; insert of own manual grant → 42501; insert of own welcome with `approved_at` set → 42501; delete own grants / ops → 0 rows; update `credit_settings` → 0 rows; credits.js flows still pass (credits.db.test.ts unchanged and green) | Security note 10 |
| `rls.db.test.ts` › withMaintenance('photo-sweep'), withSpendMeter and withAppKeys see no credit_grants rows and cannot write them | Isolation of maintenance values |
| `rls.db.test.ts` › guard trigger: as the admin pool (table owner), changing `amount`, `user_id`, `bucket`, `period`, `grant_key` or clearing `approved_at` raises; setting `approved_at` on a pending welcome succeeds | Defence in depth (A4) |
| `rls.db.test.ts` › updated `pg_policies` list and catalog test | Catalog |
| `adminCreditRoutes.test.ts` › non-owner gets 403 `forbidden` on each of the six routes × GET/PUT/POST/DELETE, on `/api/admin`, `/api/admin/x`, and on `/api/admin/ai-keys` with a wrong method (was 405); fakes record zero calls; body never echoes input | AC 1 |
| `adminCreditRoutes.test.ts` › owner: GET/PUT settings 200; GET pending 200; approve 200 approved / already_approved, 404 not_found, 400 bad id; manual add 201 / 200 replay / 409 / 404 unknown_user / 400; GET spend 200 | AC 2–5 |
| `adminCreditRoutes.test.ts` › owner wrong method → 405 with Allow; `Sec-Fetch-Site: cross-site` on PUT/POST → 403 `forbidden_origin`; non-JSON body → 415; body over 4096 bytes → 413 | Guards |
| `adminCreditRoutes.test.ts` › `createApp` without a pool → 503 `db_unavailable` for the owner, still 403 for non-owners; works with `ai: null` | Wiring |
| `adminCreditRoutes.test.ts` › log entries carry only `{event:"admin_credits", id, action, code}`: no user ids, amounts or request keys | Logging |
| `me.test.ts` › isOwner: true only for equal ids; false for null ownerSub; meBody unchanged | Shared owner test |

## Approach
1. **Migration `db/migrations/20261123120000_credit_admin.sql`** (one transaction, expand-only for the previous image because `credits.js` is not wired to any route yet):
   - Header comment: purpose, the `credit-admin` maintenance value, rollback safety, and a **manual rollback** block (`drop trigger …; drop function …; drop policy …;` recreate `owner_only` on both tables; `drop index …; alter table credit_grants drop column grant_key;`).
   - `alter table credit_grants add column grant_key text check (grant_key ~ '^[A-Za-z0-9_-]{1,128}$')`, plus `check (grant_key is null or bucket = 'manual')`. Nullable at table level (existing rows and test seeds have none); required by the admin insert policy and the API (A3).
   - `create unique index credit_grants_manual_key on credit_grants (user_id, grant_key) where grant_key is not null;`
   - Guard trigger `credit_grants_guard` (`before update for each row`, plpgsql function `credit_grants_guard()`): raise `check_violation` if `id`, `user_id`, `bucket`, `period`, `amount`, `created_at` or `grant_key` change, or if `old.approved_at is not null and new.approved_at is distinct from old.approved_at`. It applies to every role, so grant rows are immutable except for the one pending → approved transition (A4). Close any `do`/function body per the README rules.
   - User side (security note 10): `drop policy owner_only on credit_grants; drop policy owner_only on credit_ops;` then
     - `credit_grants_user_read for select using (user_id = (select app_user_id()))`
     - `credit_grants_user_insert for insert with check (user_id = (select app_user_id()) and grant_key is null and ((bucket = 'monthly' and approved_at is not null) or (bucket = 'welcome' and approved_at is null)))`
     - `credit_ops_user_read for select`, `credit_ops_user_insert for insert with check`, `credit_ops_user_update for update using … with check …`, all on `user_id = (select app_user_id())`. No user update or delete on grants; no delete on ops. This matches every statement in `credits.js` (insert/select grants; insert/select/update ops).
   - Admin side, every policy on `current_setting('tudo.maintenance', true) = 'credit-admin'` (`A` below):
     - `credit_admin_read on credit_grants for select using (A)`
     - `credit_admin_approve on credit_grants for update using (A and bucket = 'welcome' and approved_at is null) with check (A and bucket = 'welcome' and approved_at is not null)`
     - `credit_admin_manual on credit_grants for insert with check (A and bucket = 'manual' and approved_at is not null and period is null and grant_key is not null)`
     - `credit_admin_settings on credit_settings for update using (A) with check (A)`
     - No admin policy on `credit_ops`; no delete anywhere.
   - No `no force` toggles are needed (no rows of the forced tables are read or written). `RLS_TABLES` in `migrator.js` is unchanged (no new table).
2. **`server/db.js`**: `withCreditAdmin(pool, fn, { readOnly = false } = {})` through `inTx` with `["select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)", "credit-admin"]`. JSDoc: "Only server/ai/creditAdmin.js calls it." `withUser` already resets `tudo.maintenance` to `''`, so a user transaction can never carry the value.
3. **`server/ai/creditLock.js`**: `export const lockCreditUser = (c, userId) => c.query("select pg_advisory_xact_lock(hashtextextended('credits:' || $1::text, 0))", [userId]);` `credits.js` imports it; the expression is byte-identical, so the F-706.1 lock-wait test keeps proving the same lock.
4. **`server/ai/creditAdmin.js`** — `createCreditAdmin(pool, { now = Date.now } = {})`. User ids are checked with `toUserId(x) === x` before the pool is touched (throws, programmer error). All SQL parameterised; no I/O inside transactions.
   - `getSettings()` (read only): `select welcome_amount, monthly_amount, updated_at from credit_settings` → `{ welcomeAmount, monthlyAmount, updatedAt }`.
   - `updateSettings({ welcomeAmount, monthlyAmount })`: `update credit_settings set welcome_amount = $1, monthly_amount = $2, updated_at = $3 returning …`; `rowCount !== 1` → throw (fail closed if the policy or helper is wrong; mapped to 503).
   - `listPending({ limit = 200 })` (read only): `select user_id, amount, created_at from credit_grants where bucket = 'welcome' and approved_at is null order by created_at, user_id limit $1`.
   - `approveWelcome(userId)`: lock; `update credit_grants set approved_at = $2 where user_id = $1 and bucket = 'welcome' and approved_at is null returning amount, approved_at` → `approved`; else `select approved_at, amount … where bucket = 'welcome'` → `already_approved` or `not_found`. Stored amount kept (A1).
   - `addManual(userId, amount, grantKey)`: lock; known-user check `select exists (select 1 from credit_grants where user_id = $1)` → `unknown_user` (A2); `insert … (user_id, bucket, amount, approved_at, grant_key) values ($1, 'manual', $2, $3, $4) on conflict (user_id, grant_key) where grant_key is not null do nothing returning id, amount, created_at` → `created`; else read the existing row → same amount `replay`, otherwise `grant_key_mismatch`.
5. **`server/ai/adminValidate.js`** (pure) and **`server/ai/adminCreditRoutes.js`**:
   | Method | Path | Body | Success | Errors |
   |---|---|---|---|---|
   | GET | `/api/admin/credits/settings` | — | 200 `{ welcomeAmount, monthlyAmount, updatedAt }` | 503 |
   | PUT | `/api/admin/credits/settings` | exactly `{ welcomeAmount, monthlyAmount }` | 200, same shape | 400 `invalid_input {field, reason}`, 413, 415, 503 |
   | GET | `/api/admin/credits/pending` | — | 200 `{ accounts: [{ userId, amount, createdAt }] }` (oldest first, max 200) | 503 |
   | POST | `/api/admin/credits/pending/:userId/approve` | none read | 200 `{ status: "approved" \| "already_approved", userId, amount, approvedAt }` | 400 `invalid_input {field:"userId"}`, 404 `not_found`, 503 |
   | POST | `/api/admin/credits/users/:userId/grants` | exactly `{ amount, requestKey }` | 201 `{ grant: { id, userId, amount, createdAt } }`; 200 same plus `replay: true` | 400, 404 `unknown_user`, 409 `grant_key_mismatch`, 413, 415, 503 |
   | GET | `/api/admin/spend` | — | 200 `{ period, capMicroUsd, spentMicroUsd, remainingMicroUsd, priceVersion }` = `spendMeter.status()` | 503 |
   - `readJson(req, { limit: 4096 })`. DB errors → 503 `db_unavailable` (as `adminRoutes.js`). `sendJson` already sets `Cache-Control: no-store`.
   - Logs: `{ event: "admin_credits", id, action, code }` only.
   - Handler starts with `if (!isOwner(userId, ownerSub)) → 403 forbidden` (second layer), then `if (!creditAdmin || !spendMeter) → 503`.
   - Route comment notes that spend counts reserved plus charged estimates (the same figure the cap uses, D53) and that the owner is not exempt from it.
6. **`server/api.js`**: before `match(parts)`: `if (parts[0] === "" && parts[1] === "api" && parts[2] === "admin" && !isOwner(userId, ownerSub)) { setRoute("/api/admin"); log({event:"admin", id, code:"forbidden"}); return sendError(res, 403, "forbidden"); }`. This makes F-706.3's non-owner wrong-method answer 403 instead of 405 (A7; the same feature-list AC, so not scope creep under R7). Add `match()` entries: `parts.length === 5 && a==="admin" && b==="credits" && c==="settings"` (GET, PUT); `… c==="pending"` (GET); `parts.length === 7 && … c==="pending" && parts[4] && parts[5]==="approve"` (POST); `parts.length === 7 && … c==="users" && parts[4] && parts[5]==="grants"` (POST); `parts.length === 4 && a==="admin" && b==="spend"` (GET). Dispatch `m.route.startsWith("/api/admin/credits") || m.route === "/api/admin/spend"` to `handleAdminCredits` with `{ route: m.route, parts, userId, ownerSub, creditAdmin, spendMeter, id, log }`. Must sit before the generic `itemId = parts[3]` UUID check.
7. **`server/app.js`**: new optional deps `creditAdmin`, `spendMeter`; defaults built once from `pool` (`null` without a pool); passed into `handleApi`. Not tied to `ai`.
8. **`server/me.js`**: `export function isOwner(userId, ownerSub) { return ownerSub !== null && ownerSub !== undefined && userId === ownerSub; }`; `meBody` and `adminRoutes.js` use it.
9. **Docs**: `server/README.md` route rows; `db/migrations/README.md` one line on the credit-table policies.
10. **Existing tests**: update `rls.db.test.ts` policy list and `migrator.db.test.ts` `beforeCredit()`; run the full `credits.db.test.ts`, `spend.db.test.ts`, `appKeys.db.test.ts` and `rls.db.test.ts` suites against Postgres 17.

CLAUDE.md rules:
- R1: server only; no client change (the client repo methods come with F-706.6).
- R2 (project equivalent): new migration file, RLS in the same file, no applied migration edited, never applied by agents. No `src/types/database.ts` regeneration exists for the Node schema.
- R3: no secrets involved; nothing reaches the browser.
- R5: balances stay computed; the admin path stores only grants and settings.
- R7: no admin balance read, no deny/delete of pending accounts, no `credit_ops` admin read, no breakdown of spend.
- R8: pure parsers in `adminValidate.js` with unit tests; module and DB tests for `creditAdmin.js`.
- R6/R9: not applicable (no UI).

## Specialist input used
- **Both consults, adopted:** `withCreditAdmin` on `tudo.maintenance = 'credit-admin'` in the `withAppKeys` shape, with all SQL in a new `server/ai/creditAdmin.js`. This deliberately departs from F-706.1 plan §8 (`withAdmin` / `tudo.admin`), because every existing helper already resets `tudo.maintenance` and a second setting would need every helper edited (architect R-b).
- **Both, adopted:** admin policies limited to welcome approve (pending → approved), manual insert and settings update; no delete; no `credit_ops` admin policy; spend read reuses `createSpendMeter(pool).status()` with no new SQL.
- **Both, adopted:** take the per-user advisory lock for approve and manual add. Instead of exporting it from `credits.js` (DB consult), it moves to `creditLock.js`, so the `credits.js` inertness test (architect finding 8) stays valid.
- **Architect R-a, adopted:** owner check at the `/api/admin` prefix before route matching, plus the per-handler check; shared `isOwner` in `me.js`.
- **Architect R-c / F-706.1 security note 10, adopted:** replace `owner_only` on the credit tables with per-command user policies in the same migration.
- **Architect R-e / R-f / R-g, adopted:** route shapes, strict bodies, pure validation module, `creditAdmin`/`spendMeter` built in `app.js` independent of `ai`, fake injection for route tests. Path for manual add follows the architect (`/users/:userId/grants`), not the DB consult's `POST /api/admin/credits/grants` with `userId` in the body, so the user id is validated like the approve path.
- **DB consult rec 1 (guard trigger), adopted** (A4): an update policy cannot restrict columns.
- **DB consult rec 6 (partial pending index), rejected:** the table holds one welcome row per user; a scan with `limit 200` is enough and the index adds catalog churn. Easy to add later.
- **DB consult rec 5 (optional `request_key`) vs architect (required `grant_key`):** required at the API and in the admin insert policy, nullable at table level (A3).
- **Open question 1 (approve amount), DB consult default chosen over architect's:** stored amount (A1).
- **Open question 4 / architect OQ 2 (unknown UUID), architect default chosen over DB consult's:** reject with 404 `unknown_user` (A2).
- **Pending emails, spend breakdown:** both consults default to "no"; adopted (A5, A6).

## Assumptions
Each has a stated default; Ming confirms or changes them when approving this plan (Gate: plan-approval). None blocks planning; all are reversible.
- **A1 Approve keeps the stored amount.** A pending welcome row keeps the amount it was created with (F-706.1 A4: "fixed at creation for now"); approval sets only `approved_at`. A settings change applies to welcome rows created afterwards. Alternative (architect): approval re-reads the current `welcome_amount`; that needs the guard trigger and the approve policy to allow an `amount` change.
- **A2 Manual credits only for user ids the ledger knows** (any `credit_grants` row), otherwise 404 `unknown_user`. This guards against a mistyped UUID (no users table, D50). Any user who has opened the credit UI (F-706.7) or used AI (F-706.4), or who was an existing account at F-706.1, is known. Alternative (DB consult): allow any valid UUID.
- **A3 `requestKey` is required for manual adds.** F-706.6 creates one per submit, so a double click or retry never doubles credits. The `grant_key` column stays nullable at table level.
- **A4 Guard trigger on `credit_grants`.** It also blocks hand edits of `amount` etc. by the DB owner role; a manual correction would need `alter table credit_grants disable trigger credit_grants_guard` inside the same transaction (documented in the migration header).
- **A5 Pending list shows ids only** (`userId`, `amount`, `createdAt`); Ming matches the sub in the mmlabs Identity console. Storing emails would need a privacy decision and its own ticket.
- **A6 Spend view is exactly `spend.status()`**, in integer micro-USD; formatting is F-706.6. No per-kind breakdown.
- **A7 Non-owner on any `/api/admin/*` path or method gets 403**, which changes F-706.3's non-owner wrong-method answer from 405 to 403 (same feature-list AC). Owner wrong method stays 405; owner unknown admin path stays 404.
- **A8 User-side policy narrowing (security note 10) ships here.** `credits.js` needs only insert/select on grants and insert/select/update on ops; the full `credits.db.test.ts` proves it.
- **A9** No deny/delete for pending accounts and no admin balance read (a balance read through `credits.balance()` would create grant rows for any UUID; any future one must be read-only). Pending rows of drive-by sign-ups stay in the list (capped at 200, oldest first).
- **A10** Changing the monthly amount mid-month: users who already have this month's monthly grant keep the old amount; others get the new one when the ledger first sees them this month. This satisfies "later grants use the new amounts"; F-706.6 copy should say so.
- **A11** The approve route reads no body (an empty POST is accepted; `readJson` would answer 415 to a body-less request).
- **A12** The owner's own welcome grant was seeded approved by F-706.1; nothing changes for it. The owner is not exempt from the cap (D53); there is no owner path in the meter.
- **Hotspots:** no open ticket (`IN_PROGRESS` / `REVIEW` / `DONE`: T-029, T-030, T-032, BUG-014, BUG-016) edits these files. Upcoming tickets F-706.4, F-706.6, F-707.2/.3 and F-708.x will edit `server/api.js`, `server/app.js`, `server/rls.db.test.ts`, `server/migrator.db.test.ts` and add migrations; if another migration lands on `main` first, re-stamp `20261123120000` so it stays the newest file before merge.
- The local machine has no Node/pnpm in PATH; the implementer must run the checks (including the DB suites on Postgres 17) where they are available, or rely on CI, and record which in impl-log.

## Blocking questions
None.

## Split proposal
None. Estimate: about 450 changed product lines (migration ~90, `creditAdmin.js` ~150, routes ~150, validation ~50, wiring ~40) plus tests. This is near the guide, but splitting would cost Ming a second High-tier plan gate, and the route slice alone could not be tested without the module. If the implementation runs clearly past the estimate, the natural split is .5a (migration, `withCreditAdmin`, `creditLock.js`, `creditAdmin.js` and their DB/RLS tests, no route) and .5b (validation, routes, wiring, route tests, README).
