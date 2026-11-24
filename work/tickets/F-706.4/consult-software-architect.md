# Consult — software-architect — F-706.4

Consult report for F-706.4 (cutting AI over to the shared key, credits and spend cap). Software Architect, read-only.

I could not run git, so I did not read the plan on `ticket/F-706.7`. Everything below about the credits contract comes from the summary in the ticket's "Notes / answers from Ming". The planner should compare it with `git show origin/ticket/F-706.7:work/tickets/F-706.7/plan.md` before freezing the plan.

## Findings

1. **Stored results cannot be replayed today (AC3 is not reachable without a migration).** `credit_ops` (`db/migrations/20261122120000_credit_ledger.sql:40-56`) has no column for a result or a request fingerprint. `credits.js` `reserve` returns `replay` with the op only, and `commit` cannot store anything. So F-706.4 needs a new migration (High tier, plan gate already set).

2. **The spend meter has no idempotency key.** `ai_spend_ops` and `spend.reserve({provider, model, kind})` carry no op key. All idempotency has to come from the credit op: a replay must never call `spend.reserve`.

3. **Spend reservations never expire.** `spend.js` counts every row with `state <> 'released'`. If the process crashes between `spend.reserve` and `settle`, that estimate stays in the cap forever. Credit ops do expire (10 min TTL). This is conservative and in line with D53, but should be documented and reconciled monthly.

4. **There is no method to open the shared key for use.** `server/ai/appKeys.js` has `list/put/delete/test`. Only `test()` decrypts, and it throws the plaintext away. The cutover needs a new server-internal method, e.g. `appKeys.open(provider)` returning `{ok, key} | {ok:false, status, code}`.

5. **Three inertness tests will fail on purpose and must be inverted, not deleted blindly.** They are `credits.test.ts:48`, `spend.test.ts:106` and `appKeys.test.ts:61`. `appKeys.test.ts:61` bans `appKeys` and `openAppKey` in `tagPhoto.js`, `suggestOutfits.js` and `outfitSuggest.js`. The `loadSettingsKey` tests in `routes.test.ts:690-752` also go.

6. **`/api/ai-settings/test` (`routes.js:65-97`) is a fourth BYOK decrypt path.** It calls `loadSettingsKey`, so AC2 needs it changed too. `PUT /api/ai-settings` still seals new BYOK keys (`routes.js:143-148`). That is not a decrypt, but it keeps creating ciphertext that F-706.8 will later have to delete.

7. **Error codes.** `ai_cap_reached: 503` already exists in both mirrors but is missing from `AI_BATCH_OFF` (`src/data/photoImport.ts:36-48`). Adding `credits_exhausted` and `welcome_pending` (402) to `src/shared/ai/errors.ts` and `server/ai/catalog.js` also triggers `src/features/settings/copy.test.ts:7-12`. That test needs a Vietnamese `AI_ERRORS` entry for every code, so the copy has to land in this ticket even though the credit UI belongs to F-706.7.

8. **Bulk import already behaves as AC5 asks once the codes are in `AI_BATCH_OFF`.** `runPhotoImport` (`photoImport.ts:195-209`) sets `aiOff`. Later files are still saved, marked `ai:"off"`, and the tab shows `AI.stoppedOther(aiErrorText(code))`. AI errors never reach `photoStopFor`, so a 503 for the cap does not stop the photo uploads.

9. **Welcome for existing accounts is only right as of the day the F-706.1 migration was applied.** The backfill runs once (`credit_ledger.sql:66-74`). Anyone who created data after that and before the cutover deploy has no welcome row. The first ledger call (`ensureGrants`) would then give them a pending one, and they would read `welcome: "pending"`, which breaks Ming's requirement.

10. **A pending user still gets the 60 monthly credits.** `ensureGrants` creates the monthly grant already approved (`credits.js:55`). So `welcome_pending` only shows once the monthly credits are used up. This matches F-706.1 and D53 ("gates only the welcome grant"), but every open-join account can spend about 60 credits a month without approval.

11. **Shared provider and model.** D52 says Gemini for text by default. `spendPrices.js` prices `gemini:gemini-2.5-flash`. The user's own `ai_settings.provider/model` stops mattering after the cutover.

12. **Pool load goes from 1 to about 5 short transactions per paid call** (key read, credit reserve, spend reserve, spend settle, credit commit). In-flight AI calls are capped at 2 tag + 2 suggest (`app.js:77-79`) and the pool has 5 connections, so this is fine as long as no transaction stays open across the provider call (`ai-stylist-notes.md:60`).

## Recommendations

**R-A. Call-site cutover (AC1, AC2)**
- Add a fixed shared config, e.g. `server/ai/shared.js` exporting `{ provider: "gemini", model: defaultModelOf("gemini") }` (D52).
- Add `appKeys.open(provider)`.
- In `tagPhoto.js` and `suggestOutfits.js`, replace `loadSettingsKey` with `ai.appKeys.open(SHARED.provider)`. A missing key answers `not_configured` 409 and a bad one `key_unreadable` 409; both are already in `AI_BATCH_OFF`.
- Delete `loadSettingsKey`.
- Remove the `/api/ai-settings/test` route match in `api.js`, so it answers a generic 404. The owner tests the shared key through the admin route from F-706.3.
- Keep `GET /api/ai-settings` and `DELETE /api/ai-settings/key` unchanged. Neither decrypts. Keep a route test that DELETE clears the user's own key (AC6).
- Replace the three inertness tests with structural tests:
  - (a) no non-test file outside `crypto.js` mentions `openStoredKey` or `openKey`;
  - (b) nothing calls `store.getSecret`;
  - (c) `tagPhoto.js` and `suggestOutfits.js` do use `appKeys.open`.
- Add a route test with a key store spy: BYOK ciphertext is present and `getSecret` is never called.

**R-B. Migration (High; one new file, nothing applied is edited)**
- Add `credit_ops.request_hash text` and `credit_ops.result jsonb`, plus `credit_ops.error_code text`. All nullable, and it only adds columns, so the existing RLS policy still covers them and `rls.db.test.ts` needs no new-table exception.
- Rerun the welcome backfill: approved, `on conflict do nothing`. Use the same no-force/force pattern and `tudo.owner_sub` as `credit_ledger.sql:60-80`. The migrator runs at deploy, so "existing" means "at the cutover release", which is what Ming asked for.
- Update `docs/data-model.md`, the migration README note, and add a rollback comment.

**R-C. Ledger changes (`credits.js`)**
- `reserve(userId, opKey, kind, requestHash)` stores the hash.
- `commit(userId, opKey, result)` writes `result` in the same UPDATE that sets `committed`. If the commit and the result were written separately, a crash in between would leave a charged op with nothing to replay.
- `refund(userId, opKey, errorCode)` stores the failure code.
- A replay returns the op's `request_hash`, `result` and `error_code`.

**R-D. Order of each paid call** (photo fill and suggest the same way; "no I/O in a transaction" holds throughout)
1. In-flight slot, then rate limiter.
2. Parse the `Idempotency-Key` header and check it with `isValidOpKey`. Use a header, not a body field: tag-photo has a raw JPEG body, and `parseSuggestBody` requires exact keys.
3. Open the shared key. If it fails, answer with no charge.
4. Suggest only: load the candidates. Fewer than 2 rows means 200 `[]` at price 0, before any reserve (as today, `suggestOutfits.js:64-68`).
5. `credits.reserve`:
   - `insufficient` → 402 `credits_exhausted`. For tag-photo use `rejectUnread`, so a bulk import out of credits never uploads 2 MB.
   - `welcome_pending` → 402 `welcome_pending`.
   - `op_key_mismatch` → 400 `bad_request`.
   - `replay` → step 9.
6. Read and validate the body. Compute `requestHash` (sha256 of the JPEG bytes, or of the canonical parsed suggest body). If the body fails, refund and answer as today.
7. `spend.reserve({provider, model, kind})`:
   - `cap_reached` → refund the credits (store `ai_cap_reached`) and answer 503 `ai_cap_reached`. There is no provider call. Write a route test with a fake provider that counts calls and expects 0.
   - `unpriced` → refund and answer 503 `server_misconfigured`.
8. Provider call with an AbortController, then `spend.settle(spendId, outcome)`. Here `outcome` is `"ok"` or the provider code, and `NO_CHARGE_OUTCOMES` releases the estimate. Then commit the result (on success), or refund with the code (on provider failure, parse or validation failure, or abort). Commit before `sendJson`, so a client that disconnects can replay.
9. Replay rules:
   - `committed` with the same hash → 200 with the stored result, no spend and no provider call.
   - Hash mismatch → 400 `bad_request`. Without this check, a reused key would return another photo's tags.
   - Live `reserved` → 503 `ai_busy` with `Retry-After: 5` (existing code).
   - `refunded` → answer the stored `error_code` with its status. A key stays terminal (`credits.js` contract), so a retry means a new tap and a new key.
   - Expired `reserved` (crash) → `refund`, then 502 `provider_unavailable`.
10. If `commit` returns `expired` (the call ran past the 10 min TTL), still return the result and log `credit_commit_expired`. Add a test that the provider and body timeouts stay well below `RESERVATION_TTL_MS`.

Settle outcomes and how the user is charged:

| Outcome | Spend meter | User credits |
|---|---|---|
| Success | `charged` | committed |
| `provider_bad_response` or validation failure | `charged` | refunded |
| Provider 401/403/404/429 | `released` | refunded |
| Abort before send | `not_sent` | refunded |

**R-E. Where the client supplies keys** (needed in this ticket, or the server cannot work)
- `aiTagging.ts` and `aiOutfits.ts` take an `opKey` argument and send `Idempotency-Key`.
- Photo import: use one key per job attempt. A job that is skipped and then retried by the user gets a new key. The existing `aiFields` reuse (`photoImport.ts:193`) stays the first line of defence.
- Editor fill (`useAiFill`): one key per tap.
- Outfits modal: one key per (pool, weather, seed) request. Shuffle creates a new key.
- Keys are `crypto.randomUUID()`, which passes the `[A-Za-z0-9_-]{1,128}` check.

**R-F. Codes**
- Add `credits_exhausted: 402` and `welcome_pending: 402` to both mirrors (`parity.test.ts` enforces it).
- Add `credits_exhausted`, `welcome_pending` and `ai_cap_reached` to `AI_BATCH_OFF`.
- Add minimal Vietnamese `AI_ERRORS` entries.
- Add a `photoImport.test.ts` case per code: earlier photos `done`/`filled`, later ones `ai:"off"`, `aiStopped` set, every file still saved.

**R-G. `GET /api/ai/credits`**
- Response shape: `{ credits: { balance: {period, monthly, lasting, total}, welcome, capReached, costs: {photo_fill: 1, suggest: 1}, provider } }`.
- `balance` and `welcome` come from `ledger.balance()`. Note this is a write transaction (lazy grants) behind a GET, so add a comment saying so.
- `capReached = spend.status().remainingMicroUsd < estimateMicroUsd(SHARED, "photo_fill")`, i.e. the next cheapest call would be refused.
- `provider` is `SHARED.provider`, or `null` when no shared key is stored.
- `costs` come from `CREDIT_PRICES`.
- Answer 503 `server_misconfigured` when `ai` is null.
- Add `credits` and `spend` to `AiContext` in `app.js` so tests can inject fakes.
- Do not depend on PR #110 (F-706.5).

**R-H. Split**
- Do not split server from client. The parity test, the `copy.test` and the idempotency header force them to change together, and D52 says the key swap and the charge land together (`ai-stylist-notes.md:51`).
- If the diff gets too big to review, split off R-G (`GET /api/ai/credits`) as its own PR or sub-ticket. It is read-only and independent, and F-706.7 can build against it first.
- Either way, use ordered commits: migration + ledger → server cutover → codes/client keys → credits endpoint.

## Risks

- **Release discipline (D55).** Once this is on `main`, any hotfix has to be cut from a commit before F-706.4. The new migration makes that worse: an image that includes it adds columns and backfills, which is expand-only and safe to roll back, but the backfill moment defines who counts as "existing".
- **Abort abuse.** A client that aborts mid-call gets its credits back while the cap is still charged. The rate limiter and in-flight slots bound this. The pessimistic meter accepts it (D53).
- **Results stored indefinitely.** `result` holds tag names/brands and item ids, under RLS and outside backup. Raise a `debt` issue for retention.
- **Dev runs against production (D45).** `pnpm dev` with a real shared key spends real credits and cap. Route tests have to use a fake provider. Ming's manual test happens only after M-42.
- **Data leaving the app.** A shared-key photo fill sends every user's photos to Ming's provider account. D54's notice covers stickers only. Unresolved, see Q3.
- **Between merge and release, `main` is not a working app for non-owners.** The client on `main` still gates AI on a per-user key (`aiFill.ts:107`), and the removed `/test` route answers 404. That is acceptable only under the D52/D55 rule that F-706.7 ships with it.

## Open questions (batched for Ming; each with a default)

1. **What should `PUT /api/ai-settings` do with an `apiKey` after the cutover?**
   - Why: it creates BYOK ciphertext that is never read and that F-706.8 must delete.
   - Default: leave it unchanged in F-706.4 (R7), since F-706.7 removes the form in the same release. Log a `debt` issue.
2. **Is the `Idempotency-Key` header required?**
   - Why: an open old tab would get errors.
   - Default: required. A missing header answers 400 `bad_request`, so AC3 is always provable.
3. **Does the D54 one-time AI notice also have to show before a user's first shared-key photo fill?**
   - Why: the ticket's own note flags it.
   - Default: yes. Ask Ming to record it and implement it in F-706.7 (client), not here.
4. **Should the shared provider/model be a code constant or an env variable?**
   - Default: a constant (`gemini` / `gemini-2.5-flash`). Changing it means a PR, and the price table must have the model.
5. **What should a replay of an expired reservation (crash mid-call) answer?**
   - Default: refund, then 502 `provider_unavailable`. No new code.
6. **Is it accepted that a not-yet-approved account can spend its 60 monthly credits before approval?**
   - Why: this is the F-706.1 behaviour.
   - Default: yes, per the `credits.js:55` comment. Ming should confirm, since the main budget risk with open join is new accounts.

Files used: work/tickets/F-706.4/ticket.md, server/ai/credits.js, creditMath.js, spend.js, spendPrices.js, appKeys.js, routes.js, tagPhoto.js, suggestOutfits.js, catalog.js, parity.test.ts, appKeys.test.ts, server/app.js, db/migrations/20261122120000_credit_ledger.sql, db/migrations/20261122140000_ai_spend_meter.sql, src/shared/ai/errors.ts, src/data/photoImport.ts, src/data/aiTagging.ts, src/features/settings/copy.test.ts, docs/ai-stylist-notes.md, work/decisions.md (D52–D55).
