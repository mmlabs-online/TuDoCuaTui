Status: READY

# Plan — F-706.4: Cut AI over to the shared key, credits and spend cap

> High tier (`server/**`, `db/migrations/**`). Gate: plan-approval. The loop stops here until Ming approves.
> The F-706.7 plan lives only on branch `ticket/F-706.7`. The planner's tools cannot read another branch, so this
> plan uses the contract as quoted in the ticket's "Notes / answers from Ming" (2026-11-24). See A11.

## Scope summary
- `docs/feature-list.md` F-706: "**F-706.4 Cutover:** photo fill, bulk tagging and suggestions use the shared key,
  credits and cap. BYOK keys are no longer read."
- F-706 AC (feature list), the parts this ticket owns:
  - "The same idempotency key never charges or calls the provider twice, and replays the stored result."
  - "A failed provider call refunds credits. Its estimated cost stays in the spend meter unless the provider confirms
    no charge, because a timed-out call may still be billed."
  - "At the cap, AI routes answer a distinct error with no provider call, and all non-AI routes still work."
  - "After F-706.4 no code path decrypts a BYOK key; existing ciphertext is unchanged until F-706.8."
  - "The bulk import stops cleanly when credits run out: finished photos stay, the rest are reported as not tagged."
- D52: "every signed-in user uses it, limited by credits (D53). BYOK stops being read at the F-706.4 cutover; existing
  ciphertext is kept unchanged until … F-706.8 … Until then a user can still delete their own stored key
  (`DELETE /api/ai-settings/key`)." "Gemini for text by default."
- D53: "reserve → commit on success → refund on failure … AI photo fill 1; new AI suggestion (incl. shuffle) 1 …
  **Existing accounts get the 300 welcome credits once; accounts that join later get theirs only after the admin
  approves them** … at the cap every AI route returns a distinct error with no provider call and the rest of the app
  works. Owner exemptions from rate limits (D38) do not exempt anyone from the cap."
- D54: "idempotency keys on every paid call."
- D55: F-706.4 may merge before F-707.4; "no release that contains F-706.4 is cut until F-706.7 and F-707.4 are in
  the same release (or earlier)".
- Ming, 2026-11-24 (ticket Notes): adopt the F-706.7 contract — codes `credits_exhausted` 402 and `welcome_pending`
  402, reuse `ai_cap_reached` 503; "Existing accounts must read welcome=approved". The `GET /api/ai/credits`
  endpoint from the same note is proposed as a separate slice (see Split proposal).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Photo fill, bulk tagging and suggestions use the shared key and charge credits per D53 prices | `tagPhoto.test.ts › shared key: uses appKeys.open("gemini") key and gemini-2.5-flash, reserves photo_fill and commits`; `suggestOutfits.test.ts › shared key: reserves suggest (1 credit) and commits`; `suggestOutfits.test.ts › fewer than 2 candidates: 200 [] with no reserve`; `paidCall.test.ts › kinds map to CREDIT_PRICES` |
| 2 | No code path decrypts a BYOK key; ciphertext unchanged | `cutover.test.ts` structural tests (no non-test file outside `crypto.js` mentions `openStoredKey`/`openKey`; no non-test file outside `store.js` calls `getSecret`; `loadSettingsKey` gone); `tagPhoto.test.ts › BYOK row present: getSecret never called`; `api.test.ts › POST /api/ai-settings/test is 404`; `credits.db.test.ts`/migration leaves `ai_settings` untouched (no `ai_settings` write in the new migration, checked in review) |
| 3 | Same idempotency key never charges or calls the provider twice; replays the stored result | `credits.db.test.ts › commit stores result and request hash atomically; replay returns them`; `tagPhoto.test.ts › replay: same key + same photo -> 200 stored suggestion, provider called once, one credit`; `… › same key + other photo -> 400 bad_request, no provider call`; `… › live reservation -> 503 ai_busy Retry-After 5`; `… › refunded key replays stored error code`; same set in `suggestOutfits.test.ts`; `… › missing or invalid Idempotency-Key -> 400 bad_request before any reserve` |
| 4 | Failed provider call refunds credits; at the cap a distinct error, no provider call; non-AI routes work | `tagPhoto.test.ts › provider failure refunds credits and settles spend with the provider code`; `… › cap reached -> 503 ai_cap_reached, credits refunded, provider call count 0, body not read`; `suggestOutfits.test.ts › cap reached -> 503 ai_cap_reached, no provider call`; `… › cap applies to the owner too`; `tagPhoto.test.ts › at the cap GET /api/ai-settings and /api/auth/me still answer 200`; `paidCall.test.ts › settle outcomes table` |
| 5 | Bulk import stops cleanly when credits run out | `photoImport.test.ts › credits_exhausted / welcome_pending / ai_cap_reached: earlier photos keep ai state, later ones ai:"off", aiStopped set, every file saved`; `tagPhoto.test.ts › out of credits -> 402 credits_exhausted without reading the body` |
| 6 | A user can still delete their own stored BYOK key | `routes.test.ts › DELETE /api/ai-settings/key clears the caller's key only` (existing tests at `routes.test.ts:269-300` kept green) |
| 7 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` recorded in impl-log |

## Ming verification after merge
- Only after M-42 (paid no-training tier + provider-console cap ≤ $20/month) and with F-706.7 and F-707.4 in the
  same release (D52, D55): one real photo fill and one real suggestion on production with the shared key.
- After the release deploy: an account that existed before the release has an approved welcome grant (A7). Until
  the credits endpoint slice ships, this is checked by Ming through the F-706.5 admin view or a DB query (Ming's step).
- The provider console shows the calls on the shared account, and the spend meter row count grows by one per call.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `db/migrations/20261124120000_credit_ops_replay.sql` | New: add nullable `credit_ops.request_hash text`, `credit_ops.result jsonb`, `credit_ops.error_code text` (+ length check on `error_code` ≤ 64 and `request_hash` = 64 hex). Rerun the welcome backfill for existing accounts (approved, `on conflict (user_id) where bucket = 'welcome' do nothing`) and approve any still-pending welcome row of those same accounts (A7). Uses the `no force` / `force` pattern for the five tables **and `credit_grants`** (now forced), and `tudo.owner_sub`. Rollback comment | AC3 (stored result), Ming "existing accounts read approved" (consult F1, F9) | Yes |
| `server/ai/credits.js` | `commit(userId, opKey, { requestHash, result })` writes both in the same UPDATE that sets `committed`; `refund(userId, opKey, { errorCode })` stores the code; `toOp` returns `requestHash`, `result`, `errorCode`; re-export `isValidOpKey` and `CREDIT_PRICES` so routes do not import `creditMath.js` | AC3 | Yes |
| `server/ai/appKeys.js` | Add `open(provider)` → `{ ok: true, key } \| { ok: false, status, code }` (missing → 409 `not_configured`, decrypt failure → 409 `key_unreadable`); server-internal, never reaches a response or log | AC1 (consult F4) | Yes |
| `server/ai/shared.js` | New: `SHARED_TEXT = { provider: "gemini", model: defaultModelOf("gemini") }` frozen (D52, A4) | AC1 | Yes |
| `server/ai/paidCall.js` | New: one paid-call runner used by both routes (header parse, reserve mapping, spend reserve/settle, commit/refund, replay answers), plus pure helpers `mapReserve`, `replayAnswer`, `settleOutcome`, `hashBytes`, `hashJson` | AC1, AC3, AC4 (pure logic in a plain module, rule 6) | Yes |
| `server/ai/tagPhoto.js` | Replace `loadSettingsKey` with `appKeys.open(SHARED_TEXT.provider)` and the paid-call runner; header comment updated | AC1–AC4 | Yes |
| `server/ai/suggestOutfits.js` | Same as tagPhoto; the `< 2 candidates → 200 []` path stays free and before any reserve | AC1–AC4 | Yes |
| `server/ai/routes.js` | Delete `loadSettingsKey`, `handleTest`, `CHECKERS` and the `openStoredKey` import; extend the `AiContext` typedef with `credits` and `spend`; `GET`, `PUT`, `DELETE /key` unchanged | AC2, AC6 (consult F6) | Yes |
| `server/api.js` | Remove the `/api/ai-settings/test` route match (generic 404) | AC2 | Yes |
| `server/app.js` | Build `credits: ai.credits ?? createCreditLedger(pool, { now })` and `spend: ai.spend ?? createSpendMeter(pool, { now })` into `aiContext` (null without a pool); accept injected fakes | AC1, AC4 | Yes |
| `server/ai/catalog.js` | Add `credits_exhausted: 402`, `welcome_pending: 402` | Codes (Ming note) | Yes |
| `src/shared/ai/errors.ts` | Same two codes (parity mirror) | Codes; `parity.test.ts` | No |
| `src/features/settings/copy.ts` | Minimal Vietnamese `AI_ERRORS` entries for the two codes (`Record<AiErrorCode, string>` and `copy.test.ts` require them); F-706.7 may reword | Typecheck, R6 | No |
| `src/data/photoImport.ts` | Add `credits_exhausted`, `welcome_pending`, `ai_cap_reached` to `AI_BATCH_OFF` | AC5 | No |
| `src/data/aiTagging.ts` | `tag(image, signal?, opKey = crypto.randomUUID())` sends `Idempotency-Key` | AC3 (server requires the header, A2) | No |
| `src/data/aiOutfits.ts` | `suggest(input, signal?, opKey = crypto.randomUUID())` sends `Idempotency-Key` | AC3 | No |
| `server/test/fake-ai.ts` | New: fake `appKeys.open`, fake credit ledger (in-memory reserve/commit/refund with replay), fake spend meter (cap switch, settle log), provider call counter | Route tests without a DB or real provider (D45) | Yes |
| `server/ai/paidCall.test.ts` | New unit tests for the pure helpers and the runner with fakes | Rule 6 | Yes |
| `server/ai/cutover.test.ts` | New structural tests replacing the three inertness tests (A-list in Tests) | AC2 | Yes |
| `server/ai/tagPhoto.test.ts` | Rewrite fixtures from BYOK `getSecret` to shared key + fakes; add cases in Tests | AC1–AC5 | Yes |
| `server/ai/suggestOutfits.test.ts` | Same | AC1–AC4 | Yes |
| `server/ai/routes.test.ts` | Delete the `loadSettingsKey` block (`:690-752`) and `/test` cases (`:140`, `:605-607`, `:772`); keep DELETE /key tests | AC2, AC6 | Yes |
| `server/ai/credits.test.ts` | Delete the inertness test at `:48` (moved to `cutover.test.ts`); unit tests for new `commit`/`refund` arguments | AC3 | Yes |
| `server/ai/credits.db.test.ts` | Replay returns stored `result`/`requestHash`/`errorCode`; commit writes them atomically | AC3 | Yes |
| `server/ai/spend.test.ts` | Invert the inertness test at `:106`: only `app.js` imports `spend.js` (plus tests); keep "only spend.js imports spendPrices.js" | AC4 | Yes |
| `server/ai/appKeys.test.ts` | Invert the test at `:61`: `tagPhoto.js`/`suggestOutfits.js` use `appKeys.open`; `open()` unit tests | AC1 | Yes |
| `server/ai/appKeys.db.test.ts` | `open()` round trip and wrong-KEK → `key_unreadable` | AC1 | Yes |
| `server/isolation.db.test.ts` | Rewrite the `/test` + tag-photo case (`:423`) to "B's tag-photo uses the shared key, never A's BYOK"; drop `/test` call (`:350`) | AC2 | Yes |
| `server/api.test.ts` | `/api/ai-settings/test` → 404 | AC2 | Yes |
| `src/data/photoImport.test.ts` | One case per new AI_BATCH_OFF code | AC5 | No |
| `src/data/aiTagging.test.ts`, `src/data/aiOutfits.test.ts` | Header sent; explicit `opKey` used; 402 codes map to `AiSettingsError` | AC3 | No |
| `docs/data-model.md` | Describe the three new `credit_ops` columns and the second welcome backfill | Docs follow schema | No |
| `db/migrations/README.md` | One line: the welcome backfill reruns in `20261124120000_credit_ops_replay`; `credit_grants` needs `no force` for it | Migration rules | Yes |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `paidCall.test.ts › mapReserve: insufficient→402 credits_exhausted, welcome_pending→402 welcome_pending, op_key_mismatch→400 bad_request` | Codes |
| `paidCall.test.ts › replayAnswer: committed+same hash→200 stored; committed+other hash→400; live reserved→503 ai_busy Retry-After 5; refunded→stored error_code with its status; refunded without code→502 provider_unavailable; expired reserved→refund then 502` | AC3, A5 |
| `paidCall.test.ts › settleOutcome table: ok→charged/commit; provider_bad_response or validation→charged/refund; invalid_key, key_forbidden, model_unavailable, provider_rate_limited→released/refund; closed before provider call→not_sent/refund` | AC4, D53 |
| `paidCall.test.ts › isValidOpKey header: missing, empty, 129 chars, bad chars → 400 bad_request; UUID passes` | A2 |
| `paidCall.test.ts › hashJson is stable for the canonical suggest body; hashBytes is sha256 hex` | AC3 |
| `paidCall.test.ts › commit returning expired still answers the result and logs credit_commit_expired` | Consult R-D.10 |
| `paidCall.test.ts › provider and body timeouts are below RESERVATION_TTL_MS` | Consult R-D.10 |
| `tagPhoto.test.ts › shared key: uses appKeys.open("gemini") key and gemini-2.5-flash, reserves photo_fill and commits` | AC1 |
| `tagPhoto.test.ts › BYOK row present: getSecret never called, provider gets the shared key` | AC2 |
| `tagPhoto.test.ts › no shared key → 409 not_configured, no reserve, body not read` | AC1 |
| `tagPhoto.test.ts › out of credits → 402 credits_exhausted, body not read, no provider call` | AC5 |
| `tagPhoto.test.ts › welcome pending and no monthly left → 402 welcome_pending` | Codes |
| `tagPhoto.test.ts › replay: same key + same photo → 200 stored suggestion, provider called once, one credit` | AC3 |
| `tagPhoto.test.ts › same key + other photo → 400 bad_request, no provider call` | AC3 |
| `tagPhoto.test.ts › provider failure refunds credits and settles spend with the provider code` | AC4 |
| `tagPhoto.test.ts › invalid photo after reserve → refund, spend settled not_sent, 400 invalid_photo` | AC4 |
| `tagPhoto.test.ts › cap reached → 503 ai_cap_reached, credits refunded, provider count 0, body not read` | AC4 |
| `tagPhoto.test.ts › at the cap GET /api/ai-settings and /api/auth/me still answer 200` | AC4 |
| `tagPhoto.test.ts › unpriced model → refund, 503 server_misconfigured` | D53 |
| `tagPhoto.test.ts › client disconnect aborts provider call, refunds, releases slot` (rewrite of `:386`) | AC4 |
| `tagPhoto.test.ts › logs carry fixed fields only; key and result never logged` (rewrite of `:431`, `:455`) | Security |
| `suggestOutfits.test.ts › shared key: reserves suggest (1 credit) and commits` | AC1 |
| `suggestOutfits.test.ts › fewer than 2 candidates: 200 [] with no reserve and no key open` | D53 price 0 |
| `suggestOutfits.test.ts › replay same key + same body → stored outfits; other body → 400` | AC3 |
| `suggestOutfits.test.ts › cap reached → 503 ai_cap_reached, no provider call; owner too` | AC4, D53 |
| `suggestOutfits.test.ts › validation failure → refund, spend charged` | AC4 |
| `credits.db.test.ts › commit stores result and request hash atomically; replay returns them` | AC3 |
| `credits.db.test.ts › refund stores error_code; replay of refunded returns it` | AC3 |
| `credits.db.test.ts › migration: existing account (has items row) without grant gets approved welcome; pending welcome of an existing account becomes approved; account with no data stays absent` | Ming note, A7 |
| `cutover.test.ts › no non-test file outside crypto.js mentions openStoredKey or openKey` | AC2 |
| `cutover.test.ts › no non-test file outside store.js calls getSecret; loadSettingsKey does not exist` | AC2 |
| `cutover.test.ts › tagPhoto.js and suggestOutfits.js use appKeys.open and paidCall; neither imports routes.js` | AC1 |
| `cutover.test.ts › only paidCall.js calls credits.reserve and spend.reserve` | AC4 |
| `appKeys.db.test.ts › open returns the stored key; wrong KEK → key_unreadable; missing → not_configured` | AC1 |
| `isolation.db.test.ts › B's tag-photo uses the shared key, never A's BYOK ciphertext` | AC2 |
| `api.test.ts › POST /api/ai-settings/test is 404` | AC2 |
| `routes.test.ts › DELETE /api/ai-settings/key clears the caller's key only` (kept) | AC6 |
| `photoImport.test.ts › credits_exhausted mid-batch: earlier photos keep filled/nothing, later ai:"off", aiStopped=credits_exhausted, all files saved` (+ same for `welcome_pending`, `ai_cap_reached`) | AC5 |
| `aiTagging.test.ts › sends Idempotency-Key (given opKey, else a UUID); 402 credits_exhausted → AiSettingsError` | AC3 |
| `aiOutfits.test.ts › sends Idempotency-Key; 402 welcome_pending → AiSettingsError` | AC3 |

## Approach
Ordered commits (consult R-H): migration + ledger → server cutover → codes/client keys.

1. **Migration** `20261124120000_credit_ops_replay.sql`: add the three nullable columns (expand-only, the existing
   `owner_only` policy covers them). Rerun the welcome backfill: lift `force` on `locations`, `items`, `item_photos`,
   `wear_logs`, `ai_settings` and `credit_grants`; insert approved welcome rows for the same user set as
   `credit_ledger.sql:66-74` with `on conflict (user_id) where bucket = 'welcome' do nothing`; then
   `update credit_grants set approved_at = now() where bucket = 'welcome' and approved_at is null and user_id in
   (same set)`; re-force all six. Rollback comment: drop the three columns; grants stay. R2 note: this project's
   migrations live in `db/migrations/` (CLAUDE.md R2 still names `supabase/`; the High path in loop.config.md is
   `db/migrations/**`). No applied migration is edited.
2. **Ledger** (`credits.js`): settle signature changes as in the files table; `commit` writes `state`,
   `settled_at`, `request_hash`, `result` in one UPDATE. Results are JSON objects the route built (no raw provider
   output). Re-export `isValidOpKey` and `CREDIT_PRICES`.
3. **Shared key**: `appKeys.open(provider)` reads with `withAppKeys` (read-only) and decrypts with `openAppKey`;
   never logs. `shared.js` holds the fixed provider/model.
4. **Paid-call runner** (`paidCall.js`). Order for each call ("no I/O in a transaction" holds; each ledger/meter call
   is its own short transaction):
   1. in-flight slot, then rate limiter (unchanged);
   2. `Idempotency-Key` header, checked with `isValidOpKey` → else 400 `bad_request` (A2);
   3. suggest only: read and parse body, load candidates; `< 2` → 200 `[]`, free;
   4. `appKeys.open(SHARED_TEXT.provider)` → failure answers its code, no charge;
   5. `credits.reserve(userId, opKey, kind)` → `mapReserve`; `replay` → step 9;
   6. `spend.reserve({ provider, model, kind })` → `cap_reached`: refund (`ai_cap_reached`), 503 `ai_cap_reached`;
      `unpriced`: refund, 503 `server_misconfigured`. **Deviation from consult R-D:** the spend reservation happens
      before the tag-photo body is read, so a request at the cap never uploads 2 MB (tag-photo uses `rejectUnread`
      for steps 2–6). A body failure afterwards settles the spend `not_sent` (released) and refunds;
   7. tag-photo: read body, check JPEG magic bytes; `requestHash = sha256(bytes)`. Suggest: `requestHash =
      sha256(JSON of the parsed body in fixed key order)`;
   8. provider call with the AbortController. If `res` closed before the call starts → outcome `not_sent`, no call.
      Then `spend.settle(spendId, outcome)` where outcome is `"ok"` or the provider/validation code
      (`NO_CHARGE_OUTCOMES` release, others charge), then `commit` with `{ requestHash, result }` on success, or
      `refund` with `{ errorCode }`. Commit before `sendJson`, so a disconnected client can replay;
   9. replay: `replayAnswer` (table in Tests). For tag-photo a committed replay reads the body to compare the hash.
   The request hash is stored at commit, not at reserve, because tag-photo reserves before the body is read
   (consult R-C had it at reserve; that cannot work with step 6's order). A refunded replay only returns a code,
   so it needs no hash.
5. **Routes**: `tagPhoto.js` and `suggestOutfits.js` call the runner; `routes.js` loses `loadSettingsKey` and the
   `/test` handler; `api.js` drops the `/test` match; `app.js` wires `credits` and `spend` (injectable for tests).
6. **Codes and client**: two codes in both mirrors, copy entries, `AI_BATCH_OFF` (+`ai_cap_reached`, consult F7);
   `aiTagging`/`aiOutfits` send `Idempotency-Key`. Each call is one user action today (editor tap; one tag per batch
   file, a retried file reuses `aiFields` at `photoImport.ts:193`; one suggest per modal request), so a fresh UUID
   per call matches consult R-E without touching hooks or components. No UI changes (F-706.7).
7. **Tests** use fakes only (`server/test/fake-ai.ts`); no real provider call, and the implementer must not exercise
   AI through `pnpm dev`, which runs against production (D45).

CLAUDE.md rules: R1 — client data access stays in `src/data/` wrappers; R3 — the shared key stays server-side and never
appears in a response or log (sentinel tests kept); R5 — balances stay computed, `result` is a replay cache, not a
derived value; R6 — new copy only in `copy.ts`; R7 — PUT key sealing and UI untouched (A1, A10); R8 — new pure logic
in `paidCall.js` has unit tests. R2's `supabase/` wording is stale; the plan follows the `db/migrations/` README rules.

## Specialist input used
`consult-software-architect.md`:
- Adopted: F1/R-B (new migration, replay columns), F2 (idempotency only from the credit op; a replay never reserves
  spend), F4/R-A (`appKeys.open`, `shared.js`, delete `loadSettingsKey`), F5 (invert the inertness tests), F6 (remove
  the `/test` route), F7/R-F (codes, `AI_BATCH_OFF` incl. `ai_cap_reached`, copy entries), F8 (bulk import already
  stops once codes are listed), F9 (rerun welcome backfill), F11 (Gemini Flash constant), F12 (no transaction across
  the provider call), R-D (order, settle table, replay rules, commit before send, expired commit), R-E (client keys),
  R-H (split off the credits endpoint, ordered commits).
- Changed: R-C/R-D — the request hash is stored at commit, not at reserve; the spend reservation moves before the
  tag-photo body read (reasons in Approach step 4).
- Changed: R-E — the key is generated per call inside the wrappers (default argument) instead of threading keys
  through hooks; equivalent today, much smaller diff.
- Deferred: R-G (`GET /api/ai/credits`) to the proposed slice F-706.9.
- Open questions 1–6: carried as A1–A6 with the consult's defaults.

## Assumptions
Batched for Ming at plan approval; each has a default the implementer follows unless Ming says otherwise.
- **A1 — `PUT /api/ai-settings` still seals a new BYOK key.** Default: unchanged here (R7); F-706.7 removes the form in
  the same release. Open a `debt` issue so F-706.8 also covers keys saved between now and the release.
- **A2 — `Idempotency-Key` is required.** Default: yes; missing/invalid → 400 `bad_request`. An old open tab gets an
  error until reload; acceptable because the release ships client and server together.
- **A3 — D54 AI notice before the first shared-key photo fill.** D54 names stickers only, but the shared key sends every
  user's photos to Ming's provider account. Default: yes, show it; Ming records the decision and F-706.7 (client)
  implements it before the release. Not done in this ticket. **Ming please confirm.**
- **A4 — Shared provider/model is a code constant** `gemini` / `gemini-2.5-flash`. Changing it is a PR, and the
  price table must list the model (else `unpriced` → 503).
- **A5 — Replay of an expired reservation** (crash mid-call): refund, then 502 `provider_unavailable`. No new code.
- **A6 — A not-yet-approved account can spend its 60 monthly credits before approval** (F-706.1 behaviour,
  `credits.js:55`; D53 "gates only the welcome grant"). `welcome_pending` therefore shows only after the monthly
  credits are used. Default: accepted. **Ming please confirm** — this is the main open-join budget exposure.
- **A7 — "Existing" means "has data when the release deploy runs the migrator".** The migration inserts approved
  welcome rows and also approves pending welcome rows of those accounts (a pending row can exist only if F-706.5 or
  the ledger ran for them earlier). Accounts with no data at that moment get a pending welcome on first AI use.
  Note D55: an earlier hotfix image cut before F-706.4 does not run this migration.
- **A8 — Spend reservations never expire** (`spend.js` counts every non-released row). A crash between
  `spend.reserve` and `settle` keeps the estimate in the cap for the month. Conservative and in line with D53;
  open a `debt` issue for a monthly reconciliation check.
- **A9 — Stored results are kept indefinitely** in `credit_ops.result` (tag names, brands, item ids; RLS-protected,
  not in backup). Open a `debt` issue for a retention rule.
- **A10 — `/api/ai-settings/test` answers 404 after this ticket.** The settings modal's "test" button shows an error
  on `main` until F-706.7 retires the form. Between merge and release, `main` is not usable for AI by non-owners
  (`aiFill.ts:107` still gates on a personal key); accepted under D52/D55.
- **A11 — F-706.7 contract.** The plan on `ticket/F-706.7` was not readable from this branch; the codes and statuses
  come from the ticket Notes (Ming, 2026-11-24). The implementer should compare with
  `git show ticket/F-706.7:work/tickets/F-706.7/plan.md` before coding and record any difference in impl-log.
- **A12 — Hotspots (expect a rebase).** F-706.5 (DONE, PR #110, not merged; not a dependency) very likely edits
  `server/ai/credits.js`, `server/api.js`, `server/app.js`, `db/migrations/`, `docs/data-model.md`,
  `db/migrations/README.md`. If it merges first, rebase and keep the migration timestamp later than its migration.
  F-706.7 (BLOCKED) will edit `src/features/settings/copy.ts`, `src/data/aiTagging.ts`, `src/data/photoImport.ts`.
  F-707.1 (DONE) may touch the suggest path (`suggestOutfits.js` / `outfitSuggest.js`).
- **A13 — Owner is not exempt from credits or the cap** (D53); the owner keeps the in-flight and rate-limit
  exemptions (D38).
- **A14 — The tagging prompt, parsing and validation are unchanged**; only the key source, model and metering change.

## Blocking questions
None. A3 and A6 need Ming's explicit confirmation before the **release**, not before implementation.

## Split proposal
Estimated slice 1 diff: about 450 changed production lines and about 600 test lines (mostly rewriting the
tagPhoto/suggestOutfits fixtures from BYOK to the shared key). It cannot be split further without breaking D52's
"key swap and charge land together" or the parity/copy tests, so it stays one ticket with ordered commits.

- **Slice 1 — F-706.4 (this plan):** migration, ledger replay storage, shared key, paid-call runner, route cutover,
  codes, client idempotency keys.
- **Slice 2 — proposed new ticket F-706.9 "GET /api/ai/credits":** read endpoint with the F-706.7 contract
  `{ credits: { balance: { period, monthly, lasting, total }, welcome, capReached, costs: { photo_fill, suggest },
  provider } }`, per consult R-G (`balance()` is a write transaction behind a GET; `capReached` compares
  `spend.status().remainingMicroUsd` with the photo-fill estimate, which needs a small `spend` helper so that only
  `spend.js` keeps importing `spendPrices.js`; `provider` null when no shared key). Depends on F-706.4. F-706.7 then
  depends on F-706.9, and F-706.9 joins the same release rule (D52/D55). Default: split. If Ming prefers one PR,
  the orchestrator re-plans F-706.4 with slice 2 included.
