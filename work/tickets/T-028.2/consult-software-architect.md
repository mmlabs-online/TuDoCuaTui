# Consult — software-architect — T-028.2 (cross-tab session, proactive renewal, sign-out)

## Findings (current behaviour)

- **What is stored.** The access token is held only in the store closure (`src/features/auth/tokenStore.ts:48-49`). The only value on the device is `mm_account_id` (`accountId.ts`, try/catch around every `localStorage` call). The renewal credential is the HttpOnly `mm_device` cookie on the Identity origin (`identityClient.ts:58`, `credentials: "include"`), and JS can never read it. So the only thing that *can* be broadcast is the access token (plus the non-secret account id). There is no refresh secret to leak.
- **The epoch counter already exists.** `generation` (`tokenStore.ts:50`) is bumped by signIn, signOut and forget (`:104,117,130`), and a late `/token` answer is dropped (`:64,70`). Reuse it; do not add a second counter.
- **Single-flight is per tab only.** `inflight` (`tokenStore.ts:51,57,83`). Refresh is lazy: `validUntil = now + (expiresIn − 60 s)` (`:66`), checked in `getToken` (`:89`). There is no timer.
- **A failed refresh drops the token on any error** (`tokenStore.ts:71`), including a network error. That is harmless for a lazy refresh, but wrong for a proactive one, where the token is still valid for about 60 s.
- **Sign-out does not wait for a running renewal.** `signOut` nulls `inflight` and goes straight to `/logout` (`tokenStore.ts:115-128`). The result is swallowed (`:125-127`), so the caller cannot tell whether the logout was confirmed. AuthGate fires and forgets it (`AuthGate.tsx:151`) and shows the `signed_out` notice at once (`:154`).
- **`client.token` has no timeout.** Compare `identityClient.ts:119-121` with `logout`'s 5 s `AbortSignal.timeout` (`:32,138-145`). Once `/token` runs under a cross-tab lock, a hung holder would block every tab.
- **Store events carry only `AuthError`** (`tokenStore.ts:20,93-95`). AuthGate reacts only while `ready` (`AuthGate.tsx:131-140`). There is no channel for "signed out elsewhere".
- **409 `email_already_verified` on resend** is shown as an error with the copy "Email đã được xác minh. Bạn có thể đăng nhập." (`AuthGate.tsx:266-276`, `copy.ts:110`). `VerifyEmailPage.tsx:58` maps it to `verified`, and its Continue button leads back into AuthGate's restore (`AuthRoot.tsx:30-34` → `AuthGate.tsx:117-128`), so that path already ends in a token.
- **authFetch** retries a 401 once with `getToken(first)` (`src/data/authFetch.ts:44-46`) and calls `onAuthLost` on a second 401 (`:47-49`). Any other status, including T-028.1's 503 `auth_unavailable`, passes through with no retry and no sign-out (`:44,47`; T-028.1 AC8 tests). No code change is needed here.
- **The store is built in a `useState` initializer** (`AuthRoot.tsx:22-23`) under `React.StrictMode` (`main.tsx:37`). Opening a channel or adding listeners inside `createTokenStore` would run twice in dev and leak.
- **Test environment.** jsdom has no `navigator.locks`. Node 22 does expose a global `BroadcastChannel`, which is real, cross-instance, and keeps the event loop alive. Tests must always inject fakes and never rely on the globals.

## Recommendations

### 1. Module boundaries (ticket "new broadcast/lock helpers"; R7)
- **`src/features/auth/refreshLock.ts`**: `createRefreshLock({ locks = detectLocks(), name = AUTH_LOCK_NAME })` returns `{ run<T>(fn: () => Promise<T>, opts?: { waitMs?: number }): Promise<T> }`.
  - Detect support with `typeof navigator !== "undefined" && typeof navigator.locks?.request === "function"`.
  - Wrap `request` in try/catch, because it can throw `SecurityError` in opaque or sandboxed contexts.
  - Abort the *wait* with `signal: AbortSignal.timeout(waitMs)`. On `AbortError`, or when locks are missing, run `fn()` without a lock. The per-tab `inflight` still single-flights, and correctness never depends on the lock.
- **`src/features/auth/authChannel.ts`**: `createAuthChannel({ create = detectChannel(), name = AUTH_CHANNEL_NAME })` returns `{ post(msg), subscribe(fn) → unsubscribe, close() }`.
  - It is a no-op object when `BroadcastChannel` is missing or its constructor throws. `post` is wrapped in try/catch.
  - It also exports the pure `parseAuthMessage(raw: unknown, now: number): AuthMessage | null`, which is the only place messages are validated.
- **`config.ts`**: `AUTH_LOCK_NAME = "tudocuatui-auth-refresh"`, `AUTH_CHANNEL_NAME = "tudocuatui-auth"`.
- **`tokenStore.ts`** stays the single owner of auth state. It gets new injectables: `lock`, `channel`, `timers` (`{ setTimeout, clearTimeout }`, defaulting to globals) and `doc` (for `visibilityState` and listeners). The defaults keep the existing tests' `createTokenStore({ client, storage, now })` calls working.
- **Lifecycle:** add `start(): () => void` (idempotent). It subscribes to the channel, adds the `visibilitychange`, `pageshow` and `online` listeners, and arms the timer. The returned function undoes all of that. Call it from a `useEffect` in `AuthRoot` (or AuthGate), not from the constructor. This is StrictMode-safe.
- **Events:** widen `subscribe` to a discriminated union: `{ type: "error", error: AuthError } | { type: "signedOut", source: "remote" }`. Alternatively, add a separate `onRemoteSignOut(fn)`. Either works; the union keeps one subscription in AuthGate.

### 2. Message schema (ticket "Messages are validated")
- `{ v: 1, type: "token", accountId, accessToken, expiresAt, at }` and `{ v: 1, type: "signedOut", accountId, at }`.
- **Recommend adding `accountId`** to both messages. The ticket shows `{type:"signedOut"}` and a token message without it (open question 1). Reason: a device can hold several mmlabs accounts (T-028.3's "Continue as" list), so a tab signed in as Y must never adopt X's token or be signed out by X's logout. The account id is already in `localStorage`, so it is not a secret.
- `parseAuthMessage` rejects a message unless all of these hold:
  - It is a plain object with `v === 1` and a known `type`.
  - `accountId` matches the UUID regex.
  - For tokens: `accessToken` is a string with length 1..8192 matching `/^[A-Za-z0-9._-]+$/`.
  - `expiresAt` is finite and in `(now, now + 86_400_000]`, mirroring `EXPIRES_MAX` at `identityClient.ts:31`.
  - `at` is finite and in `[now − 10_000, now + 5_000]`. This is the 10 s adoption window, and it also rejects messages from frozen tabs or replays.
  - Unknown fields are ignored and never copied.

### 3. Per-tab state machine (ticket AC 1-4)
States:
- `SignedOut` (id = null)
- `NoToken` (id)
- `Valid` (token, expiresAt, validUntil = expiresAt − 60 s, tokenAt)
- `Renewing` (inflight, epoch = generation captured at start)

`renew(rejected?)`, used by `getToken`, `restore`, `signIn`, `join`, the timer and wake events:
1. If `inflight` is set, return it (per-tab single-flight, as now).
2. Capture `epoch = generation`, then set `inflight = lock.run(async () => { … }, { waitMs: 20_000 })`. Inside the callback:
   - If `epoch !== generation`, return `null`.
   - `await yieldTask()` (one `setTimeout(0)`). Lock grant and channel delivery are not ordered across processes, and this lets a just-posted message dispatch first.
   - **Double-check:** if `fresh() && token !== rejected`, return `token`. Another tab renewed while this one waited, so there is no `/token` call. This is what makes AC1 ("one `/token` call, both get the token") hold.
   - `r = await client.token(id)`. If `epoch !== generation`, return `null`. This drops the answer and does not broadcast it (AC3).
   - Set `token`, `expiresAt = now + expiresIn·1000`, `validUntil`, `tokenAt = now`.
   - `channel.post({type:"token", …})` **while still holding the lock**.
   - Re-arm the timer and return the token.
3. Errors:
   - Clear the token, and notify (as today), only for `session_invalid`, `not_member` and `email_unverified`. `session_invalid` also clears the id and storage, as at `:72-76`.
   - For `network`, `rate_limited` and `unknown`, keep a token that is still valid, rethrow to a lazy caller, and let a proactive caller re-arm a retry in about 15 s (never past `expiresAt`).

**Receiving a token message:** adopt it only if all of these hold:
- the tab has an id, and `msg.accountId === id`;
- `msg.at > tokenAt` (older tokens are ignored, AC2);
- `msg.expiresAt − 60 s > now`.

Then set the token fields from the message and re-arm the timer. Do **not** re-broadcast.

**401 path:** `getToken(rejected)` returns an adopted token when `token !== rejected && fresh()`, with no network call. That covers "a 401 adopts a token broadcast within 10 s". Otherwise it renews through the lock.

**Proactive timer (AC4):**
- One handle, armed for `clamp(validUntil − now, 0, 2^31 − 1)`. Tokens are at most 12 h (D46) or at most 24 h (code bound), so the clamp is only a guard.
- When it fires, re-check the wall clock (`now() >= validUntil`). Renew if `doc.visibilityState === "visible"`; otherwise skip and leave it to lazy `getToken`, adoption, or the wake handler. This avoids N background tabs contending.
- Disarm on signOut, forget, signIn and remote sign-out.

**Wake handling (sleeping laptops, throttled background tabs):**
- On `visibilitychange` → visible, `pageshow` and `online`: `if (id && (token === null || now() >= validUntil)) void renew()`. Swallow non-notify errors here.
- `setTimeout` pauses while the machine sleeps and is throttled in background tabs (Chrome: about once a minute after 5 min hidden). The wall-clock check and the lazy check in `getToken` stay the source of truth; the timer is only an optimisation.

### 4. Sign-out ordering (ticket "Sign-out", AC3, AC5)
`signOut(): Promise<{ confirmed: boolean }>`:
1. `gone = id`; `generation++`; `inflight = null`; clear token, id and email; disarm the timer; `storage.clear()`.
2. `channel.post({ type: "signedOut", accountId: gone, at })`.
3. If `gone` is null, return `{ confirmed: true }`.
4. `await lock.run(() => client.logout(gone), { waitMs: 5_000 })`.
   - Requesting the same lock *is* "wait for a running renewal", in this tab or any other: the lock is granted only when the holder's `/token` finishes, and that holder drops the result by epoch.
   - Do **not** await this tab's `inflight` inside the lock callback. That would be redundant, because the lock already waited for it.
   - Without Web Locks, `await` the captured `inflight` with a 5 s cap, then log out.
   - Why wait at all: a `/token` racing `/logout` can carry a rotated `mm_device` cookie (org-admin R11 rotation and grace), and could issue a 12 h token for a session that is being revoked.
5. Confirmed means 2xx, or 401 `session_invalid` (nothing left to revoke). Unconfirmed means `network` (which includes the 5 s timeout), `rate_limited` or `unknown`. `signOut` never rejects. The worst-case wait is about 10 s, and it never blocks the UI.

**On a received `signedOut` with a matching `accountId`:**
- `generation++`, clear memory (and storage, idempotently), disarm the timer, emit `{type:"signedOut", source:"remote"}`.
- No `/logout` and no re-broadcast.
- AuthGate: if `ready`, `retireApp()`, `flushSync` to `checking`, then `signed_out` with notice `"signed_out"`. A tab on the join screen or sign-in screen also goes to sign-in.

**AuthGate `onSignOut` (`AuthGate.tsx:147-155`):**
- Keep the immediate `signed_out` view.
- Add `signOutSeq = useRef(0)`.
- When `store.signOut()` resolves with `confirmed: false`, and the seq is unchanged, and the view is still `signed_out`, set `notice: "logout_unconfirmed"`.
- Add the new notice to `types.ts` (`SignInScreenProps.notice`), to the View union (`AuthGate.tsx:29`), to `SignInScreen.tsx:49-53`, and its copy to `copy.ts` (R6). Example copy: "Chưa xác nhận được đăng xuất khỏi mmlabs. Nếu đây là máy dùng chung, hãy đóng trình duyệt."
- Bump the seq on sign-in, `goto` and remote sign-out so the warning never lands on a newer view.
- Check it at 390 px and in dark mode (R9).

### 5. 409 `email_already_verified` (ticket bullet 5, AC6)
In `AuthGate.resendVerification` (`:266-276`):
- On `err.code === "email_already_verified"`: reset the resend state, set the view to `checking`, then `store.restore()` (which goes through the lock).
  - Success → `enterReady()`.
  - An error → the existing `onTokenError` (`not_member` with join available → offer join; the others → `failTo` or sign-in with the error).
- Guard with a liveness check, because the user may navigate away meanwhile.
- Leave `VerifyEmailPage.tsx:58` alone. It already continues into restore, and T-028.3 owns the verify screen.

### 6. authFetch and the T-028.1 503
- `authFetch.ts` needs no code change. 401 → `getToken(first)` → an adopted or renewed token → one retry. A second 401 → `onAuthLost` (`:47-49`).
- 503 `auth_unavailable` passes through: no renewal, no sign-out (`:44,47`).
- The store must never interpret API statuses. Proactive renewal only reduces how often the 401 path runs.
- Identity `/token` errors without a known code map to `unknown` (`errors.ts`) and go to the retry view on restore. During proactive renewal they keep the still-valid token (rec. 3).
- Add a test that `getToken(rejected)` returns a broadcast token without calling `/token`.

### 7. Security (ticket AC7; R3)
- Broadcast only the access token, its `expiresAt` and the account id. Nothing else secret exists client-side, since the cookie is HttpOnly on another origin.
- `BroadcastChannel` is scoped to the same origin and the same storage partition. Exposure is equivalent to the in-memory token, because any same-origin script could already call `getToken`.
- **Never** fall back to `localStorage` or `sessionStorage` to carry a token when `BroadcastChannel` is missing.
- Use one channel instance per store. The sender's own instance does not receive its own messages, which prevents ping-pong.
- Never log messages or tokens (no `console.*`). Extend the existing "no history or console use" test (`tokenStore.test.ts:192`) to cover channel posts and storage writes during a renewal and a sign-out.
- Optional fallback for sign-out without `BroadcastChannel`: a `storage` event where `key === "mm_account_id"`, `oldValue === id` and `newValue === null` → remote sign-out (open question 3).

### 8. Test strategy (R8; loop-config bug level = Vitest/jsdom)
- **Shared fakes** in `src/features/auth/testTabs.ts` (test-only), or inline:
  - `createFakeLocks()`: an exclusive FIFO lock shared by several stores, honouring `signal` aborts.
  - `createFakeChannelHub()`: N endpoints; delivery via `queueMicrotask` or a manual `flush()`; never delivered to the sender.
  - Two `createTokenStore` instances ("tabs") with separate in-memory storage, or one shared storage to mirror `localStorage`.
- **Timers:** `vi.useFakeTimers()` with `now: () => Date.now()`, driven by `vi.advanceTimersByTimeAsync`. Keep the existing injected-`now` tests unchanged.
- **Cases → ACs:**
  - two tabs, a parallel `getToken` → `client.token` called once, both resolve to the same token (AC1);
  - A renews; B's `getToken(B_old)` returns A's token with zero calls; a message with `at` older than 10 s, or older than B's `tokenAt`, is ignored; a message with another `accountId` is ignored (AC2);
  - A signs out → B's subscriber gets `signedOut` and B's `getToken` returns null; B's `/token` resolving after the signedOut is dropped (no token, no broadcast) (AC3);
  - signOut waits for an in-flight renewal before `logout` (call order);
  - the timer fires at `exp − 60 s`; a hidden tab skips it; `visibilitychange` after a simulated sleep (`setSystemTime` past `validUntil`) renews (AC4);
  - `signOut` resolves `{confirmed:false}` on network or timeout and `true` on 204 or `session_invalid`; AuthGate shows the warning notice, and it does not overwrite a newer sign-in (AC5);
  - resend 409 → `/token` → App rendered (AC6);
  - `parseAuthMessage` table tests;
  - `createRefreshLock` and `createAuthChannel` with `undefined` or throwing globals behave as no-ops or run directly; the store works with `localStorage` throwing (AC7);
  - `start()` twice and its cleanup leave no listeners or timers.
- Optional, recorded in impl-log (loop config: real browser APIs are invisible to jsdom): a one-off Playwright run with two real tabs, checking one `/token` and cross-tab sign-out.

## Risks
- **Lock grant and channel delivery are not ordered across tabs.** In the worst case two `/token` calls happen. That is harmless; the `yieldTask` makes it rare. Tests must not assume real-browser ordering.
- **Hung lock holder.** Add a timeout to `client.token` (for example 15 s, as an `AbortSignal` like `logout` uses, `identityClient.ts:143`), plus the 20 s lock-wait fallback. The file is in the ticket's list; the planner confirms the values.
- **StrictMode double construction** (`AuthRoot.tsx:23`, `main.tsx:37`): handled by the `start()` lifecycle.
- **bfcache:** an open `BroadcastChannel` can make a page ineligible in some browsers. This is acceptable; closing on `pagehide` and reopening on `pageshow` is optional.
- **Hotspots:** `AuthGate.tsx`, `SignInScreen.tsx`, `types.ts` and `copy.ts` are also edited by T-028.3, which depends on this ticket, so they land sequentially. Note this in the plan.
- **`forget()` and `session_invalid` in one tab** clear the shared `mm_account_id` but do not broadcast. Other tabs keep working until their own renewal fails. Consistent with the ticket; see open question 2.

## Out of scope
- T-028.3: the "Continue as" list, the verify screen, `VerifyEmailPage` changes.
- T-028.4: `/api/auth/me`.
- T-028.1: verifier and server changes.
- No "signedIn" broadcast; a signed-out tab never adopts tokens.
- No token in any storage.
- No change to `authFetch.ts` code (tests only, if any).
- No server or migration change.

## Open questions (for the planner, or for Ming if they touch scope)
1. Add `accountId` (and `v`) to both messages? Recommended, because of multi-account devices. It is a small deviation from the ticket's literal message shapes.
2. Should `session_invalid` in one tab's renewal also broadcast `signedOut`? Recommendation: no, keep the ticket's scope.
3. Should a `storage`-event fallback for sign-out apply when `BroadcastChannel` is missing? Recommendation: only then, because `forget()` also clears the id.
4. Values for the `/token` timeout (15 s) and the lock-wait timeout (20 s for renewal, 5 s for logout).
