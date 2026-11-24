## Attempt 1 — 2026-11-24

Slice 1 only (`GET /api/ai/credits` is F-706.9). Ordered work: migration + ledger, server cutover, codes and client keys.

### A11: F-706.7 contract comparison
Compared with `scratchpad/F-706.7-plan.md` (copy of the plan on `ticket/F-706.7`). Codes and statuses match what was
implemented: `credits_exhausted` 402, `welcome_pending` 402, `ai_cap_reached` 503 (reused), no 403.
Differences, none blocking:
- The F-706.7 plan says F-706.4 "may also add `op_key_mismatch` -> 409". This ticket does not add that code: a key
  reused for another kind or another request answers 400 `bad_request` (approved plan, A2/consult R-D). F-706.7 shows
  `bad_request` with its generic text.
- F-706.7 assumes `AI_BATCH_OFF` gets the three codes: done (`credits_exhausted`, `welcome_pending`, `ai_cap_reached`).
- F-706.7 expects F-706.4 to own the `Idempotency-Key` client header in `aiTagging.ts` / `aiOutfits.ts`: done
  (`opKey` third/optional argument, fresh UUID per call by default).
- The credits endpoint contract (`GET /api/ai/credits`) is not in this slice (F-706.9). Existing accounts read
  `welcome = approved` through the migration (consult F9, A7).

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261124120000_credit_ops_replay.sql` | New: `credit_ops.request_hash/result/error_code`, welcome backfill rerun + approval of pending welcome rows for existing accounts (A7). Lifts and restores `force` on the five tables and `credit_grants` |
| `db/migrations/README.md`, `docs/data-model.md` | Docs follow the schema change |
| `server/ai/credits.js` | `commit`/`refund` store replay data in the same UPDATE; ops return `requestHash/result/errorCode`; re-exports `isValidOpKey`, `CREDIT_PRICES` |
| `server/ai/appKeys.js` | `open(provider)` for the paid-call runner |
| `server/ai/shared.js` | New: fixed shared provider/model (gemini, gemini-2.5-flash) |
| `server/ai/paidCall.js` | New: the one paid-call runner and its pure helpers |
| `server/ai/tagPhoto.js`, `server/ai/suggestOutfits.js` | Cut over to the runner and the shared key; Gemini only |
| `server/ai/routes.js`, `server/api.js` | Remove `loadSettingsKey`, `/test` handler and route (BYOK never decrypted) |
| `server/app.js` | Build/inject `credits` and `spend` into the AI context |
| `server/ai/catalog.js`, `src/shared/ai/errors.ts` | `credits_exhausted`, `welcome_pending` (parity mirror) |
| `src/features/settings/copy.ts` | Minimal Vietnamese `AI_ERRORS` entries (type forces them) |
| `src/data/photoImport.ts` | Three codes in `AI_BATCH_OFF` |
| `src/data/aiTagging.ts`, `src/data/aiOutfits.ts` | Send `Idempotency-Key` |
| `server/test/fake-ai.ts` | New: fake shared-key store, credit ledger, spend meter |
| Tests: `server/ai/{paidCall,cutover,tagPhoto,suggestOutfits,routes,credits,credits.db,spend,appKeys,appKeys.db}.test.ts`, `server/{isolation.db,api,migrator.db}.test.ts`, `src/data/{photoImport,aiTagging,aiOutfits}.test.ts` | Plan test list; `migrator.db.test.ts` is out of plan (see below) |

### Tests added / changed
- `paidCall.test.ts`: mapReserve, replayAnswer table, settleOutcome, parseOpKey, hashes, price/timeout invariants, runner with fakes (success, provider failure, input failure, client gone, commit expired, expired replay, thrown DB error).
- `cutover.test.ts`: no BYOK decrypt path, `loadSettingsKey` gone, one runner, only paidCall reserves.
- `tagPhoto.test.ts` / `suggestOutfits.test.ts`: rewritten from BYOK to shared key + fakes (shared key, BYOK row never read, no key, credits_exhausted, welcome_pending, replay same/other payload, live reservation busy, refunded replay, cap, owner at cap, refund on every provider failure, invalid photo after reserve, unpriced, header validation, logs/secrets, in-flight, disconnect, body timeouts).
- `credits.db.test.ts`: replay storage (commit stores atomically, refund stores code, expired commit stores nothing, constraints) and the migration test (existing account approved, pending welcome of an existing account approved, account with no data stays pending).
- `appKeys.db.test.ts` (open round trip, wrong KEK, missing), `appKeys.test.ts`, `credits.test.ts` (settle arguments with a fake pool), `spend.test.ts` and `credits.test.ts` importer checks inverted, `isolation.db.test.ts` (B uses the shared key, ciphertext untouched), `api.test.ts` (`/test` is 404), `routes.test.ts` (BYOK `/test` and `loadSettingsKey` blocks removed; DELETE /key tests kept), client `photoImport`, `aiTagging`, `aiOutfits` tests.

### Checks (actual output summary)
Run in WSL against a throwaway Postgres 17 container (TEST_DATABASE_URL set, DB suites ran):
- format:check: PASS (All matched files use the correct format; 363 files)
- typecheck: PASS (`tsc --noEmit && tsc -p tsconfig.server.json`)
- test: PASS (Test Files 164 passed (164); Tests 2344 passed (2344))
- build: PASS (128 modules transformed, built in 385ms)
Note: an earlier full run had one failure, the 413 streamed-body test (client ECONNRESET race); fixed in the test, later runs green.

### Out-of-plan files
- `server/migrator.db.test.ts` — the new migration changes the applied-migration count (11 -> 12) and the `beforeCredit` helper must also drop it; the credit-ledger guard test must copy it back. Test-only.

### Deviations from the plan (small)
- The importer assertions in `credits.test.ts` and `spend.test.ts` were inverted in place (credits.js: app.js + paidCall.js; spend.js: app.js) instead of moving the credits one into `cutover.test.ts`.
- `credits.test.ts` "unit tests for new commit/refund arguments" use a fake pool (`fakePool`) to assert the UPDATE parameters; the real behaviour is in `credits.db.test.ts`.
- `paidCall.test.ts` "timeouts below RESERVATION_TTL_MS" hardcodes the Gemini adapter defaults (45 s, 30 s) because they are not exported.
- The 413 streamed-body test in `tagPhoto.test.ts` tolerates a client-side reset (the server closes the socket with the upload unread) and checks the server log instead; it failed once in one of five runs before this.

### Follow-ups (noticed, not done)
- `parseTestBody` in `server/ai/validate.js` (and its test) and the `"test"` limiter kind in `rateLimit.js` / `AiContext` are now unused; remove with F-706.8.
- `checkClaudeKey` / `checkGeminiKey` stay used by `appKeys.test()` (admin); `claude.js` `tagPhotoWithClaude` / `suggestWithClaude` are no longer reachable from any route (shared provider is Gemini). Candidate for cleanup in F-706.8.
- Spend reservations are settled best effort: a crash between `spend.reserve` and `settle` keeps the estimate in the month (A8, spaceM#76). Stored results are kept indefinitely (A9, spaceM#77). `PUT /api/ai-settings` still seals new BYOK keys (A1, spaceM#75).
- `src/data/aiFill.ts` gating on a personal key and the UI stay for F-706.7 (A10).

### Scope self-check
- Could the diff be smaller? No for production code (about +270 / -165 outside tests, mostly the runner and the removed BYOK code); tests are mostly the BYOK-to-shared-key rewrite of the two route suites.
- Diff size: see `git diff --shortstat` at commit time.
