## Attempt 1 — 2026-11-19 — security-ai-generated-code-auditor

Security review of T-028.2, attempt 1 (security-ai-generated-code-auditor)

**Verdict: PASS.** There are no blockers. One should-fix (the wording of the warning shown when sign-out is not confirmed) needs Ming's word because the copy was approved as A6. Everything else is notes or follow-ups.

I read the files directly. I could not run git or the checks. The green checks come from impl-log.md and I did not re-verify them.

## What I checked and found clean

- **What crosses the BroadcastChannel.** Only `{v, type, accountId, accessToken, expiresAt, at}` for a token and `{v, type, accountId, at}` for a sign-out (`tokenStore.ts:133-140, 241`). No refresh secret exists client-side. The HttpOnly `mm_device` cookie is never readable. The channel is same-origin and partitioned by the browser.
- **Message validation** (`authChannel.ts:37-55`):
  - A plain non-array object with `v === 1` is required.
  - `accountId` must match the UUID pattern.
  - `at` must fall within [now − 10 s, now + 5 s].
  - The token is 1–8192 characters from `[A-Za-z0-9._-]`.
  - `expiresAt` is a finite number within (now, now + 24 h].
  - The result is a fresh object with only the known fields; unknown fields are dropped.
- **Account binding.** Messages for another account are ignored, compared case-insensitively (`tokenStore.ts:202`). A signed-out tab (`id === null`) never adopts a token. Adoption needs `msg.at > tokenAt` and at least 60 s of life left (`:204`), so an older token or a replay within 10 s is not re-adopted. An adopted token is never re-broadcast.
- **A remote sign-out can only shrink a session.** The handler at `:213-217` only resets state: it bumps the epoch, clears memory and `mm_account_id`, and disarms the timer. It cannot install a token or change the account.
- **Late `/token` answers.** The epoch is checked before the lock body, after the yield, after `client.token`, and in the error path (`:121, 124, 127, 147`). A dropped answer is not broadcast and arms no timer.
- **Sign-out ordering** (`:233-262`):
  - It clears local state and storage first, then broadcasts, then waits for its own running renewal (up to 5 s), then calls `/logout` under the lock (up to 5 s).
  - If the lock cannot be had, it falls back to calling `/logout` without the lock. `/logout` is never skipped.
  - It never rejects. `confirmed` is true only for 2xx or `session_invalid`, as A5 says.
- **Notice guard.** The `signOutSeq` guard in AuthGate (`AuthGate.tsx:177-186`) only upgrades a still-current `signed_out` notice, so a late answer cannot overwrite a newer screen.
- **UI after a remote sign-out.** The handler (`AuthGate.tsx:121-140`) retires the app generation before unmounting. Restore and sign-in enter the app only if `store.accountId()` is still set (`:147, 246`).
- **`/token` timeout** is `AbortSignal.timeout(15000)` (`identityClient.ts:127`). An abort maps to `network`, so it never clears the session.
- **Web Locks** (`refreshLock.ts:40-58`):
  - When locks are missing, `request` throws, or the wait is aborted, `fn(false)` runs. `fn` runs at most once.
  - Errors from `fn` after the lock was granted propagate.
  - The fallback only loses cross-tab single-flight. Every security check stays in place.
- **BroadcastChannel fallback.** A missing or throwing channel degrades to a no-op (`authChannel.ts:57-104`). There is no storage fallback for tokens.
- **No token in storage, URLs or logs.** The only `localStorage` use in the auth folder is `accountId.ts`. There is no `console.` or `sessionStorage` outside tests. `boundary.test.ts:21-42` enforces this, including the new entries that keep `navigator.locks` in `refreshLock.ts` and `BroadcastChannel` in `authChannel.ts`.
- **R3 (no secrets in client code).** `config.ts` holds only public values: the Identity base URL, the app key, the Turnstile site key (public by design) and the lock and channel names. No `VITE_*` variable is used in `src/features/auth`. No secret was introduced.
- **`fakeTabs.ts`** is imported only by `AuthGate.test.tsx`, `authChannel.test.ts`, `refreshLock.test.ts` and `tabs.test.ts`. No production module imports it, so Vite will not bundle it.
- **Resend → 409 `email_already_verified`** (`AuthGate.tsx:311-316`) only re-runs the normal restore. Identity still decides whether a token is issued, so the client trusts nothing new.

## Findings

### 🟡 Should fix

**S1. The shared-computer warning promises something that is not true** (`src/features/auth/copy.ts:16-17`, approved as A6).
- **Risk:** the copy tells the user that on a shared computer they should close all browser windows. The `mm_device` cookie is persistent: per org-admin-api ADR-0004 §1, `Max-Age` is the idle timeout. Closing windows therefore does not end the device session. When `/logout` was not confirmed, the mmlabs account session may still be live on that browser. The next person could get a token without a password, through this app's account list (T-028.3) or through another mmlabs app.
- **Fix:** change the advice to something that actually ends the session, for example: "…Nếu đây là máy dùng chung, hãy kết nối mạng rồi đăng nhập và đăng xuất lại, hoặc xoá dữ liệu duyệt web (cookie) của trình duyệt này."
- **Decision needed:** the current copy was approved by Ming, so the orchestrator should raise this with him rather than change it silently.
- **Follow-up:** a "Thử đăng xuất lại" action that re-calls `client.logout(goneId)` would give the user a way to retry, which they do not have today (see Follow-ups).

### 🟢 Notes

**N1. The sign-out wait is shorter than the `/token` timeout** (`tokenStore.ts:43, 242-257` vs `identityClient.ts:34`).
- Sign-out waits at most 5 s for its own renewal plus 5 s for the lock. A hung `/token` can run for 15 s. After about 10 s, `/logout` can race a still-running `/token`, which may rotate the cookie.
- This is not exploitable: per ADR-0004 §10, `/logout {account_id}` revokes the account session on the server (and also works with the previous cookie value), so a rotated cookie cannot bring a revoked account session back.
- No change is needed. If you want the "wait for a running renewal" promise to hold literally, set `SIGN_OUT_WAIT_MS` to at least 15 000 for the own-renewal wait.

**N2. Spoofed or replayed messages from same-origin script.**
- Any script on the app's origin could post a token message with the right `accountId` and an access token it chose. This tab would then send that bearer token to the Node API (account confusion), or the script could force a sign-out.
- This needs same-origin code execution, which already means full compromise: such a script could wrap `fetch` or call `/token` with credentials. Accepted.
- Hardening, optional: before adopting, decode the JWT payload (no verification) and require `exp * 1000` to be within about 2 s of `msg.expiresAt` and `aud === APP_KEY`. A `sub` check is not possible because `sub` is the user id, not the account id (ADR-0005 §5).
- Keep TuDoCuaTui on its own origin, not a path shared with other apps, so no other app's script can see channel `tudocuatui-auth`.

**N3. Without BroadcastChannel, other tabs keep a working token after sign-out.**
- They keep it until their next renewal fails, which can be up to about 12 h (D46). Access tokens are not revoked on the server (ADR-0005 §6), so they keep working against the API.
- This matches what happened before this ticket, is documented in the plan, and is covered by F2. Every current browser has BroadcastChannel. Accepted.

**N4. Nothing stops production code from importing `fakeTabs.ts` later.**
- It is safe today, but add `fakeTabs: []` to `ALLOWED` in `boundary.test.ts:21`. Test files are already excluded, so any future production import would then fail the test.

**N5. Stale message just after signing in again.**
- If a tab signs in to the same account within 10 s of another tab's renewal broadcast, `tokenAt = 0` after `reset()` lets it adopt that recent token. It is still a valid token for the same account, so there is no cross-account effect. No action.

## Follow-ups (out of scope, R7)
- F1 (already in the plan): broadcast `signedOut` on `session_invalid`, `forget()` and `onAuthLost`. Today the other tabs only notice at their next renewal.
- F2 (already in the plan): fall back to a `storage` event for sign-out when BroadcastChannel is missing.
- New: a "retry sign-out" action on the `logout_unconfirmed` notice that re-calls `/logout` for the remembered account id (kept only in memory). This pairs with S1.
- New: the boundary-test entry from N4.

Files reviewed (all in /home/user/TuDoCuaTui/src/features/auth/):
- authChannel.ts
- refreshLock.ts
- tokenStore.ts
- identityClient.ts
- AuthGate.tsx
- config.ts
- copy.ts
- fakeTabs.ts
- boundary.test.ts

Server contract checked in /home/user/org-admin-api/docs/adr/0004-device-sessions-and-login.md and /home/user/org-admin-api/docs/adr/0005-access-token-signing.md.
