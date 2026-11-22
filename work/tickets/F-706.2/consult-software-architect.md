## Consult: software-architect, F-706.2 (spend meter + versioned price table)

### Findings
1. **F-706.1 sets the pattern to copy.** `server/ai/credits.js:1-5` is one short `withUser` transaction per call, statuses returned rather than thrown, no HTTP codes, and nothing imports it (`credits.test.ts:48-58`). Pure helpers live in `creditMath.js`. F-706.1's architect consult already says F-706.2 owns the cap code, `spend.js` is a separate module with its own global row and lock, and F-706.4 runs reserve credits → reserveSpend → refund credits if spend is refused (`work/tickets/F-706.1/consult-software-architect.md:12,71-73`).
2. **Nested locks are already blocked at runtime.** `inTx` throws `"nested transaction"` (`server/db.js:51`), so spend cannot run inside the credit transaction. F-706.4 has to make three or four short sequential transactions. Do not add a code path that tries to nest.
3. **The meter cannot be reached from `withUser`.** `withUser` sets `app.user_id` and clears `tudo.maintenance` (`db.js:87`). `withMaintenance` is read-only and only accepts `photo-sweep` (`db.js:40,101-108`). The meter needs a writable, user-less transaction helper. `SECURITY DEFINER` will not help (ai-stylist-notes §3, "RLS on the cap").
4. **The adapters return no usage data** (`gemini.js:147` returns only `{ok,input}`; `claude.js:79` the same), so estimates are the only option. They are bounded by known ceilings:
   - Gemini: `MAX_OUTPUT_TOKENS = 2048` and `GEMINI_THINKING` budgets (`gemini.js:12-19`).
   - Claude: `max_tokens: 1024` (`claude.js:55`).
   - Photo body: `MAX_BYTES` (`tagPhoto.js:6,39`).
   - Suggest body: 4 KiB (`validate.js:5`).
5. **Adapter failure codes tell "not billed" apart from "maybe billed".**
   - Not billed (HTTP error before any generation): `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`.
   - Maybe billed: `provider_unavailable`, which includes timeouts and aborts (`gemini.js:150`), and `provider_bad_response`, a 200 that was billed.
6. **Adding a code to the error mirrors forces UI copy.** `AI_ERRORS: Record<AiErrorCode,string>` (`src/features/settings/copy.ts:34`) fails typecheck until it has a Vietnamese string. `parity.test.ts:17` requires `catalog.js:27` and `errors.ts:4` to be equal. `AI_BATCH_OFF` (`src/data/photoImport.ts:36-48`) has no compile-time link.
7. **Owner exemptions are confined to the limiters and slots** (`rateLimit.js:75-81`, `app.js:52-75`).
8. **Test hotspots.**
   - `rls.db.test.ts:16-17,276,285-305,327-331` lists every table and policy.
   - `migrator.db.test.ts` counts migrations.
   - The README's "RLS rules" names `credit_settings` as the only app-wide table.
   - `credits.test.ts:57` asserts that only `credits.js` imports `creditMath.js`.
9. **Scope overlaps between tickets.**
   - F-706.4's scope also lists the "cap reached" code. F-706.2's scope owns it.
   - F-706.5 reads spend but lists `Depends on: F-706.1` only. It should also depend on F-706.2.

### Recommendations
**R1. Module boundary (AC 1–4).** Three files, built the same way as credits:
- **`server/ai/spendPrices.js`** (pure, no I/O):
  - `PRICE_TABLE = Object.freeze({ version: "YYYY-MM-DD", capMicroUsd: 20_000_000, models: { "<provider>:<model>": { inputUsdPerMTok, outputUsdPerMTok } } })`.
  - Per-kind token ceilings `{ photo_fill: { input, output }, suggest: { input, output } }`, with outputs derived from the adapter caps plus thinking budget.
  - `estimateMicroUsd(provider, model, kind) → int | null` (null = unpriced). Round up.
  - `isConfirmedNoCharge(code)` covering the codes in Finding 5.
  - Store amounts as integer micro-USD, never floats.
  - The month comes from `vnToday` (`../validate.js`) rather than `creditMath.js`, so `credits.test.ts:57` stays untouched.
- **`server/ai/spend.js`**: `createSpendMeter(pool, { now })`. It returns statuses and never takes a `userId`:
  - `reserve({ provider, model, kind })` → `{status:'reserved', spendId, estimateMicroUsd}` | `{status:'cap_reached', status: …}` | `{status:'unpriced'}`
  - `settle(spendId)` → keeps the estimate (marks it `charged`). Returns `noop` if already settled.
  - `release(spendId)` → only when `isConfirmedNoCharge`, and only from `reserved`.
  - `status()` → `{ period, capMicroUsd, spentMicroUsd, remainingMicroUsd, priceVersion }`
  - The planner decides whether to rename `refund` to `release`. Avoid the word "refund" here, because a credit refund keeps the spend.
- **`db.js`**: a new `withSpendMeter(pool, fn, {readOnly})` setting `tudo.maintenance = 'ai-spend'` and `app.user_id = ''`. The user tables stay invisible inside it, and `withUser` can never reach the meter.

**R2. Schema (AC 1, 2, 6).** A rows-based table rather than a counter, which follows R5's spirit and makes release idempotent:
- `ai_spend_ops(id uuid pk, period text 'YYYY-MM', provider, model, kind, price_version text, estimate_micro_usd bigint > 0, state in ('reserved','charged','released'), created_at, settled_at)` with no `user_id`, plus an index on `(period)`.
- Spent = `sum(estimate) where period = P and state <> 'released'`.
- Reservations **never expire**: a crash keeps the estimate, which is the pessimistic outcome D53 asks for.
- Concurrency: `pg_advisory_xact_lock(hashtextextended('ai-spend',0))`, then sum, refuse if `spent + est > cap`, then insert. All in one short transaction with no I/O.
- RLS: `enable` + `force`, with separate `select`, `insert` and `update` policies `using/with check (current_setting('tudo.maintenance', true) = 'ai-spend')` and **no delete policy**.
- Make `F-706.1`'s planned `ai_budget_months` name concrete as the planner sees fit, but each reservation needs its own row (a single counter row cannot make release idempotent).
- The migration is expand-only, with a timestamp newer than `20261122120000`. Update the README "RLS rules" line.

**R3. Versioning and later image models (F-705/F-708).**
- Every op row stores `price_version` and the estimate. A price change bumps `version` and never rewrites history; totals are sums of stored estimates.
- Image models add an entry `{ usdPerImage }` (with `usdPerInputImage` if needed) keyed `provider:model`, and a `sticker` kind ceiling. The estimate function branches on entry shape.
- Keep image models out of `AI_MODELS` (notes §3).
- Add a unit test that every `AI_MODELS` id has a price entry, so a catalog addition without a price fails CI. The runtime refusal (`unpriced`) stays as a second guard.

**R4. Inert until F-706.4.**
- Add an inert test copied from `credits.test.ts:48-58`: no non-test file imports `spend.js`, and only `spend.js` imports `spendPrices.js`.
- No route and no `app.js` change.
- The cap code sits in the mirrors with no producer, which the ticket scope accepts.

**R5. Cap error code: F-706.2 owns it (ticket scope; F-706.1 consult :12).**
- Add it to `errors.ts:4`, `catalog.js:27` and the `copy.ts:34` Vietnamese string (needed for typecheck). Suggested name `ai_spend_cap` at 503, no Retry-After.
- Leave `AI_BATCH_OFF` and the route mapping to F-706.4. Amend F-706.4's scope line to "map the cap code (added by F-706.2)" so the code is not added twice.
- Unpriced model: map `{status:'unpriced'}` to the existing `server_misconfigured` (503, already in `AI_BATCH_OFF`) rather than a new code.

**R6. Owner not exempt (AC 5).**
- The API has no `userId` or `ownerSub` parameter at all.
- A static test asserts `spend.js` and `spendPrices.js` never reference `ownerSub` or `TUDO_OWNER_SUB`.
- A DB test at the cap shows `reserve` refuses inside a run configured with the owner sub (the meter cannot even tell who the caller is).
- The route-level owner test belongs to F-706.4.

**R7. What F-706.5 needs from this split.**
- `status()` (read-only via `withSpendMeter`) returning period, cap, spent (reserved + charged), remaining and price version.
- Optionally a `byModel` breakdown from the same table at no extra cost.
- F-706.4's planned `GET /api/credits` `aiOff` flag comes from `status()`: remaining < the estimate of the active model's cheapest kind.

**R8. Test strategy.**
- **Unit `spendPrices.test.ts`:**
  - The estimate is at least the ceiling maths and rounds up.
  - Unpriced returns null.
  - `isConfirmedNoCharge` table.
  - Every `AI_MODELS` id is priced.
  - The version string is present.
  - The month at the UTC+7 boundary.
- **DB `spend.db.test.ts`** (real `createPool` max 5, owner role, FORCE):
  - N=8 parallel reserves where exactly k fit, giving exactly k rows and spent ≤ cap.
  - A lock-detection variant like F-706.1's `credits.db.test.ts:167`.
  - Settle keeps the estimate; release removes it only from `reserved`, and repeating it is a no-op.
  - At the cap, refuse with no insert.
  - Month rollover resets the total.
  - Unpriced inserts nothing.
- **RLS** (`rls.db.test.ts`):
  - `withUser` sees 0 rows; insert gives 42501; update and delete touch 0 rows.
  - `withMaintenance('photo-sweep')` sees nothing.
  - `withSpendMeter` can insert and update but not delete.
  - Policy catalog entries.
- Bump the migration count in `migrator.db.test.ts`.

**R9. Size and split.** M is right; no split. Files:
- migration
- `db.js` helper
- `spendPrices.js` and `spend.js`
- 3 test files
- `rls` and `migrator` test edits
- README
- 2 mirrors and `copy.ts`

Plan against `main`. Expect conflicts in the same hotspot lists as F-706.1 (unmerged on `claude/magical-cori-2ssw8l`), so rebase after it merges. The spend code does not touch the credit tables.

### Risks
- **Prices are search snapshots** (feature-list:290). Wrong unit prices under-count. They must be rechecked against the live pricing pages and recorded with the version date before ship.
- **Image-input token count is the weak estimate.** Pin it to the worst case for `MAX_BYTES`, or to provider-documented tile maths, and comment the derivation.
- **The "no charge" rule is a judgement call.** If a 429 or 4xx is ever billed, the meter under-counts slightly. A timeout counted as charged over-counts, which is safe.
- **The global lock serialises every paid call's reserve and settle.** That is fine at 5 connections and microsecond transactions. It must never be taken inside `withUser` (enforced by `db.js:51`).
- **Never-expiring reservations from crashes inflate spend.** This is acceptable (pessimistic); the provider dashboard reconciliation is manual (Ming).
- **`tudo.maintenance` is a GUC any server code could set.** It is defence in depth only, same as `photo_sweep_read`.
- **The cap code without `AI_BATCH_OFF` is harmless only until F-706.4.** F-706.4 must add it in the same diff that starts producing it.

### Open questions (for Ming at the plan gate)
1. Is the $20 cap a code constant (current recommendation), or an admin-editable setting like `credit_settings`? D53 only makes the grant numbers editable.
2. Price only Gemini, or every `AI_MODELS` entry including Claude? D52 allows a second provider key, and an unpriced model is refused.
3. Which error code name and HTTP status (proposal: `ai_spend_cap`, 503)? And is reusing `server_misconfigured` for an unpriced model acceptable?
4. Should F-706.5's `Depends on` gain F-706.2? Should F-706.4's scope drop "add cap code" in favour of "map it"?
5. Confirm the "provider confirmed no charge" list: `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`.
