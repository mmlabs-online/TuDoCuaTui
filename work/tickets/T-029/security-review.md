# Security review — T-029

## Attempt 1

## Security review: T-029, attempt 1 (branch ticket/T-029, read-only)

There are no blockers. Every focus point holds in the code as written. I found one should-fix: a race in the retry's completion handler. BUG-008 finding 3 stays latent and is not made worse.

I used Read and Grep only. I had no shell, so I did not run `git diff` or the checks; check results come from impl-log.md.

Prompt injection, RLS and secrets in the bundle do not apply here. No new `VITE_*` variables, LLM calls or SQL were added.

**Files reviewed (all under `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\`):**
- tokenStore.ts
- authChannel.ts
- accountId.ts
- AuthGate.tsx
- SignInScreen.tsx
- fakeTabs.ts
- identityClient.ts:147-154 (context)
- tokenStore.test.ts (only the retry tests)

### Findings

**🟡 1. A retry that finishes after a new sign-in in the same tab still clears storage and posts `signedOut` (tokenStore.ts:292-301; SignInScreen.tsx:120-161)**
- **What happens:** `retry()` checks `id !== null` only when it is called (:294). The `.then` at :295-300 runs `forgetStored(gone)` and posts `signedOut(gone)` without checking again.
- **Why the window is real:** While "Đang đăng xuất…" is showing, the sign-in form is still enabled. `submit` only checks `status`, not `retryingSignOut`. The `/logout` call can take up to `SIGN_OUT_WAIT_MS` waiting for the lock, plus the logout timeout.
- **Exploit path:** The user signs in again as the same account X while the retry is still pending.
  - `adopt` writes X to storage and sets `sessionAt = t1`.
  - The retry then confirms at t2 and clears `mm_account_id` while this tab holds X. It also posts `signedOut(X)` with `at = t2 > t1`.
  - Other tabs on X are signed out, which the user did not intend for the new session.
  - This tab never receives its own post, so it stays signed in with no stored id. A reload signs it out.
  - Depending on how Identity orders the work under the lock, the new session's server side may also be killed. The next `/token` call then fails closed with `session_invalid`.
- **Impact:** Integrity and UX only. Every outcome is an extra sign-out; no session leaks. The AuthGate seq guard (:393) only hides the UI result; the store side effects still happen.
- **Fix (one commit):**
  - In `retry`, capture `const gen = generation` before `logoutOnce(gone)`.
  - In `.then`, run `forgetStored(gone)` and the post only when `gen === generation && id === null`.
  - Optionally, also disable the sign-in submit and continue buttons while `retryingSignOut` is true.
- **Test to add (T8b):** start `retry()` with a pending logout, then `continueAs(ID)`, then resolve logout. Assert that storage still holds ID and that the probe saw no `signedOut`.

**🟢 2. No token or secret reaches localStorage or the fallback**
- In non-test code, `localStorage` appears only in accountId.ts (plus the existing theme and weather keys, which are unrelated).
- `storage.write` is called only with the account id (tokenStore.ts:256).
- Without an endpoint, `post` is a no-op (authChannel.ts:85-91), so the fallback writes nothing.
- The `signedOut` messages (:135, :298) carry only `accountId` and `at`.
- The token message (:168-175) is the existing D50 design over BroadcastChannel only.
- fakeTabs.ts is test-only; no app code imports it (checked by grep).

**🟢 3. The storage-event fallback cannot inject a session or sign out other accounts (accountId.ts:50-67; authChannel.ts:93-98; tokenStore.ts:233-248)**
- **What the watcher accepts:** only `key === mm_account_id`, `newValue === null`, a UUID `oldValue`, and a `storageArea` that is localStorage.
- **What it can produce:** only a `signedOut`, which `parseAuthMessage` re-validates. No `token` message can come from storage, so it cannot inject a session.
- **No cross-account effect:** `onMessage` drops anything whose `accountId` is not this tab's id (:234), so removing Y never affects a tab on X.
- **Who can trigger it:** storage events come only from same-origin documents. Anyone who can write this origin's localStorage already has XSS, so the fallback adds no attack surface.
- **What it does not cover:** a sign-out is missed when the shared slot holds another account (plan A9). This is accepted; BroadcastChannel is the primary path.

**🟢 4. The retry targets only the in-memory departing id (tokenStore.ts:273, 291-308; AuthGate.tsx:85-87, 257, 386-405)**
- `gone` is captured from `id` at sign-out time and closed over. It is never re-read from storage or props.
- AuthGate keeps only the closure, never the id.
- Each click makes at most one `/logout`: the store's `retrying` handles single-flight, and AuthGate's `retrying` ref adds a second guard.
- `/logout` sends `{ account_id }` with credentials (identityClient.ts:147-154). No token is involved.
- The "session again" guard works when the retry is called (tokenStore.test.ts:590-595). Finding 1 covers what happens after the call.

**🟢 5. No re-broadcast loops**
- `onMessage` calls `end(id, false)` (:246), and the AuthGate remote listener (:193-216) never calls `forget`/`signOut`. A received `signedOut` is never posted again.
- Token messages are not re-posted either (:235-243).
- **Fallback mode:** `end` → `forgetStored` clears only while storage still names `gone`. After a removal the slot is already null, so no second storage event fires.
- **No double post:**
  - signOut runs `end`, which bumps the generation, so a pending renewal's `session_invalid` catch returns early (:182).
  - join's catch also requires `gen === generation` (:354).

**🟢 6. The stale-message guard works as designed for BroadcastChannel (tokenStore.ts:85, 245, 253)**
- `sessionAt` is set in `adopt` only, and a `signedOut` with `at < sessionAt` is dropped. T6 covers it (tabs.test.ts:514).
- `parseAuthMessage` still bounds `at` to the window [now-10 s, now+5 s].

**💭 7. In fallback mode the stale guard has no effect (authChannel.ts:95)**
- The synthesized message uses the receiver's `now()`, so it always passes `at >= sessionAt`.
- **Theoretical race:** tab A removes X, tab B adopts X before that storage event is delivered, and B is then signed out.
- The failure only causes an extra sign-out, and storage events are not timestamped, so nothing can be done here. Accept and document.

**💭 8. Doc comment overstates the fallback (authChannel.ts:63-65)**
- The comment says a throwing `postMessage` "degrades to storage-event sign-out only". In the code, only a missing endpoint or a throwing constructor switches `subscribe` to the watcher. A throwing `postMessage` is just swallowed, and inbound still uses the endpoint.
- No security effect. Fix the wording.

**🟡 9. BUG-008 security finding 3, re-checked against the new code (AuthGate.tsx:159-179): still latent, not made worse**
- The `seq === signOutSeq.current` re-list path at :168 still depends on how the id was cleared, not why.
- **New ways the id can be cleared during `offerJoin`'s `checking`:**
  - Store-level `end` from `session_invalid` in renew or join. This is the real `session_invalid` the re-list is meant for, so it is correct.
  - A fallback/BroadcastChannel `signedOut` from another tab. This goes through `onRemoteSignOut`, which bumps `signOutSeq`, so the account is not re-listed. Correct.
- **Unchanged:** T-029 adds no same-tab `forget()` caller during `checking`. `onRetrySignOut` does not touch `id`.
- **Net effect:** across tabs, T-029 actually narrows the risk. `forget()` and `onAuthLost` now broadcast, so a tab B in `offerJoin` gets a seq bump instead of a silent clear.
- **Still open:** the same-tab hazard (a future `forget()` during `checking` re-offers the account the user deliberately left) is still there.
- **Fix:** keep the BUG-008 follow-up. Bump `signOutSeq` (or a "user left" seq) in every AuthGate handler that calls `store.forget()` (:273, :424, :496, :521). Alternatively, have the store report the reason the id was cleared.

### Follow-ups (outside this ticket, R7)
- **BUG-008 finding 3:** as above. Check that the `debt` issue exists (label `project:tudocuatui`).
- **Windows-only failure in `boundary.test.ts`:** it fails on the `src\main.tsx` path separator (impl-log). That test enforces the `localStorage`/`BroadcastChannel`/`fetch(` allowlist this ticket depends on. Confirm it is green on WSL/CI before merge.
- **High paths gap:** `.claude/loop.config.md` › High paths still leaves out `src/features/auth/**` (plan A11).
