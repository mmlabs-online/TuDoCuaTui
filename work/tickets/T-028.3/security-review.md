## Attempt 1 — 2026-11-19 — security-ai-generated-code-auditor

## Security review: T-028.3, attempt 1 (REVIEW stage, read-only)

I read these files in full: `/home/user/TuDoCuaTui/src/features/auth/{tokenStore.ts, identityClient.ts, AuthGate.tsx, SignInScreen.tsx, UnverifiedScreen.tsx, accountId.ts, preview/AuthPreview.tsx}`. I also read `copy.ts` (new keys only), the plan, the ticket, impl-log, and the contract rows in `/home/user/org-admin-api/docs/consumers.md` (l.50, 52, 100-109, 164-179, 206-207). For tests I only checked which ones exist (identityClient accounts tests l.213-233; the XSS test at `UnverifiedScreen.test.tsx:58`); I did not read them in full. I could not run git or the checks. The check results below come from impl-log.

### Findings

**No 🔴 blockers.**

**No 🟡 should-fix.**

**🟢 notes (all safe as written; no change needed for PASS):**

1. **The `accounts()` check is right and strict enough.** `identityClient.ts:179-193`:
   - It keeps only `account_id` (must match `UUID_RE`) and `email` (must be a non-empty string).
   - It drops `email_verified` and `display_name`.
   - A body that is not an array gives `[]`.
   - The 5 s `AbortSignal.timeout` (`:181`) also covers the body read: an abort during `res.json()` becomes `json = null` → `[]`, so the form shows.
   - The email has no length cap. Identity is the trust boundary, and the email renders as React text with `break-all` (`SignInScreen.tsx:94-97`) or `overflowWrap: anywhere` (`UnverifiedScreen.tsx:21`), so it cannot cause XSS.
   - Optional hardening: cap the email at ~320 characters in the parser.
   - The list buttons have no markup test of their own; React escaping makes this safe, and `UnverifiedScreen.test.tsx:58` covers the same idea.

2. **`continueAs` cannot take another account's token or sign out another tab.**
   - `tokenStore.ts:226-232`: `adopt()` = `reset()` (new epoch), set `id`/`email`, `storage.write`, `renew()`. It sends no `signedOut` and no `/logout`.
   - The token always comes from Identity's `/token` for that id, behind the device cookie. The id is UUID-checked by the client, and `readAccountId` checks it again on read (`accountId.ts:9`).
   - Cross-tab messages are keyed by the lower-cased `accountId` (`tokenStore.ts:207`), so a tab signed in as X ignores Y's token broadcast.
   - Known, plan-listed side effect (follow-up, not a vulnerability): the shared `mm_account_id` now holds Y, so tab A switches to Y on reload, and A signing out X later clears B's stored Y.

3. **Late answers are dropped correctly.**
   - Store side: a `/token` answer from an older epoch resolves `null` on success (`:131`) and is swallowed on error (`:151`). So a remote sign-out during a continue gives `accountId() === null`, and no `enterReady` (`AuthGate.tsx:411`).
   - List side: `listSeq` (`AuthGate.tsx:104,112,124`) drops a stale list.
   - Double click: the `continuing` ref (`:403`) plus `disabled={submitting}` (`SignInScreen.tsx:91`) mean one `/token`.
   - impl-log is right that "remote sign-out while the list loads" cannot happen: with no id, the store ignores `signedOut` (`tokenStore.ts:207`).

4. **A2 holds: the just-left account is not one click away in the same tab.**
   - Own sign-out (`AuthGate.tsx:257`), `onAuthLost` (`:266`), remote sign-out (`:202`), "Dùng tài khoản khác" on the join screen (`:468`) and on the unverified screen (`:493`) all call `clearAccounts()`.
   - `loadAccounts` is only called at mount with no stored id (`:178-181`) and on `session_invalid` in `failTo` (`:135-138`). At that point Identity has already dropped the account, so the server will not list it.
   - Remaining exposure is A7, accepted by Ming: a cold reload lists every live device session, including one whose `/logout` was not confirmed, and any account left via "Dùng tài khoản khác" (that path uses `forget()` and no `/logout`). This is already in the plan's follow-ups ("không phải tôi" option).

5. **Small plan deviation in the safe direction (for the main reviewer).** The plan (step 3) says a `session_invalid` re-list also covers join. The join catch at `AuthGate.tsx:438` sets `signed_out` directly and does not go through `failTo`, so a `session_invalid` there shows the form without a list. That is more conservative, not a risk. Either accept it or route it through `failTo` in a later ticket.

6. **Verification cannot be skipped.**
   - "Tôi đã xác minh email" (`:483-488`) and resend 409 `email_already_verified` (`:384-389`) only re-run restore, which calls `/token`. Identity still decides and answers 403 again if the email is not verified, which shows `still`.
   - Resend uses `store.accountId()` and sends no client-supplied email. Resend `session_invalid` → `forget()` + `failTo` (`:391-396`).
   - The unverified view only appears while an id is held (`:130`).

7. **No leaks to console, URLs or storage.**
   - `boundary.test.ts:24-42` bans `console.`, `sessionStorage` and `innerHTML`/`dangerouslySetInnerHTML` in auth, and allows `localStorage` only in `accountId.ts`. Only `mm_account_id` is written.
   - The access token stays in the store closure (it is also posted on the BroadcastChannel, which is existing T-028.2 design).
   - No email, id or token goes into a URL (`/auth/accounts` has no query; the id goes in POST bodies).

8. **The preview cannot reach production.** `preview/main.tsx` renders nothing under `import.meta.env.PROD`, and `auth-preview.html` is not a `vite build` input (confirmed in the T-019.11 review/security-review). It uses fixed `@example.com` data and calls no client.

9. **R3: no secrets in client code.** No new env variables, keys or `VITE_*` in the diff. `X-MM-App` is a public app key.

### Follow-ups (out of scope, R7)
- Only clear `mm_account_id` on sign-out if it still holds the departing id (already in the plan).
- Optional: cap the email length in the `accounts()` parser.
- Optional: send join's `session_invalid` through `failTo` to match the contract's "re-list".

### Verdict: **PASS** (security). This assumes the checks in impl-log are green; the main reviewer should confirm them, since I could not run them.
