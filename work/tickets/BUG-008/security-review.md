# Security review — BUG-008

## Attempt 1

## Security review: BUG-008, attempt 1 (branch ticket/BUG-008, read-only)

I found no blockers. The diff is client-side auth state only: it decides when the "Tiếp tục với" account list shows. It adds no new secrets, network calls or authorization decisions, and nothing changes at R1, R3 or R4. I read the final file content with Read and Grep only. I had no shell, so I could not run `git diff` or the checks; check results are taken from impl-log.md. Prompt injection, RLS and secrets in the bundle are not touched by this change.

**Files reviewed:**
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\AuthGate.tsx
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\AuthGate.test.tsx (T1–T3 at :1019-1061, plus the existing :537)
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\tokenStore.ts (context only)

### Findings

**🟢 1. Fix tightens account exposure on shared devices — AuthGate.tsx:141-147**
- `clearAccounts()` now runs in `failTo`'s retry and `else` branches.
- It bumps `listSeq` (:125), so a late cold `/accounts` answer is dropped (:113). The stale list of accounts signed in on this browser no longer survives a failed continue followed by retry.
- The `email_unverified` branch (:131-135) and the `session_invalid` branch (:136-140) are unchanged, as planned.
- This brings the code in line with A2. No fix needed.

**🟢 2. The `signOutSeq` guard holds against the remote sign-out race — AuthGate.tsx:157-163**
- In tokenStore.ts:212-230, `onMessage` clears the id and calls the remote listeners synchronously. The listener at AuthGate.tsx:190 bumps `signOutSeq` before `accountEmail()` resolves (it returns `null` once the generation changes, tokenStore.ts:321).
- So after another tab signs out, `failTo` is skipped and the account just signed out is not re-listed.
- T3 (:1046-1061) covers this. impl-log says T3 fails when the guard is removed.
- `live()` still runs first (:159), so the restore effect's cleanup still wins.

**🟡 3. Re-listing depends on how the id was cleared, not on why — AuthGate.tsx:160-163 (latent; should-fix only if a new caller appears)**
- The re-list path runs whenever the id becomes null during the join lookup and no remote sign-out was seen. In this tab, `store.forget()` (tokenStore.ts:283-289) clears the id without posting `signedOut` and without bumping `signOutSeq`.
- Today no AuthGate code calls `forget()` while the view is `checking`. The existing callers are `onUseOtherAccount` (join and unverified views), `onAuthLost` (ready view) and `resendVerification` (unverified view). So the only real trigger is the store's own `session_invalid`, and re-listing there matches the Identity contract.
- T2 (:1030-1044) simulates the case with `s.store.forget()` and asserts that the same account *is* re-offered. That locks in "forget during lookup → re-list".
- Risk: if a later change (for example T-031) calls `forget()` from a user action ("Dùng tài khoản khác", lost session) while a join lookup is pending, the account the user deliberately left would be offered again on a possibly shared device, which breaks A2.
- Fix (follow-up, not this diff): bump `signOutSeq` (or a dedicated "user left" seq) in every AuthGate handler that calls `store.forget()`. Alternatively, make the store report why the id was cleared, and route to `failTo({ code: "session_invalid" })` only for a real `session_invalid`.

**🟢 4. Tests contain no secrets or real identities**
- T1–T3 use mock IDs and `me@b.co`-style fixtures, and no tokens beyond the fake channel message shape.

**🟢 5. Fail-closed behaviour is kept**
- Every new path ends on `signed_out`, `retry` or the existing `failTo`. None of them can mount the app without a token: `enterReady` is still only reached after a successful `restore`, `signIn`, `continueAs` or `join`, with `accountId() !== null`.
- The session_invalid route does not need a `store.forget()`, because the guard runs only when `accountId()` is already `null` (:160). T2 asserts `s.stored()` is null.

### Follow-ups (outside this ticket, R7)
- Finding 3: add a `signOutSeq` bump (or a "reason" signal) to every `forget()` call in AuthGate, before any new code can call `forget()` during `checking`. Log it as a `debt` issue with label `project:tudocuatui`.
- Plan.md already lists this one: `.claude/loop.config.md` › High paths leaves out `src/features/auth/**`, while CLAUDE.md marks it High. I agree it should be aligned so auth tickets always get the plan gate.
- impl-log reports 7 failing tests on Windows that fail without this change as well (Windows path separators and socket resets). That includes `src/features/auth/boundary.test.ts`, which is a security-relevant boundary test. Confirm it passes on WSL/CI before merging so the auth boundary check is not silently skipped.
