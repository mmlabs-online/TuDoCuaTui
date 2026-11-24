## Attempt 1 — 2026-11-24
Verdict: PASS

### Checks (run by reviewer)
Run in WSL (rsync copy of the working tree at `ffd2f1b`/`3609d30`, throwaway Postgres 17 on 127.0.0.1:55432, `TEST_DATABASE_URL` set, DB suites ran: `credits.db` 28, `isolation.db` 16, `migrator.db` 39 tests; the new migration was present in the copy).
- format — `pnpm format:check`: PASS (all matched files use the correct format, 363 files)
- typecheck — `pnpm typecheck`: PASS (`tsc --noEmit && tsc -p tsconfig.server.json`)
- test — `pnpm test`: PASS (Test Files 164 passed (164); Tests 2344 passed (2344); none skipped). Matches impl-log.
- build — `pnpm build`: PASS (128 modules transformed)
- Extra: `vitest run server/ai/tagPhoto.test.ts server/ai/paidCall.test.ts server/ai/suggestOutfits.test.ts` six times in a row: 6/6 green (71 tests each), no flake of the 413 streamed-body test.

### Acceptance criteria
- [x] Photo fill, bulk tagging and suggestions use the shared key and charge credits per D53 prices — evidence: `tagPhoto.test.ts:141` (appKeys.open("gemini"), gemini-2.5-flash URL, reserve photo_fill, commit), `suggestOutfits.test.ts:183` (reserve suggest, commit), `suggestOutfits.test.ts:346` (< 2 candidates: 200 [], no reserve, no key open), `paidCall.test.ts` kinds/prices; code `server/ai/paidCall.js` (`runPaidCall`), `server/ai/shared.js`. Bulk tagging goes through the same `tag-photo` route.
- [x] No code path decrypts a BYOK key; existing ciphertext unchanged — evidence: `cutover.test.ts` (only `crypto.js` mentions `openStoredKey`/`openKey`; only `store.js` mentions `getSecret`; `loadSettingsKey` gone; no `/test` route), `tagPhoto.test.ts:180` (BYOK row present, `getSecret` count 0), `api.test.ts:88` (`POST /api/ai-settings/test` → 404), `isolation.db.test.ts` (B's tag-photo uses the shared key, A's ciphertext untouched). Migration `20261124120000_credit_ops_replay.sql` only reads `ai_settings` (union in the backfill), never writes it — checked.
- [x] Same idempotency key never charges or calls the provider twice; replays the stored result — evidence: `tagPhoto.test.ts:228` (same key + same photo → stored suggestion, one fetch, one credit), `:240` (other photo → 400, no call), `:248` (live reservation → 503 ai_busy Retry-After 5), `:268` (refunded key replays code, one fetch), `suggestOutfits.test.ts:251`, `:264`; `credits.db.test.ts` "commit stores result and request hash atomically; replay returns them", "refund stores error_code", "a commit that finds the reservation expired stores nothing"; `credits.js` settle writes `request_hash/result/error_code` in the same UPDATE as `state`. Idempotency scope is `(user_id, op_key)`, so one user cannot replay another's result.
- [x] Failed provider call refunds credits; at the cap a distinct error with no provider call; non-AI routes still work — evidence: `tagPhoto.test.ts:280` (six provider failures: refund, spend settled with the provider code), `:304` (invalid photo after reserve: refund, spend `not_sent`), `:315` (cap → 503 ai_cap_reached, refund, 0 fetches, body unread), `:325` (at the cap `GET /api/ai-settings` and `/api/auth/me` 200), `:590` and `suggestOutfits.test.ts:274` (owner not exempt from the cap, A13).
- [x] Bulk import stops cleanly when credits run out — evidence: `photoImport.test.ts` `test.each(["credits_exhausted","welcome_pending","ai_cap_reached"])` (jobs `filled, skipped, off`, all 3 saved, `aiStopped` set, `stopped` undefined); `src/data/photoImport.ts:46-48`; `tagPhoto.test.ts:202` (402 credits_exhausted, body not read, no call).
- [x] A user can still delete their own stored BYOK key — evidence: `routes.test.ts:234-292` "DELETE key" block kept and green; `server/api.js` DELETE `/api/ai-settings/key` match unchanged.
- [x] All checks pass — evidence: reviewer run above.

Ming verification after merge (not verified here, carry to the PR): after M-42 and with F-706.7 + F-707.4 in the same release (D52/D55), one real photo fill and one real suggestion on production; an account that existed before the release has an approved welcome grant (A7); provider console shows the calls on the shared account and the spend meter grows by one row per call.

### Points judged (orchestrator request)
- **Out-of-plan `server/migrator.db.test.ts`** — justified and accepted. Test-only, three lines: applied-migration count 11 → 12, and the `beforeCredit` helper / force-guard test must drop and copy back the new file or they test the wrong migration set. Unavoidable consequence of the planned migration; recorded under `Out-of-plan files`.
- **Inertness tests inverted in place** — accepted. `credits.test.ts` now pins importers of `credits.js` to exactly `["app.js","paidCall.js"]`, `spend.test.ts` pins `spend.js` to `["app.js"]`, `appKeys.test.ts` pins the shared-key path to `paidCall.js`'s `appKeys.open`. Together with `cutover.test.ts` ("only paidCall.js calls credits.reserve and spend.reserve") this is at least as strict as the plan's "move to cutover.test.ts"; the deviation is recorded in impl-log.
- **413 streamed-body test loosened** (`tagPhoto.test.ts:367-391`) — accepted, does not materially weaken it. The server-side `ai_tag` log code `payload_too_large` is emitted by `reject()` on the same path that writes the 413, and the test still asserts no provider fetch and full refund (balance 1000), which is the F-706.4 concern. The client-visible 413 for a declared length stays strictly asserted at `:360`. The residual gap (a server that logs 413 but resets without writing it would pass) is pre-existing `rejectUnread` behaviour, not this ticket's. 6/6 reruns green. See Nit 2 for a cheap tightening.
- **A11 contract vs F-706.7 plan** (scratchpad copy) — matches: `credits_exhausted` 402, `welcome_pending` 402, `ai_cap_reached` 503 reused, all three in `AI_BATCH_OFF`, `Idempotency-Key` sent from `aiTagging.ts`/`aiOutfits.ts` (F-706.7 line 121 assigns this to F-706.4), existing accounts approved by the migration (F-706.7 line 123). The optional `op_key_mismatch` 409 was not added; key reuse answers 400 `bad_request`, which F-706.7 shows with generic text — compatible. One hotspot: F-706.7 plans to *add* the two `AI_ERRORS` entries in `src/features/settings/copy.ts` (its line 77); this ticket already adds them, so F-706.7 will hit a conflict and should change to rewording only (Follow-up 1).

### Issues
None blocking.

### Rules (CLAUDE.md)
No violations found.
- R1: client changes stay in `src/data/` wrappers; no component fetch.
- R2: new migration file, no applied migration edited; RLS: existing `owner_only` covers the new `credit_ops` columns, `force` is lifted and restored for all six tables in the same file. (R2's `supabase/migrations/` wording is stale; the project's migrations live in `db/migrations/`.)
- R3: the shared key stays server-side; sentinel tests `tagPhoto.test.ts:519`, `suggestOutfits.test.ts:503` assert it never leaves the server and only goes in the provider header.
- R5: balances stay computed; `credit_ops.result` is a replay cache, not a derived value.
- R6: new Vietnamese copy only in `src/features/settings/copy.ts`.
- R7: every changed file is in the plan or justified; High paths changed (`db/migrations/**`, `server/**`) are all named in the plan.
- R8: new pure logic in `paidCall.js` has unit tests (`paidCall.test.ts`).

### Blockers from review agents
None. `security-review.md` attempt 1 has no 🔴. Its 🟡 1 (client disconnect refunds credits while the shared cap is charged, so the cap can be drained) and 🟡 2 (result sent free when commit does not land) are filed as a **release blocker**: mmlabs-online/spaceM#78. They must be fixed before the F-706.4 cutover release.

### Nits (do not block)
- 💭 Nit 1 — `server/ai/paidCall.js` `abandon("not_sent")` on input failure and on client-gone stores `error_code = 'not_sent'`, which is not in `AI_ERROR_STATUS`, so a replay of that key answers 502 `provider_unavailable` instead of the code first answered (`invalid_photo`, `payload_too_large`, `request_timeout`). Same for the catch path's `"internal"` (that one is in the catalog). The migration comment says "a replay of a refunded key answers the same code". No impact today (the client sends a fresh UUID per call), but cheap to align: settle spend with `not_sent` and refund with the answered code.
- 💭 Nit 2 — `tagPhoto.test.ts:384` `.catch(() => null)` swallows any client error; narrowing it to a socket reset (`ECONNRESET`/`EPIPE`/`UND_ERR_SOCKET` in `e.cause.code`) would keep the tolerance without hiding other failures. The `while` wait on the log has no own timeout (falls back to the Vitest timeout).
- 💭 Nit 3 — `runPaidCall` opens (decrypts) the shared key before the credit reserve, so a committed replay also decrypts and fails with 409 if the shared key was removed meanwhile; and an unexpected throw after `spend.reserve` (e.g. from a provider adapter) refunds credits but leaves the spend row reserved (conservative, A8).
- 💭 Nit 4 — `paidCall.test.ts` hardcodes the Gemini timeouts (45 s / 30 s) instead of importing them; exporting the constants would make the TTL invariant track real changes.

### Follow-ups (out of scope)
- F-706.7: `src/features/settings/copy.ts` already has `credits_exhausted`/`welcome_pending` entries from this ticket; F-706.7 should reword rather than add (merge conflict otherwise). Also `bad_request` is the key-reuse answer (no `op_key_mismatch`).
- F-706.8: remove now-unused `parseTestBody` (`server/ai/validate.js`), the `"test"` limiter kind, and the unreachable `tagPhotoWithClaude`/`suggestWithClaude` paths (impl-log list).
- CLAUDE.md R2 still names `supabase/migrations/` and `src/types/database.ts`; update to `db/migrations/` (project rules, not this ticket).
- Existing debt: spaceM#75 (A1, PUT still seals BYOK), #76 (A8, spend reservations never expire), #77 (A9, stored results retention).
- Release rule stays: do not cut a release with this ticket without F-706.7, F-706.9 and F-707.4 (D52/D55), and M-42 first; A3 and A6 need Ming's explicit confirmation before release.
