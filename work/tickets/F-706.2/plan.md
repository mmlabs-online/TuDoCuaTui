Status: READY

# Plan — F-706.2: App-wide monthly spend meter and model price table

Planned against `main` plus F-706.1 (branch `claude/magical-cori-2ssw8l`, PR #102, not merged yet). **IMPLEMENT
starts only after PR #102 is merged** and the branch `ticket/F-706.2` is cut from that `main`. The plan approval gate
applies (High paths: `server/**`, `db/migrations/**`).

## Scope summary
- `docs/feature-list.md` E7 F-706: "**F-706.2 Spend cap:** app-wide monthly spend meter with a versioned model price
  table." F-706 AC: "A failed provider call refunds credits. Its estimated cost stays in the spend meter unless the
  provider confirms no charge, because a timed-out call may still be billed." / "Reservations count against the cap
  before the provider call, so parallel calls cannot pass $20." / "At the cap, AI routes answer a distinct error with
  no provider call, and all non-AI routes still work." (the route part is F-706.4). Technical note: "App-wide rows …
  do not fit the `owner_only` policy, so the plan must propose a narrow access path." Known limit: "Prices come from
  search snapshots and must be rechecked against live pricing pages before F-706.2 ships."
- D53: "App-wide cap $20/month counted with pessimistic per-model estimates (reservations count before the provider
  call; a failed call refunds the user but its estimate stays in the meter unless the provider confirms no charge);
  unpriced models are refused; at the cap every AI route returns a distinct error with no provider call and the rest
  of the app works. Owner exemptions from rate limits (D38) do not exempt anyone from the cap. … months follow UTC+7."
- D52: one shared key per provider, "Gemini for text by default; a second provider only if F-705 picks it for images".
- D32: every new table gets RLS `ENABLE` + `FORCE`; R2 (as amended for Postgres): schema changes are a new file in
  `db/migrations/` with RLS in the same migration; never edit an applied migration.
- Ticket scope: versioned per-model price table (pessimistic), unpriced refused; app-wide monthly meter (UTC+7) with
  no user data and a narrow RLS policy; reserve before the provider call, settle keeps the estimate unless the provider
  confirms no charge; a distinct cap error code in both mirrors. Out of scope: route wiring (F-706.4), admin spend view
  (F-706.5/.6), reconciliation, provider-console cap (M-42).
- `docs/ai-stylist-notes.md` §3 (advice): "atomically add a pessimistic per-model estimate and refuse unpriced models";
  "`SECURITY DEFINER` will not help because the app is the owner role under FORCE"; owner exemptions in the limiters
  "must not exempt the owner from the spend cap".

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Reservations count against the cap before the provider call, so parallel calls cannot pass $20 | `spend.db.test.ts` › "8 parallel reserves with room for exactly 3 → exactly 3 reserved, 5 cap_reached, spent ≤ cap"; › "reserve waits for the global advisory lock" (lock detection); › "a reservation that lands exactly on the cap is admitted; one micro-USD over is refused" |
| 2 | A failed call's estimated cost stays in the meter unless the provider confirms no charge | `spend.db.test.ts` › "settle(ok) and settle(provider_unavailable / provider_bad_response / request_timeout / unknown code) → charged, spent unchanged"; › "settle(not_sent / invalid_key / key_forbidden / model_unavailable / provider_rate_limited) → released, spent drops"; › "a reserved row never settled still counts days later"; › "second settle is noop; released after charged is impossible"; `spendPrices.test.ts` › "isConfirmedNoCharge table" |
| 3 | At the cap the meter refuses with a distinct error and no provider call is made | `spend.db.test.ts` › "at the cap reserve returns cap_reached and inserts no row" (the status is returned before any provider call can happen: reserve is the step before the call, F-706.4 wires it); `parity.test.ts` (unchanged) proves `ai_cap_reached` is in both mirrors with 503; `copy.test.ts` (unchanged loop) proves a Vietnamese message exists |
| 4 | A model with no price entry is refused | `spend.test.ts` › "unpriced model, unpriced kind and prototype keys return unpriced without touching the pool"; `spend.db.test.ts` › "unpriced inserts no row"; `spendPrices.test.ts` › "every AI_MODELS id is priced for photo_fill and suggest" |
| 5 | Owner exemptions (D38) do not exempt anyone from the cap | `spend.db.test.ts` › "at the cap, with TUDO_OWNER_SUB set to OWNER_A, reserve still returns cap_reached"; `spend.test.ts` › "reserve throws on any key besides provider/model/kind (e.g. owner, userId)"; › "spend.js and spendPrices.js never mention owner, ownerSub, TUDO_OWNER_SUB, rateLimit or inflight" |
| 6 | The new table has RLS and is covered by the RLS tests | `rls.db.test.ts` › catalog + `pg_policies` snapshot include `ai_spend_ops` and its three policies; › new describe "spend meter (F-706.2)"; `schema.db.test.ts` forced list; `migrator.db.test.ts` › "a later file that leaves ai_spend_ops unforced fails the guard" |
| 7 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test` (with the DB tests running against the test Postgres), `pnpm build` |

Extra behaviour the plan fixes (from D53 "months follow UTC+7" and the ticket's "UTC+7 month"), also in the
reviewer's table:

| # | Criterion | Test |
|---|---|---|
| 8 | The month is the UTC+7 month; a reservation stays in the month it was made in | `spend.db.test.ts` › "month boundary: 16:59:59Z vs 17:00:00Z on Nov 30 and Dec 31 (→ 2027-01)"; › "a November reservation settled in December still counts in November"; `spendPrices.test.ts` › "spendPeriod at the UTC+7 boundary" |
| 9 | Inert: nothing calls the meter yet | `spend.test.ts` › "inert: no non-test file imports spend.js; only spend.js imports spendPrices.js; only spend.js calls withSpendMeter" |

## Ming verification after merge
- Before the release that contains F-706.4 (the first one where the meter does anything): recheck every price in
  `server/ai/spendPrices.js` against the live Gemini and Anthropic pricing pages, and bump `PRICE_VERSION` if any value
  changes (feature list "Known limit"). Suggested Ming step for the orchestrator to add to `work/ming-todo.md`
  (this plan does not edit it): "M-xx: recheck F-706.2 prices on the live pricing pages before the F-706.4 release".
- Nothing else: the meter is inert until F-706.4.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `db/migrations/20261122140000_ai_spend_meter.sql` | New: table `ai_spend_ops`, index, RLS `ENABLE` + `FORCE`, three per-command policies, no delete policy, rollback comment | AC1, AC2, AC6 | **High** |
| `server/db.js` | Add `withSpendMeter(pool, fn, { readOnly })` (sets `tudo.maintenance = 'ai-spend'`, clears `app.user_id`) | narrow access path, AC6 | **High** |
| `server/migrator.js` | Add `SPEND_METER_VERSION = "20261122140000"` and `ai_spend_ops: SPEND_METER_VERSION` to `RLS_TABLES` | the runner's force guard covers the new table | **High** |
| `server/ai/spendPrices.js` | New, pure: `PRICE_VERSION`, `PRICES`, `KIND_CEILINGS`, `MONTHLY_CAP_MICRO_USD`, `estimateMicroUsd`, `NO_CHARGE_OUTCOMES`, `isConfirmedNoCharge`, `spendPeriod` | AC2, AC4, AC8 | **High** |
| `server/ai/spend.js` | New: `createSpendMeter(pool, { now })` → `{ reserve, settle, status }` | AC1–AC5 | **High** |
| `server/ai/catalog.js` | Add `ai_cap_reached: 503` to `AI_ERROR_STATUS` | ticket scope (server mirror) | **High** |
| `src/shared/ai/errors.ts` | Add `ai_cap_reached: 503` | ticket scope (client mirror) | no |
| `src/features/settings/copy.ts` | Add the `ai_cap_reached` Vietnamese string to `AI_ERRORS` | `Record<AiErrorCode, string>` fails typecheck otherwise (R6) | no |
| `server/ai/spendPrices.test.ts` | New unit tests | AC2, AC4, AC8 | **High** |
| `server/ai/spend.test.ts` | New unit/static tests (no DB) | AC4, AC5, AC9 | **High** |
| `server/ai/spend.db.test.ts` | New DB tests (real Postgres, NOSUPERUSER owner role) | AC1–AC5, AC8 | **High** |
| `server/db.test.ts` | Add `withSpendMeter` tests | helper contract | **High** |
| `server/rls.db.test.ts` | Add the new table to truncate/seed, no-GUC, catalog, `pg_policies` snapshot, maintenance isolation; new describe | AC6 | **High** |
| `server/migrator.db.test.ts` | Migration count 9 → 10; force-guard test for `ai_spend_ops` | AC6 | **High** |
| `server/schema.db.test.ts` | Add `ai_spend_ops` to the forced-table list | catalog test lists every table | **High** |
| `db/migrations/README.md` | "RLS rules": name `ai_spend_ops` as the second app-wide table (GUC policy), not part of backup | doc rule names the app-wide tables | **High** |
| `server/README.md` | Line 94: mention `ai_spend_ops` and `withSpendMeter` next to `credit_settings` | doc lists the non-`owner_only` tables | **High** |
| `docs/data-model.md` | One sentence on `ai_spend_ops` after the credit ledger sentence | data model doc | no |

No route, no `server/app.js`, no `src/data/photoImport.ts` (`AI_BATCH_OFF`) change: those are F-706.4.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `spendPrices.test.ts` › every `AI_MODELS` id (both providers) has a price entry and `estimateMicroUsd` returns a positive integer for `photo_fill` and `suggest` | AC4 (catalog cannot drift from the price table) |
| `spendPrices.test.ts` › `estimateMicroUsd` equals `ceil(in·inPrice/1e6) + ceil(out·outPrice/1e6)` for a fixture entry and always returns an integer ≥ 1 | integer micro-USD, rounds up |
| `spendPrices.test.ts` › unknown provider/model, `constructor`/`toString`/`__proto__` as model, `sticker` on a text-only entry → `null` | AC4, prototype keys |
| `spendPrices.test.ts` › an image entry (`{ microUsdPerImage }` fixture via an injected table) prices `sticker` and returns `null` for text kinds | future image prices shape |
| `spendPrices.test.ts` › `KIND_CEILINGS.*.outputTokens` ≥ Gemini `MAX_OUTPUT_TOKENS` + the largest `GEMINI_THINKING` budget, and ≥ Claude `max_tokens` (read from `gemini.js` / `claude.js` source with a regex, like `credits.test.ts` reads the migration) | pessimism tracks the adapter caps |
| `spendPrices.test.ts` › `KIND_CEILINGS.suggest.inputTokens` ≥ UTF-8 bytes of `buildSuggestPrompt` with 40 worst-case candidates (60-char `đ` names and materials, all colors and seasons) + `JSON.stringify(buildSuggestSchema(aliases))` + 1000; `photo_fill.inputTokens` ≥ `IMAGE_TOKENS_MAX` + bytes of `TAG_INSTRUCTION`/`GEMINI_TAG_INSTRUCTION` (larger) + tag schema JSON + 1000 | pessimism tracks the prompt builders (bytes ≥ tokens for byte-level tokenizers) |
| `spendPrices.test.ts` › `isConfirmedNoCharge`: true for `not_sent`, `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`; false for `ok`, `provider_unavailable`, `provider_bad_response`, `request_timeout`, `internal`, `""`, `"toString"`, non-strings | AC2 |
| `spendPrices.test.ts` › `spendPeriod`: `2026-11-30T16:59:59.999Z` → `2026-11`, `2026-11-30T17:00:00Z` → `2026-12`, `2026-12-31T17:00:00Z` → `2027-01` | AC8 |
| `spendPrices.test.ts` › `PRICE_VERSION` matches `YYYY-MM-DD`; `MONTHLY_CAP_MICRO_USD === 20_000_000`; `PRICES` and its entries are frozen | versioning, cap constant |
| `spend.test.ts` › reserve throws on a non-object, a non-string provider/model, an unknown kind, or any extra key (`owner`, `userId`) before touching the pool | AC5, programmer errors |
| `spend.test.ts` › reserve of an unpriced model / prototype-key model returns `{ status: "unpriced" }` without touching the pool | AC4 |
| `spend.test.ts` › settle throws on a non-UUID spendId or a non-string outcome before touching the pool | contract |
| `spend.test.ts` › migration `kind` check lists exactly `Object.keys(KIND_CEILINGS)` | migration and code agree |
| `spend.test.ts` › static: `spend.js` and `spendPrices.js` never match `/owner|TUDO_OWNER_SUB|rateLimit|inflight/i` | AC5 |
| `spend.test.ts` › inert: no non-test file under `server/` or `src/` imports `spend.js`; only `spend.js` imports `spendPrices.js`; only `spend.js` (and `db.js`, the definition) mention `withSpendMeter` | AC9, trust boundary |
| `spend.test.ts` › `backup.js` never mentions `ai_spend` | not part of backup |
| `spend.db.test.ts` › reserve inserts one `reserved` row with period, provider, model, kind, `PRICE_VERSION` and the table estimate; returns `spendId` and `estimateMicroUsd` | AC1 |
| `spend.db.test.ts` › 8 parallel reserves (pool max 5) with room for exactly 3 estimates (admin preloads a `charged` row of `cap − 3·est`) → exactly 3 `reserved`, 5 `cap_reached`, `sum(estimate) where state <> 'released'` ≤ cap | AC1 |
| `spend.db.test.ts` › reserve waits for the global advisory lock: an admin connection holds `pg_advisory_xact_lock(hashtextextended('ai-spend', 0))`; reserve has not settled after 300 ms; after the holder commits it returns `reserved`. `settle` of an existing reserved row is not blocked by the held lock | AC1 lock detection |
| `spend.db.test.ts` › remaining exactly `est` → reserved (spent = cap); remaining `est − 1` → `cap_reached` with `spentMicroUsd`/`capMicroUsd`, no row inserted | AC1, AC3 |
| `spend.db.test.ts` › at the cap reserve returns `cap_reached` and inserts no row | AC3 |
| `spend.db.test.ts` › at the cap, with `vi.stubEnv("TUDO_OWNER_SUB", OWNER_A)`, reserve still returns `cap_reached` (the meter has no identity input) | AC5 |
| `spend.db.test.ts` › settle(`ok`) → `charged`, `settled_at` set, spent unchanged; settle(`provider_unavailable`), (`provider_bad_response`), (`request_timeout`), (`something_new`) → `charged` | AC2 |
| `spend.db.test.ts` › settle(`not_sent`), (`invalid_key`), (`key_forbidden`), (`model_unavailable`), (`provider_rate_limited`) → `released`, spent drops by the estimate, the freed room can be reserved again | AC2 |
| `spend.db.test.ts` › a second settle returns `{ status: "noop", state }`; settle after `charged` with a no-charge outcome stays `charged`; unknown id → `not_found` | AC2, idempotent settle |
| `spend.db.test.ts` › a `reserved` row never settled still counts after the clock moves 30 days inside the same month and is never expired | pessimistic, no TTL |
| `spend.db.test.ts` › month boundary: preload Nov at the cap; reserve at `2026-11-30T16:59:59Z` → `cap_reached`; at `2026-11-30T17:00:00Z` → `reserved` with period `2026-12`; status in Dec shows only Dec | AC8 |
| `spend.db.test.ts` › a reservation made in Nov and settled (charged) in Dec keeps period `2026-11` and does not count in Dec | AC8 |
| `spend.db.test.ts` › unpriced model inserts no row | AC4 |
| `spend.db.test.ts` › `status()` returns `{ period, capMicroUsd, spentMicroUsd, remainingMicroUsd, priceVersion }` with reserved + charged counted, released not, `remaining` never below 0; runs read-only | F-706.4/.5 need it |
| `spend.db.test.ts` › lock wait past `statement_timeout`: a meter built on a pool with `statement_timeout: 300` rejects with SQLSTATE `57014` while an admin holds the lock, and no row is inserted (fails closed) | pool limits |
| `db.test.ts` › `withSpendMeter` begins read-write (`begin`), sets `select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)` with `['ai-spend']`, commits; `{ readOnly: true }` begins read only | helper contract |
| `db.test.ts` › nested `withSpendMeter` inside `withUser` (and vice versa) throws "nested transaction" without a second connect | no nested locks |
| `db.test.ts` › `withMaintenance(pool, "ai-spend", …)` throws "unknown maintenance task" | the read-only sweep path cannot reach the meter |
| `rls.db.test.ts` › no GUC: `ai_spend_ops` reads 0 rows | AC6 |
| `rls.db.test.ts` › `withUser(A)`: select 0 rows; insert → 42501; update and delete touch 0 rows; admin still sees the seeded row | AC6 |
| `rls.db.test.ts` › `withMaintenance("photo-sweep")`: `ai_spend_ops` 0 rows (added to the existing "nothing else" loop) | AC6 |
| `rls.db.test.ts` › `withSpendMeter`: reads the row; inserts a `reserved` row; inserting a `charged` row → 42501; updates `reserved → charged`; updating a `charged` row back to `reserved` touches 0 rows; delete touches 0 rows; `items`, `credit_ops`, `credit_settings`… : user tables read 0 rows | AC6, settled states final, no delete |
| `rls.db.test.ts` › any other `tudo.maintenance` value (e.g. `photo-sweep`, `other`) reads 0 `ai_spend_ops` rows and cannot insert | AC6 |
| `migrator.db.test.ts` › a later file that leaves `ai_spend_ops` unforced fails the guard and rolls back | AC6 |

## Approach
1. **Migration** `db/migrations/20261122140000_ai_spend_meter.sql` (version must stay newer than every migration on
   `main` at merge time; re-stamp if another migration lands first, as F-706.1's handoff notes). No `begin`/`commit`.
   Header comment: F-706.2 / D53; one row per paid call; spent = `sum(estimate_micro_usd) where period = P and state
   <> 'released'` (computed, never stored, R5); no user data; expand-only (an older image never reads it); not part of
   backup and restore; the module using it (`server/ai/spend.js`) is not wired to a route until F-706.4; manual
   rollback (never automatic): `drop table ai_spend_ops;` (policies and index go with it).
   ```sql
   create table ai_spend_ops (
     id uuid primary key default gen_random_uuid(),
     period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
     provider text not null check (provider ~ '^[a-z][a-z0-9-]{0,31}$'),
     model text not null check (length(model) between 1 and 100),
     kind text not null check (kind in ('photo_fill', 'suggest', 'sticker')),
     price_version text not null check (price_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
     estimate_micro_usd bigint not null check (estimate_micro_usd between 1 and 20000000),
     state text not null check (state in ('reserved', 'charged', 'released')),
     created_at timestamptz not null default now(),
     settled_at timestamptz,
     constraint ai_spend_ops_settled check ((state = 'reserved') = (settled_at is null))
   );
   create index ai_spend_ops_period on ai_spend_ops (period);
   alter table ai_spend_ops enable row level security;
   alter table ai_spend_ops force row level security;
   create policy ai_spend_read on ai_spend_ops for select
     using (current_setting('tudo.maintenance', true) = 'ai-spend');
   create policy ai_spend_reserve on ai_spend_ops for insert
     with check (current_setting('tudo.maintenance', true) = 'ai-spend' and state = 'reserved');
   create policy ai_spend_settle on ai_spend_ops for update
     using (current_setting('tudo.maintenance', true) = 'ai-spend' and state = 'reserved')
     with check (current_setting('tudo.maintenance', true) = 'ai-spend' and state in ('charged', 'released'));
   -- no delete policy: spend history cannot be deleted through the app.
   ```
   Provider is a pattern, not `in ('claude','gemini')`, so an image provider picked by F-705 needs a price entry, not
   a migration; the code-side price table is the gate. `kind` mirrors `CREDIT_PRICES`' keys.
2. **`server/migrator.js`**: `const SPEND_METER_VERSION = "20261122140000";` and `ai_spend_ops: SPEND_METER_VERSION`
   in `RLS_TABLES` (the per-table version map F-706.1 introduced).
3. **`server/db.js`**: add next to `withMaintenance`:
   ```js
   /** Read-write transaction for the app-wide AI spend meter (F-706.2): policies ai_spend_*. Only server/ai/spend.js calls it. */
   export async function withSpendMeter(pool, fn, { readOnly = false } = {}) {
     return inTx(pool, ["select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)", "ai-spend"], readOnly, fn);
   }
   ```
   `withUser` already clears `tudo.maintenance` and `withMaintenance`'s allow-list stays `["photo-sweep"]` (read-only),
   so neither can reach the meter, and the meter transaction sees no user rows (`app.user_id = ''` →
   `app_user_id()` null → `owner_only` false; `photo_sweep_read` needs `'photo-sweep'`). `withUser` and
   `withMaintenance` are not changed. Note: `app_user_id()` on `''` must return null, not raise; F-706.1's
   `withMaintenance` already relies on this (verified by the existing maintenance RLS test), and the new RLS test
   reads `items`/`credit_ops` inside `withSpendMeter` to prove it.
4. **`server/ai/spendPrices.js`** (pure, `// @ts-check`, no I/O; imports only `vnToday` from `../validate.js`):
   - `PRICE_VERSION = "2026-11-22"`.
   - `MONTHLY_CAP_MICRO_USD = 20_000_000` (D53 $20; a code constant, separate from the price table so a price bump
     never touches the cap).
   - `IMAGE_TOKENS_MAX = 10_000` with a comment: worst-case input tokens for one photo under `MAX_BYTES` (2 MiB, any
     dimensions): Gemini 2.5 bills 258 tokens per 768×768 tile, Claude about w·h/750 after its own downscale; the
     client resizes to 1200 px but the server must not trust it.
   - `KIND_CEILINGS = Object.freeze({ photo_fill: { inputTokens: 16_000, outputTokens: 2_176 }, suggest: {
     inputTokens: 32_000, outputTokens: 2_176 }, sticker: null })` with comments: output = Gemini `MAX_OUTPUT_TOKENS`
     2048 + largest thinking budget 128 (Claude `max_tokens` 1024 is below it); suggest input ≥ the UTF-8 bytes of the
     largest prompt + schema (40 candidates today, 20 after F-707.2). The tests in "Tests to write" pin these to the
     adapter and prompt-builder limits; if a test shows a ceiling too low, raise the constant (never lower the check).
     `sticker: null` means "priced per image only".
   - `PRICES`: frozen map keyed `"<provider>:<model>"`, amounts in **integer micro-USD per million tokens** (text) or
     **integer micro-USD per image** (image models), never floats:
     | Key | `inMicroUsdPerMTok` | `outMicroUsdPerMTok` | Source (snapshot, recheck before F-706.4 ships) |
     |---|---|---|---|
     | `gemini:gemini-2.5-flash` | 300_000 | 2_500_000 | Gemini API pricing, paid tier, text/image input |
     | `gemini:gemini-2.5-flash-lite` | 100_000 | 400_000 | same |
     | `gemini:gemini-2.5-pro` | 1_250_000 | 10_000_000 | same, ≤ 200k-token prompt tier (ceilings are far below) |
     | `claude:claude-haiku-5-5` | 100_000 | 500_000 | Anthropic pricing, ≤ 100k-token prompt tier |
     | `claude:claude-sonnet-5-5` | 2_000_000 | 10_000_000 | Anthropic pricing |
     | `claude:claude-opus-5-5` | 4_000_000 | 20_000_000 | Anthropic pricing |
     Thinking tokens are billed as output and are inside the output ceiling. Image models (F-705/F-708) add entries of
     the shape `{ microUsdPerImage, inMicroUsdPerMTok? }` and are priced only for `sticker`; none is added here (no
     image model is chosen yet), so a sticker reservation is `unpriced` until F-708 adds one.
   - `estimateMicroUsd(provider, model, kind, table = PRICES) → number | null`: `null` when the entry is missing
     (`Object.hasOwn` on the key, so `constructor` etc. are unpriced) or the entry has no price for that kind. Text:
     `ceil(in·inPrice / 1e6) + ceil(out·outPrice / 1e6)` with integers only (max product 32_000 × 20_000_000 < 2^53).
     Image: `microUsdPerImage` (+ the input part if present). The optional `table` parameter is for the image-shape
     unit test only.
   - `NO_CHARGE_OUTCOMES = Object.freeze(["not_sent", "invalid_key", "key_forbidden", "model_unavailable",
     "provider_rate_limited"])` and `isConfirmedNoCharge(outcome)`. Reason in a comment: these four codes come only
     from an HTTP error status before any generation (`providerErrors.js`: 401/403/404/429, and Gemini 400 with an
     allowlisted key reason); `not_sent` = the request never left the server. Everything else, including
     `provider_unavailable` (5xx, timeouts, aborts, network), `provider_bad_response` (a billed 200),
     `request_timeout` and any unknown string, keeps the estimate.
   - `spendPeriod(nowMs) = vnToday(nowMs).slice(0, 7)` (UTC+7, no DST). Not imported from `creditMath.js`, so
     `credits.test.ts`' "only credits.js imports creditMath.js" stays true.
5. **`server/ai/spend.js`** (`// @ts-check`; imports `withSpendMeter` from `../db.js` and `spendPrices.js` only; header
   comment like `credits.js`: one short transaction per call, no I/O inside, statuses returned not thrown, programmer
   errors throw before the pool, no identity input and no owner path (D53), never nested inside a credit transaction):
   ```
   createSpendMeter(pool, { now = Date.now } = {}) → {
     reserve({ provider, model, kind })
       → { status: "reserved", spendId, estimateMicroUsd, period }
       | { status: "cap_reached", spentMicroUsd, capMicroUsd, period }
       | { status: "unpriced" }
     settle(spendId, outcome)          // outcome: "ok" | "not_sent" | an AI error code
       → { status: "charged" } | { status: "released" } | { status: "noop", state } | { status: "not_found" }
     status()
       → { period, capMicroUsd, spentMicroUsd, remainingMicroUsd, priceVersion }
   }
   ```
   - `reserve`: throw if the argument is not a plain object, has keys other than `provider`/`model`/`kind`, provider or
     model is not a string, or `kind` is not an own key of `KIND_CEILINGS`. Compute `estimateMicroUsd`; `null` →
     `{ status: "unpriced" }` before the pool. Otherwise one `withSpendMeter` transaction:
     1. `select pg_advisory_xact_lock(hashtextextended('ai-spend', 0))`;
     2. `select coalesce(sum(estimate_micro_usd), 0)::bigint::text as spent from ai_spend_ops where period = $1 and
        state <> 'released'` → `Number(spent)`;
     3. if `spent + est > MONTHLY_CAP_MICRO_USD` → `cap_reached` (no insert); else `insert … values ($period,
        $provider, $model, $kind, PRICE_VERSION, $est, 'reserved') returning id`.
     `period = spendPeriod(now())`, computed in JS (one clock, injectable in tests). The lock is needed because
     sum-then-insert is not safe under READ COMMITTED; it is one global key, held for one indexed sum and one insert.
   - `settle`: throw on a non-UUID `spendId` (`toUserId`-style canonical check from `../user.js` or an equivalent
     UUID regex) or a non-string outcome. `state = isConfirmedNoCharge(outcome) ? "released" : "charged"`. One
     `withSpendMeter` transaction, **no advisory lock** (charging leaves the sum unchanged; releasing only lowers it,
     and a concurrent reserve that reads the old sum is merely more pessimistic): `update ai_spend_ops set state =
     $2, settled_at = $3 where id = $1 and state = 'reserved' returning state`; if no row, `select state … where id =
     $1` → `noop` with the state, or `not_found`. The row keeps its original `period`.
   - `status`: `withSpendMeter(…, { readOnly: true })`, same sum for the current period, `remaining = max(cap −
     spent, 0)`.
   - Reservations never expire (no TTL, unlike `RESERVATION_TTL_MS` in credits): a stalled or crashed call may still
     be billed, so its estimate stays counted (D53 pessimistic). Reconciliation stays manual (Ming).
   - Lock wait counts toward the pool's 5 s `statement_timeout`; a timeout rejects (SQLSTATE 57014) and F-706.4 must
     treat any rejection as "no provider call" (fail closed).
6. **Error code**: add `ai_cap_reached: 503` to `server/ai/catalog.js` and `src/shared/ai/errors.ts` (same position,
   after `ai_busy`); add to `AI_ERRORS` in `src/features/settings/copy.ts`: `ai_cap_reached: "AI đang tạm tắt đến hết
   tháng này, các chức năng khác vẫn dùng bình thường"`. `OUTFITS_COPY.ai.note` already falls back to "AI không khả
   dụng, đang dùng gợi ý thường." (no change). No producer yet; F-706.4 maps `cap_reached` → `ai_cap_reached` and adds
   it to `AI_BATCH_OFF` in the same diff that starts producing it; F-706.7 may refine the copy.
7. **Docs**: `db/migrations/README.md` "RLS rules" — app-wide tables are `credit_settings` (select-only) and
   `ai_spend_ops` (policies keyed on `tudo.maintenance = 'ai-spend'`, reached only through `withSpendMeter`, no
   delete policy); neither the credit tables nor `ai_spend_ops` are part of backup and restore. Same facts in one
   clause of `server/README.md:94` and one sentence in `docs/data-model.md`.
8. Run all checks; DB tests run against the local test Postgres (`server/test/pg.ts`).

Rules: R2/D32 (new migration, RLS in the same file, never edit an applied one); R3 (nothing reaches the browser; the
new client change is an error code and copy only); R5 spirit (spent is computed from rows, never stored); R6 (copy in
`copy.ts`); R7 (no route wiring, no `AI_BATCH_OFF`); R8 (pure logic in `spendPrices.js` with unit tests). Supabase
types (`src/types/database.ts`) are not regenerated: the app is on self-hosted Postgres and the client never reads
this table.

## Specialist input used
Both consults agree on the shape: one row per call (`ai_spend_ops`), no counter row, no `user_id`, a global
transaction-scoped advisory lock, integer micro-USD, `price_version` per row, period from JS, reservations never
expire, per-command RLS with no delete policy, a separate user-less write helper, inert tests, code-side price table.
Adopted. Differences reconciled:

| Topic | database-optimizer | software-architect | Choice and reason |
|---|---|---|---|
| Helper and GUC | `withService(pool, task)` + new GUC `tudo.service` (and clear it in `withUser`/`withMaintenance`) | `withSpendMeter(pool, fn)` + `tudo.maintenance = 'ai-spend'` | **`withSpendMeter` on `tudo.maintenance`.** `withUser` already clears that GUC and `withMaintenance` only accepts `photo-sweep` read-only, so the values are mutually exclusive with no change to either helper or their exact-SQL tests. A fixed-purpose helper with no task parameter cannot be reused by F-706.5's admin path (the DB consult's own concern about overlapping trust models); F-706.5 can call `meter.status()` after its owner check. Cost: the GUC name says "maintenance" for a hot path; recorded in the helper's comment. |
| State names | `committed` | `charged` | **`charged`**: different vocabulary from the credit ledger's `committed`/`refunded`, so F-706.4 code that settles both ledgers in sequence cannot mix them up; "charged" says what the row means. |
| Settle API | `commitSpend(id)` / `releaseSpend(id)`, the caller decides | `settle` / `release` + `isConfirmedNoCharge(code)` | **One `settle(spendId, outcome)`** that applies `isConfirmedNoCharge` itself. The ticket says "settle keeps the estimate unless the provider confirms no charge"; putting the rule in the meter makes AC2 testable here and leaves F-706.4 no way to release a maybe-billed call. Unknown outcomes charge (fail safe). |
| Settle locking | lock only on reserve | lock on reserve and settle | **Reserve only**; settle cannot raise the sum (argument in Approach 5). Fewer waits on the 5-connection pool. |
| Prices file | `server/ai/prices.js` | `server/ai/spendPrices.js` | **`spendPrices.js`**: "prices" is ambiguous in a wardrobe app whose items have purchase prices, and the file also holds the cap, ceilings and no-charge rule. |
| Cap | code constant (env or admin later) | code constant inside `PRICE_TABLE` | **Code constant `MONTHLY_CAP_MICRO_USD`, outside the price table**, so a price bump never touches the cap. D53 makes only the grant numbers admin-editable. |
| Unpriced | status `unpriced` | status `unpriced`, F-706.4 maps it to `server_misconfigured` | **Status `unpriced`; F-706.4 maps it to the existing `server_misconfigured` (503)**: it is a deploy error the user cannot fix (the unit test makes it unreachable for catalog models), and `server_misconfigured` is already in `AI_BATCH_OFF`. No new code. |
| Cap error code | `ai_budget_exhausted`, 503 or 429 | `ai_spend_cap`, 503 | **`ai_cap_reached`, 503, no `Retry-After`**: matches the ticket/F-706.4/F-706.7 wording ("cap reached", "AI off (cap reached)"); 503 because the service is off until next month, while 429 means "slow down" and is already used for limiter codes. |
| Who adds the code | F-706.2 adds to both mirrors | F-706.2 adds to mirrors + `copy.ts`; F-706.4 adds `AI_BATCH_OFF` | **F-706.2: both mirrors + `copy.ts`** (ticket scope; `copy.ts` is forced by typecheck). `AI_BATCH_OFF` and route mapping stay in F-706.4 (R7). |
| Reserve signature | `({provider, model, kind})`, meter computes | same | **`reserve({ provider, model, kind })`** instead of the ticket's `reserveSpend(model, estimate)`: a caller-supplied estimate (0, NaN, too low) defeats the cap, and a model id alone is ambiguous across providers. Extra keys throw, so no `owner` flag can ever be passed. The intent (reserve atomically before the call) is unchanged. |
| No-charge list | never sent, or 400/401/403/429 | `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited` | **`not_sent` + those four codes.** They are exactly what `providerErrors.js` returns for a pre-generation HTTP error; a Gemini 400 with an unknown reason maps to `provider_unavailable` and is charged (safe). |
| Models priced | every default; test on `isDefault` | Gemini only or all (question) | **All six `AI_MODELS` entries**, with a test that every catalog id is priced: any of them can be stored in `ai_settings` today, D52 allows a second provider, and an unpriced catalog model would silently disable AI. |
| Period helper | `vnMonth` from `creditMath.js` | `vnToday` from `validate.js` | **`spendPeriod` in `spendPrices.js` on `vnToday`**, so F-706.1's import test stays untouched. |
| Estimate cap in DB | `between 1 and 5000000` | `> 0` | **`between 1 and 20000000`** (≤ the cap), so tests can preload "spent so far" as one row and a future image price fits. |
| Provider check | `in ('claude','gemini')` | same | **Pattern check**: an image provider from F-705 then needs only a price entry; the price table is the gate. |
| `status()` / `byModel` | — | `status()`, optional `byModel` | **`status()` only** (small, needed by tests, F-706.4's AI-off flag and F-706.5). `byModel` is F-706.5's call. |
| Timeout test | lock held past a short timeout | — | **Adopted** with a dedicated short-timeout pool. |

Also adopted: the F-706.4 ordering and refund note (follow-ups), F-706.5 dependency note, hotspot warnings.

## Assumptions
- **A1 Cap as a code constant** (`MONTHLY_CAP_MICRO_USD = 20_000_000`). Changing it is a reviewed PR. Not an env
  variable or admin setting (D53 makes only grant numbers editable). Ming can ask for a setting later.
- **A2 Prices are search/skill snapshots** (Gemini from public pricing as known on 2026-11-22; Claude from the
  Anthropic pricing table cached 2026-11-03). Ming rechecks them on the live pages before the F-706.4 release; Ming
  step suggested above.
- **A3 Error code `ai_cap_reached`, HTTP 503, no `Retry-After`**; Vietnamese text as in Approach 6 (F-706.7 may
  refine it).
- **A4 "Provider confirmed no charge"** = `not_sent`, `invalid_key`, `key_forbidden`, `model_unavailable`,
  `provider_rate_limited`. A 429 that is somehow billed under-counts slightly; a timeout that was not billed
  over-counts (safe).
- **A5 All six catalog models are priced**; image models stay unpriced until F-705/F-708 add an entry.
- **A6 Token ceilings** (`photo_fill` 16k in / 2,176 out; `suggest` 32k in / 2,176 out; image 10k) are deliberately
  pessimistic. At current snapshot prices the default `gemini-2.5-flash` costs about $0.0102 per photo fill and
  $0.0150 per suggestion (≈ 1,300–1,950 calls per $20); `claude-opus-5-5` about $0.11 / $0.17. The meter may turn AI
  off before real spend reaches $20; D53 accepts this.
- **A7 Unpriced → `server_misconfigured`** at the route (F-706.4), no new code.
- **A8 Reusing the `tudo.maintenance` GUC** with value `ai-spend` is acceptable (Specialist input). Any server code
  that calls `withSpendMeter` can reserve/settle; the inert test keeps `spend.js` its only caller. Column values other
  than `state`/`settled_at` are not immutable at the DB level on settle (owner role); only `spend.js` writes them.
- **A9 Linkability**: rows carry `created_at`, `model` and `kind` and no user id; the owner (admin) could correlate
  them with `credit_ops` timestamps. Accepted: the admin is the owner.
- **A10 Hotspots** with F-706.1 (PR #102, `DONE`) and later F-706.3 / F-707.3 / F-708.1: `server/migrator.js`
  `RLS_TABLES`, `server/rls.db.test.ts` (truncate, catalog, policy snapshot), `server/migrator.db.test.ts` (migration
  count), `server/schema.db.test.ts`, `db/migrations/README.md`, `server/README.md`, `docs/data-model.md`, and the
  migration version order. Implementation starts after PR #102 merges, so these are rebased once. If another migration
  lands on `main` first, re-stamp `20261122140000` to a newer version and update `SPEND_METER_VERSION`.
- **A11 Size**: ~280 lines of product code and docs plus ~400 lines of tests. Larger than the ~400-line guide only
  because of tests; one implement/review cycle, no split.
- **A12** The ticket's `reserveSpend(model, estimate)` wording is satisfied by `meter.reserve({ provider, model, kind
  })` (Specialist input, "Reserve signature").

## Follow-ups (not in this diff)
- **F-706.4** (ordering, never nested transactions): (1) credit reserve; (2) spend `reserve`; (3) provider call;
  (4) spend `settle(spendId, outcome)`, then credit commit (success) or refund (failure). If step 2 returns
  `cap_reached` → refund the credit op, answer `ai_cap_reached`, no provider call; `unpriced` → refund, answer
  `server_misconfigured`; a rejection (timeout, DB error) → refund, no provider call. Pass `not_sent` when the request
  never left the server after a reservation. Map `cap_reached` → `ai_cap_reached` and add it to `AI_BATCH_OFF` in the
  same diff. Scope line "new error codes (… cap reached …)" should read "map the cap code added by F-706.2". Keep
  `spendId` with the op (memory or replay store) for settle. The `aiOff` flag for `GET /api/credits` can come from
  `status().remainingMicroUsd` < the estimate of the active model's cheapest kind.
- **F-706.5** should list `Depends on: F-706.1, F-706.2` (it reads spend); its spend view calls `meter.status()` after
  the owner check (no admin policy on `ai_spend_ops` needed unless it wants a per-model breakdown).
- **Ming step**: recheck prices before the F-706.4 release (see Ming verification).
- Optional later: lower estimates to actual usage once the adapters return usage (they discard it today,
  `gemini.js:147`, `claude.js:79`).

## Blocking questions
None. (Ming confirms A1–A8 at the plan gate; each has a default above.)

## Split proposal
None.
