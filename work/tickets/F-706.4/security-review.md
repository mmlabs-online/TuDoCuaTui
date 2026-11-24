# Security review — F-706.4

## Attempt 1

**Verdict: no blockers. Two should-fix items.** The first is a real budget and availability gap: one ordinary account can use up the shared spend cap for free. I ran no checks myself (I only had read/grep tools), so the orchestrator needs to confirm that checks are green before PASS.

### Findings

**🟡 1. A signed-in user can drain the shared monthly cap without spending credits.** `server/ai/paidCall.js:153-166` (with `server/ai/gemini.js:148-149` and `server/ai/spendPrices.js:108-114`)
- **Risk:** if the client closes the connection after the upload, the `close` listener aborts the provider call. `geminiJsonCall` then returns `provider_unavailable`, and `abandon` settles spend as **charged** (correct, the provider may bill) but **refunds** the credits.
- The same happens when a crafted photo or crafted item names push the model into `provider_bad_response` or a validation failure.
- So one account with 1 credit can loop "upload, disconnect", limited only by the rate limiter: 100 tag calls a day (`server/ai/rateLimit.js:16`). At the photo_fill ceiling (about $0.01 each) that is about $1 a day per account.
- With open join (A6), about 20 accounts reach the global 2000 a day (`rateLimit.js:25`) and the $20 cap (`spendPrices.js:9`) in about a day. After that every user gets `ai_cap_reached` for the rest of the month.
- Credits are meant to bound each user's share of the cap. Refunding client-caused aborts breaks that.
- **Fix:** capture `const clientAborted = ctl.signal.aborted` when `s.call` returns. If the client closed the connection after the request was sent, **commit** the credits (no stored result, or store a fixed `{}` marker) instead of refunding, and answer nothing.
  - Keep refunding real provider failures (timeout or 5xx without a client abort, bad response).
  - Add a test: "client disconnect during the provider call charges credits and spend".
  - The AC only says "a failed provider call refunds credits", and a client abort is not a provider failure, so this stays inside the plan.
- If Ming prefers to keep the refund, open a `debt` issue for a per-user cap on refunded-but-charged calls.

**🟡 2. A result can be returned free when the commit does not land.** `server/ai/paidCall.js:170-174` (with `server/ai/credits.js:146-170`)
- **Risk:** `credits.commit` only updates a *live* reservation. If it comes back `expired`, or `noop` because a concurrent replay of the same key already refunded it as expired (`paidCall.js:106-108`), the code logs and still sends `out.result`. The user gets the result and keeps the credits.
- Body timeout (15 s) plus provider timeout (45 s) is far below the 10-minute TTL (`creditMath.js:9`), so today this needs extreme DB or event-loop stalls. It is not something an attacker can drive.
- This was an explicit plan choice (consult R-D.10), so this is a note on a known gap, not a bug.
- **Fix (either):**
  - On `c.status !== "committed"`, answer 502 `provider_unavailable` instead of the result.
  - Or keep the current behaviour and also log `credit_commit_noop`, so both cases show up for a reconciliation check.

**💭 3. The client never reuses an idempotency key.** `src/data/aiTagging.ts:54`, `src/data/aiOutfits.ts:51`
- Every call gets a fresh `crypto.randomUUID()`. A network drop after the server commits, followed by a user retry, charges a second credit and makes a second provider call.
- This is not a security hole, and the plan accepted it (R-E). Server-side replay is correct but unused in practice. Follow-up for F-706.7: reuse the key on retry of the same action.

**💭 4. The migration's owner_sub cast has no `btrim`.** `db/migrations/20261124120000_credit_ops_replay.sql:35,46`
- Same expression as `20261122120000_credit_ledger.sql:73`, and earlier migrations already validated the value. If it has stray whitespace, the cast fails and the migration rolls back; it never writes wrong data.
- Fine as is.

### Verified clean
- **No BYOK decrypt path remains.**
  - `openStoredKey` and `openKey` appear only in `server/ai/crypto.js` and tests.
  - `getSecret` appears only in `store.js` and tests.
  - `loadSettingsKey` is gone; the `/test` route is gone (`server/api.js:25-36`).
  - `routes.js` imports `sealKey` only (`server/ai/routes.js:10`).
  - The migration never writes `ai_settings`.
- **The shared key stays on the server.**
  - `appKeys.open` (`server/ai/appKeys.js:111-133`) swallows the decrypt error with no logging.
  - The key goes only into the `x-goog-api-key` header, not the URL (`gemini.js:112`).
  - `paidCall` logs fixed fields only; error bodies are `{code}`, plus `requestId` for internal errors.
- **Replay is scoped per user.** `findOp`, `reserve` and `settle` all filter `user_id = $1` (`credits.js:123,149`), on top of the forced `owner_only` RLS on `credit_ops` (`credit_ledger.sql:92-96`). Another user's op can never be found.
  - Same key with a different photo or body: rejected by the hash comparison at `paidCall.js:113` before anything is returned.
  - Same key with a different kind: `op_key_mismatch` gives 400 (`credits.js:191-193`).
  - A live reservation: 503 `ai_busy`.
  - A replay never reserves spend and never calls the provider.
- **No double charge.** The unique `(user_id, op_key)` index plus the per-user advisory lock and `on conflict do nothing` (`credits.js:206-225`) make a second reserve impossible.
- **The cap blocks before any provider call.** At the cap, `paidCall.js:132-141` refunds credits and answers 503 `ai_cap_reached` before `getInput`, and tag-photo uses `rejectUnread` (`tagPhoto.js:23-26,53`), so the body is never read.
  - Out of credits or welcome pending: refused at `mapReserve` before the body is read.
- **Upload DoS is bounded.** Tag-photo checks content-length, the in-flight slot, the limiter, the op key, the shared key, credits and spend before reading the 2 MB body (`tagPhoto.js:34-58`). Suggest reads a small capped JSON body before credits (`suggestOutfits.js:50-53`).
- **Refunds return no result.** Refunded ops only replay their stored error code (`paidCall.js:47-55`). An expired reservation gets refunded and 502. The only free-result paths are findings 1 and 2.
- **Migration.**
  - FORCE is lifted on the five data tables plus `credit_grants` and restored on all six (`:21-26`, `:48-53`). Files run in one transaction (`db/migrations/README.md:7`), so a failure cannot leave FORCE off.
  - `credit_settings` is readable through its `using (true)` select policy.
  - The insert uses the right partial-index conflict target.
  - The UPDATE only touches pending welcome rows of the same user set, so no cross-user data is mixed.
  - Note: any open-join account with data at deploy time gets approved welcome credits (A7, intended).
- **Stored results are protected.** `credit_ops.result` is covered by the forced owner-only policy, and results are route-built objects, not raw provider text. Retention is A9 debt.

### Follow-ups (out of scope)
- A6 (60 monthly credits before approval) together with finding 1 is the main exposure of the shared budget from open join. Ming should confirm A6 with this in mind.
- A8 (spend reservations never expire) and A9 (result retention): `debt` issues as planned.
- F-706.7: user-facing copy for `invalid_key` and `model_unavailable` now refers to the shared key, not the user's own key.
