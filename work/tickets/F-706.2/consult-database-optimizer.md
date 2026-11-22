## database-optimizer consult: F-706.2 (spend meter and price table)

Read-only consult. I edited no files.

### Findings
- **The F-706.1 pattern to copy** (`server/ai/credits.js`):
  - one short `withUser` transaction per call, with no I/O inside it;
  - a transaction-scoped advisory lock (`credits.js:109-110`);
  - business outcomes are returned as statuses and never thrown (`credits.js:1-5`);
  - the clock is injected, and the period comes from `vnMonth()` in JS (`creditMath.js:18-19`);
  - lookups use `Object.hasOwn` (`creditMath.js:11-16`).
- **Nested transactions are impossible.** `inTx` throws on them (`server/db.js:51`). So the credit transaction and a spend transaction can never be open at once, and the two locks can never be held together or deadlock. That holds as long as nobody adds a combined helper.
- **Pool and timeout.** The pool has 5 connections and a 5 s `statement_timeout` (`db.js:14,17`). Time spent waiting for `pg_advisory_xact_lock` counts toward that timeout, so heavy contention ends in error 57014. That fails closed: no provider call is made.
- **Existing RLS access paths:**
  - `withUser` sets `app.user_id` and clears `tudo.maintenance` (`db.js:80-93`).
  - `withMaintenance` uses a task allow-list, clears `app.user_id` and is read-only (`db.js:40,101-109`). It reaches the SELECT-only policy `photo_sweep_read`.
  - `credit_settings` is app-wide data with `using (true)` for select only (`20261122120000_credit_ledger.sql:82-84`). Every `withUser` and `withMaintenance` transaction can read it (`rls.db.test.ts:247-262,327-330`).
  - F-706.1 proposes `withAdmin(pool,'credits',fn)` with `tudo.admin='credits'`, read-write, trusted only after the route checks `sub===ownerSub` (`work/tickets/F-706.1/plan.md:231-243`). F-706.1's security review also recommends narrowing the credit tables' `owner_only FOR ALL` to per-command policies with no delete (`security-review.md:51-56`).
- **Migration ordering.** The migrator refuses any file older than the newest applied one (`server/migrator.js:68`). `RLS_TABLES` maps each table to the version its guard starts from (`migrator.js:113-124`), and F-706.1 adds `CREDIT_LEDGER_VERSION = "20261122120000"` to it.
- **Usage data is thrown away** (`gemini.js:147`, `claude.js:79`). The meter can only work from estimates.
- **Any model id can be stored.** `MODEL_ID_PATTERN` accepts anything that matches the pattern (`catalog.js:25`), and `modelSupported` is only a display flag (`routes.js:32`). Unpriced models are a real path today, not a theoretical one. `AI_MODELS` is at `catalog.js:12-23`.
- **Owner exemption.** It is a per-call `owner` boolean in the limiter (`rateLimit.js:75-81`).

### Recommendations

**1. Table: one ledger table, `ai_spend_ops`, with no counter row.** This follows R5 and matches F-706.1's computed balance, and refund and settle need one row per call anyway.
```sql
create table ai_spend_ops (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  provider text not null check (provider in ('claude','gemini')),
  model text not null check (length(model) between 1 and 100),
  kind text not null check (kind in ('photo_fill','suggest','sticker')),
  price_version text not null,
  estimate_micros bigint not null check (estimate_micros between 1 and 5000000),  -- integer micro-USD, never float
  state text not null check (state in ('reserved','committed','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint ai_spend_ops_settled check ((state = 'reserved') = (settled_at is null))
);
create index ai_spend_ops_period on ai_spend_ops (period);
```
- **No user data.** No `user_id`, and no client `op_key`: a client key is unique only per user and could carry user data. Use the server-generated `id` returned by reserve as the handle for settle. F-706.4 can keep that id in memory or in its replay store.
- **Linkability.** An owner who reads `created_at` and `kind` could match rows to `credit_ops`. That is acceptable because the admin is the owner; recording it in the plan is enough.
- **Rejected alternative: an `ai_budget_months(period, spent_micros)` counter** updated with `update … set spent = spent + $e where spent + $e <= cap returning`. It is lock-free, but it stores a derived value, still needs a per-call table to release, and can drift. Use it only if Ming prefers it.
- **The cap ($20 = 20_000_000 micros)** is a code constant for v1, not a DB row (see Open questions).

**2. Price table lives in code, in a new `server/ai/prices.js`.** It changes only through a reviewed PR, and no runtime write path or RLS is needed for it.
- **Contents:**
  - `PRICE_VERSION = "2026-11-22"`;
  - a frozen map keyed `provider:model`, holding input and output micro-USD per million tokens, per-image cost and output cap;
  - `estimateMicros(provider, model, kind)`, which takes the worst case per kind (max image tokens + prompt + `max_tokens` output) and rounds up.
- **Signature.** Make it `reserveSpend({provider, model, kind})`, with the meter computing the estimate. Do not use the ticket's literal `reserveSpend(model, estimate)`: a caller-supplied estimate of 0, NaN or an underestimate defeats the cap. If the planner keeps a caller-supplied estimate, it must be at least the table value.
- **Unpriced models.** An unpriced model, or a prototype key such as `constructor`, returns `{status:'unpriced'}` before the pool is touched. That is a status, not a throw.
- **`price_version` on every row** explains old totals after a price change.
- **Test:** every `isDefault` model in `AI_MODELS` is priced, and the unpriced-model test uses a real `AI_MODELS` id left out of the map, or a custom id.
- **The feature list's prices are search snapshots** (`feature-list.md:290`). Ming has to recheck them before this ships; put that in `ming-todo`.

**3. Concurrency: one global transaction-scoped advisory lock.**
- **Reserve, in one short transaction:**
  1. `select pg_advisory_xact_lock(hashtextextended('ai_spend', 0))`;
  2. `select coalesce(sum(estimate_micros),0)::bigint::text from ai_spend_ops where period=$1 and state <> 'released'`;
  3. if `sum + est > cap`, return `{status:'cap_reached', spentMicros, capMicros}`; otherwise insert with `state='reserved'` and `returning id`.
- **Why a lock is needed.** A single `insert … select … where sum+est<=cap` is not safe under READ COMMITTED, so it does not work without the lock. A row lock on a months row would also work. The advisory lock matches `credits.js` and the F-706.1 tests that detect a missing lock.
- **Contention is negligible.** The critical section is one indexed sum plus one insert, at tens of users.
- **Hash collisions are not a concern.** The `'ai_spend'` key against `'credits:'||uuid` keys or the migrator's session lock `7410512012` (`migrator.js:9`) has a ~2^-64 chance.
- **Never nest.** F-706.4 order:
  1. credit reserve (its own transaction);
  2. spend reserve (its own transaction);
  3. provider call;
  4. spend settle, then credit commit or refund.
  
  If step 2 fails (`cap_reached`, `unpriced` or timeout), refund the credit op and make no provider call. Write this into the plan's F-706.4 follow-ups.

**4. Failed-call accounting.**
- **Count every row that is not `released`.** A `reserved` row counts forever: spend has no TTL, unlike `RESERVATION_TTL_MS` (`creditMath.js:9`), because a stalled call may still be billed.
- **`commitSpend(id)`** moves `reserved → committed` and keeps the estimate. v1 does not lower it to actual usage, since actual usage is not available.
- **`releaseSpend(id)`** moves `reserved → released`. Use it only when the provider confirms no charge. Concretely:
  - the request was never sent (validation failed, or it was aborted before `fetch`);
  - or a definitive non-billing reply came back. Those statuses are F-706.4's call; suggest 400, 401, 403 and 429.
- **Keep the estimate** on timeout, network error, 5xx and `provider_bad_response` (tokens were generated).
- Settling an already-settled row is a no-op status, as in `credits.js:144-151`.

**5. Month (UTC+7).** Compute `period` with `vnMonth(now())` in JS and pass it as a parameter. Do not use the DB `now()`: that keeps one clock and lets tests inject the time. A row stays in the period it was reserved in, even if it settles after the month changes.

**6. RLS under FORCE.**
- `SECURITY DEFINER` does not help, because the app is the owner role.
- Do not use `using (true)` or `app_user_id() is not null`. Either would let any `withUser` code read the spend of the whole app, or wipe it.
- **Use a GUC-keyed path with per-command policies and no delete policy:**
```sql
alter table ai_spend_ops enable row level security;
alter table ai_spend_ops force row level security;
create policy ai_spend_read   on ai_spend_ops for select using (current_setting('tudo.service', true) = 'ai-spend');
create policy ai_spend_insert on ai_spend_ops for insert with check (current_setting('tudo.service', true) = 'ai-spend' and state = 'reserved');
create policy ai_spend_settle on ai_spend_ops for update
  using (current_setting('tudo.service', true) = 'ai-spend' and state = 'reserved')
  with check (state in ('committed','released'));
```
  With these policies the DB itself makes settled states final and makes spend history impossible to delete through the app.
- **Helper.** Add `withService(pool, task, fn)` to `db.js`, modelled on `withMaintenance`:
  - a fixed allow-list `['ai-spend']`;
  - it sets `tudo.service` and clears `app.user_id` and `tudo.maintenance`;
  - it is read-write.
  
  `withUser` and `withMaintenance` should also clear `tudo.service`, which is only belt-and-braces since every setting is transaction-local. Touching `db.js` is High tier.
- **Do not reuse `withAdmin('credits')` for the meter.** `withAdmin`'s trust model is "only after the owner check", but every user's AI call needs the meter. Sharing a task value would let admin policies and user paths overlap.
- **Build the mechanism once instead.** F-706.5 can add `admin` tasks to the same allow-list or helper, with its own policies: for example, a `select` on `ai_spend_ops` for the spend view under `tudo.admin`. That avoids two near-identical helpers.

**7. Migration.**
- Name it `20261122140000_ai_spend_meter.sql`, or any version after `20261122120000`.
- Header: expand-only (an older image never reads it), a manual rollback comment, RLS in the same file, and no `begin`/`commit`.
- Add `ai_spend_ops: SPEND_METER_VERSION` to `RLS_TABLES` (`migrator.js:115-124`).
- Update the table list and policy snapshot in `rls.db.test.ts:271-305`, the forced-table lists in `migrator.db.test.ts:667,681`, and the README rule at `db/migrations/README.md:21-26` (it names `credit_settings` as the only app-wide table).
- Keep `ai_spend_ops` out of backup and restore, as with the credit tables, and extend the backup test that asserts `credit_`.

**8. Tests (DB unless marked unit).**
- **Parallel calls at the cap:** remaining budget = exactly k estimates, N > k parallel `reserveSpend` calls give exactly k `reserved` and the rest `cap_reached`. Add a variant that proves the lock matters, as the F-706.1 commit e11637b does.
- **Month boundary:** with an injected clock at 16:59:59Z versus 17:00:00Z on the last day of the month, the new period starts at 0 and a reservation from the old period that settles later still counts in the old one.
- **Refund semantics:**
  - commit keeps the estimate;
  - release removes it;
  - a `reserved` row that is never settled keeps counting after any amount of time;
  - double settle is a no-op;
  - release after commit is refused;
  - RLS rejects an update from `committed` to `reserved`.
- **Unpriced model:** returns `unpriced` and inserts no row. Unit tests cover the estimate math and prototype keys.
- **Owner not exempt:** `reserveSpend` takes no identity. At the cap, a call made with `TUDO_OWNER_SUB` configured as the caller gets `cap_reached`. Add a static test that `spend.js` does not import `rateLimit` or `ownerSub`.
- **RLS:**
  - in `withUser`, select returns 0 rows, insert fails with 42501, update and delete touch 0 rows;
  - in `withMaintenance`, 0 rows;
  - in `withService('ai-spend')`, read, insert and settle work, delete touches 0 rows, and owner-only tables show 0 rows;
  - an unknown task throws.
- **Timeout:** a held lock, plus a short statement timeout in the test, gives a clean error status or error and no row.

### Risks
- **The F-706.1 branch has not merged.** F-706.2 must branch from it or rebase after it. `migrator.js` `RLS_TABLES`, `rls.db.test.ts` and `migrator.db.test.ts` are shared hotspots that will conflict. If F-706.2 were applied before F-706.1, the migrator would reject `20261122120000` as older (`migrator.js:68`).
- **A single global lock serializes all AI reservations.** That is fine at this scale. Under load, lock waits time out (5 s) and the call fails closed, so it is never overspent.
- **The estimates are only as pessimistic as the table.** An image model in the spike (F-705) may need per-image pricing; the table shape must allow it.
- **A pessimistic meter can turn AI off early,** before real spend reaches $20. That is accepted by D53; reconciliation is manual.
- **The new GUC is a new trust boundary.** Any code that calls `withService('ai-spend')` can insert or settle spend rows. Keep the helper's only caller in `server/ai/spend.js` and assert it with a test.

### Open questions
1. Is the $20 cap a code constant, an env variable (e.g. `TUDO_AI_MONTHLY_CAP_USD`), or admin-editable later (F-706.5)? I recommend a code constant for v1.
2. Is the `reserveSpend` signature `(provider, model, kind)` acceptable, against the ticket's `(model, estimate)`?
3. Which provider responses count as "provider confirms no charge"? It matters for F-706.4; F-706.2 only provides `releaseSpend`.
4. GUC and helper naming: is a generic `withService` with tasks `ai-spend`, and later `admin`, acceptable now, or should F-706.2 add `withSpend` and leave the unification to F-706.5?
5. Should the cap error code be `ai_budget_exhausted` with status 503 or 429? It has to be added to `catalog.js` `AI_ERROR_STATUS` (`:27-54`) and `src/shared/ai/errors.ts`, which the parity test keeps equal.
