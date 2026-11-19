Status: READY

# Plan — T-028.2: Share the sign-in session across tabs and renew tokens before they expire

## Scope summary
- `work/decisions.md` D50 (2026-11-19): "Adopted: … **cross-tab Web Lock + BroadcastChannel session, proactive renewal,
  sign-out that warns when `/logout` is not confirmed** …". Differences D50 keeps: (4) "token lifetime stays 12 h (D46)".
- D46: Identity access tokens live **12 hours** (`expires_in` 43200); the code bound stays `EXPIRES_MAX = 86400`
  (`identityClient.ts:31`).
- D44 / R1: the app always runs against the Node API; `authFetch` stays the only place that adds the bearer.
- Ticket scope (quoted):
  - "`/token` renewals serialised across tabs with a Web Lock (`navigator.locks.request("tudocuatui-auth-refresh", …)`),
    still single-flight per tab; fallback when Web Locks are missing."
  - "`BroadcastChannel("tudocuatui-auth")`: the renewing tab posts `{type:"token", accessToken, expiresAt, at}`; a tab
    that gets a 401 adopts a token another tab received in the last 10 s; `{type:"signedOut"}` signs out every tab.
    Messages are validated; tokens never leave memory."
  - "Proactive renewal timer 60 s before `exp` (tokens last 12 h, D46), plus the existing one retry after an API 401."
  - "Sign-out: drop the token, clear `mm_account_id`, broadcast, wait for a running renewal, then `POST /logout`; the
    epoch counter drops late answers; if `/logout` is not confirmed, the sign-in page warns (shared-computer note)."
  - "409 `email_already_verified` on resend → get a token."
- Out of scope (ticket): "Sign-in page account list (T-028.3); verifier (T-028.1)."

Current state (confirmed in code, consult "Findings"): the token lives only in the `createTokenStore` closure
(`tokenStore.ts:48`); `generation` is the epoch counter (`:50`, bumped at `:104,117,130`, checked at `:64,70`);
single-flight is per tab (`inflight`, `:51,57,83`); refresh is lazy with no timer (`:66,89`); `signOut` swallows the
`/logout` result and does not wait for a running renewal (`:115-128`); `client.token` has no timeout
(`identityClient.ts:119-121`, compare `logout` `:138-145`); resend 409 is shown as an error (`AuthGate.tsx:266-276`).
`authFetch.ts:44-49` already does "one retry after a 401" and passes T-028.1's 503 through — **no change there**.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Two tabs (fake lock + channel): one `/token` call, both get the token. | `tabs.test.ts › two tabs renewing at once -> one /token, both return the same token`; `› tab B waiting on the lock adopts A's broadcast instead of calling /token` |
| 2 | A 401 in one tab adopts a token broadcast within 10 s instead of signing out; older tokens are ignored. | `tabs.test.ts › getToken(rejected) returns a token another tab broadcast, with no /token call`; `› a message older than the tab's own token is ignored`; `› a message for another account is ignored`; `authChannel.test.ts › parseAuthMessage › at older than 10 s -> null` (table) |
| 3 | Sign-out in one tab signs out the other; a renewal answer arriving after sign-out is dropped. | `tabs.test.ts › sign-out in A signs out B (memory, storage, listener), no /logout from B`; `› B's /token resolving after A's sign-out is dropped and not broadcast`; `tokenStore.test.ts › signOut waits for a running renewal before /logout`; `AuthGate.test.tsx › remote sign-out while ready -> App unmounted -> sign-in with the signed-out notice`; `› remote sign-out during restore -> App never rendered` |
| 4 | Renewal fires 60 s before expiry (fake timers). | `tabs.test.ts › proactive renewal fires at exp - 60 s (900 s and 43200 s tokens)`; `› hidden tab skips the timer and renews on visibilitychange`; `› transient failure keeps the session and retries in 15 s while the token is still valid`; `› sign-out disarms the timer` |
| 5 | Unconfirmed `/logout` shows a warning on the sign-in page. | `tokenStore.test.ts › signOut resolves {confirmed}` (table: 204 → true, `session_invalid` → true, `network`/`rate_limited`/`unknown` → false, never rejects); `AuthGate.test.tsx › logout not confirmed -> sign-in shows the shared-computer warning`; `› a late unconfirmed logout does not overwrite a newer screen`; `SignInScreen.test.tsx › notice=logout_unconfirmed shows its copy in role=status` |
| 6 | Resend → 409 `email_already_verified` gets a token. | `AuthGate.test.tsx › resend 409 email_already_verified -> /token -> App rendered` |
| 7 | No token in storage, URLs or logs; works when `localStorage`, Web Locks or BroadcastChannel are unavailable. | `tokenStore.test.ts › never writes anything but mm_account_id; no history or console use` (extended: started store, fake channel, renewal + sign-out); `› works when localStorage throws`; `refreshLock.test.ts` (missing / throwing / aborted locks run `fn` directly); `authChannel.test.ts` (missing / throwing constructor and throwing `postMessage` → no-op); `boundary.test.ts` (new ALLOWED entries: `navigator.locks` only in `refreshLock.ts`, `BroadcastChannel` only in `authChannel.ts`) |
| 8 | 390 px and dark mode for the warning; all checks pass. | `boundary.test.ts › auth UI uses theme variables, no fixed wide widths` (unchanged, still green); auth preview (`/auth-preview`) sign-in state `logout_unconfirmed` checked at the 390 px frame and dark toggle, recorded in impl-log; `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- Production, two real tabs signed in: DevTools Network shows one `/auth/token` when both renew; sign-out in tab A
  returns tab B to the sign-in page with "Bạn đã đăng xuất."
- Leave a tab open past 12 h (or across a laptop sleep): no sign-in prompt, no failed API call.
- Sign out with the network offline (DevTools "Offline"): the sign-in page shows the shared-computer warning.
- Real Safari/Chrome Web Locks and BroadcastChannel ordering is invisible to jsdom (loop config). Optional: a one-off
  Playwright run with two tabs and mocked Identity routes, recorded in impl-log; not required for PASS.

## Files to create / modify
`src/features/auth/**` is a High path (CLAUDE.md risk tiers; ticket Gate `plan-approval`).

| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/auth/config.ts` | Add `AUTH_LOCK_NAME = "tudocuatui-auth-refresh"`, `AUTH_CHANNEL_NAME = "tudocuatui-auth"` | Ticket names; one place | Yes |
| `src/features/auth/refreshLock.ts` (new) | `createRefreshLock({ locks?, name?, timers? })` → `{ run<T>(fn: (locked: boolean) => Promise<T>, opts: { waitMs: number }): Promise<T> }` | Web Lock + fallback (ticket bullet 1) | Yes |
| `src/features/auth/authChannel.ts` (new) | `parseAuthMessage(raw, now)`; `createAuthChannel({ create?, name?, now? })` → `{ post, subscribe, close }` | BroadcastChannel + validation (ticket bullet 2) | Yes |
| `src/features/auth/tokenStore.ts` | Lock-serialised renewal with double-check and broadcast; adopt incoming tokens; remote sign-out; proactive timer; `start()` lifecycle; `signOut()` returns `{ confirmed }` and waits for a running renewal; `onRemoteSignOut` | Ticket bullets 1–4 | Yes |
| `src/features/auth/identityClient.ts` | `token()` gets `AbortSignal.timeout(TOKEN_TIMEOUT_MS = 15000)` | A hung `/token` would otherwise hold the cross-tab lock for every tab (consult Risks) | Yes |
| `src/features/auth/AuthGate.tsx` | `useEffect(() => store.start(), [store])`; remote sign-out handler; `logout_unconfirmed` notice with a sequence guard; resend 409 → restore; `enterReady` only when `store.accountId()` is still set after restore / sign-in | Ticket bullets 2, 4, 5 | Yes |
| `src/features/auth/types.ts` | `SignInScreenProps.notice` gains `"logout_unconfirmed"` | Warning on the sign-in page | Yes |
| `src/features/auth/SignInScreen.tsx` | Render the new notice (existing `AuthNotice kind="info"`) | Warning on the sign-in page | Yes |
| `src/features/auth/copy.ts` | `AUTH_COPY.signIn.logoutUnconfirmed` | R6: Vietnamese copy in one place | Yes |
| `src/features/auth/preview/AuthPreview.tsx` | Sign-in state `logout_unconfirmed` passes the notice | R9 check at 390 px / dark | Yes |
| `src/features/auth/fakeTabs.ts` (new, test-only helpers, never imported by app code) | `createFakeLockManager()` (exclusive FIFO, honours `signal`), `createFakeChannelHub()` (BroadcastChannel-like endpoints, `structuredClone` + `queueMicrotask` delivery, never to the sender, not after `close`), `createFakeDoc()` | Deterministic multi-tab tests (no real globals) | Yes |
| `src/features/auth/refreshLock.test.ts` (new) | Unit tests | R8 | Yes |
| `src/features/auth/authChannel.test.ts` (new) | Unit tests incl. `parseAuthMessage` table | R8 | Yes |
| `src/features/auth/tabs.test.ts` (new) | Two-store ("two tabs") tests with fake lock manager, channel hub, fake timers | AC1–AC4 | Yes |
| `src/features/auth/tokenStore.test.ts` | New cases + the changed ones listed under "Existing tests that change" | R8 | Yes |
| `src/features/auth/AuthGate.test.tsx` | Inject fake lock/channel in `setup`; new cases; one changed case | AC3, AC5, AC6 | Yes |
| `src/features/auth/AuthRoot.test.tsx` | `vi.stubGlobal("BroadcastChannel", undefined)` in a `beforeEach` | AuthGate now calls `store.start()`; Node 22 has a real global `BroadcastChannel` that would open a live handle | Yes |
| `src/features/auth/SignInScreen.test.tsx` | One new case | AC5 | Yes |
| `src/features/auth/identityClient.test.ts` | `token` request carries an `AbortSignal` | Timeout | Yes |
| `src/features/auth/boundary.test.ts` | ALLOWED: `"navigator.locks": ["refreshLock.ts"]`, `"BroadcastChannel": ["authChannel.ts"]` | AC7: one file per browser API | Yes |

Not touched: `src/data/authFetch.ts` (consult §6: 401 → `getToken(first)` → adopted/renewed token; 503 passes
through), `VerifyEmailPage.tsx` (T-028.3), `AuthRoot.tsx`, `accountId.ts`, server, migrations.

Size estimate: ~350 production lines, ~600 test lines. One implement/review cycle.

## Tests to write
All tests inject fakes; none relies on the real `navigator.locks` or `BroadcastChannel` (jsdom has no Web Locks; Node 22's
real channel is cross-instance and keeps the event loop alive). Timer tests use `vi.useFakeTimers()` with
`now: () => Date.now()` and `vi.advanceTimersByTimeAsync`. No App-level tests (BUG-006/D42).

| Test (file › name) | Covers |
|---|---|
| `refreshLock.test.ts › runs fn under navigator-style lock "tudocuatui-auth-refresh" with locked=true` | Lock name, AC1 |
| `refreshLock.test.ts › two runs on a shared fake manager are serialised (second starts after the first settles)` | AC1 |
| `refreshLock.test.ts › locks undefined -> fn runs at once with locked=false` | AC7 |
| `refreshLock.test.ts › request throwing (SecurityError) -> fn runs with locked=false` | AC7 |
| `refreshLock.test.ts › wait longer than waitMs -> wait aborted, fn runs with locked=false (fake timers)` | Hung-holder fallback |
| `refreshLock.test.ts › fn's rejection propagates and the lock is released` | Correctness |
| `authChannel.test.ts › parseAuthMessage` table: valid token / valid signedOut accepted; rejects non-object, array, `v !== 1`, unknown `type`, non-UUID `accountId`, `accessToken` empty / > 8192 / with a space or `+`, `expiresAt` ≤ now / > now + 24 h / NaN, `at` < now − 10 000 / > now + 5 000 / non-number; unknown fields are not copied into the result | AC2, AC7 ("Messages are validated") |
| `authChannel.test.ts › subscribe delivers only parsed messages; unsubscribe stops delivery; close closes the endpoint` | AC2 |
| `authChannel.test.ts › create undefined or throwing -> post/subscribe/close are no-ops; postMessage throwing is swallowed` | AC7 |
| `tabs.test.ts › two tabs renewing at once -> one /token, both return the same token` | AC1 |
| `tabs.test.ts › tab B waiting on the lock adopts A's broadcast instead of calling /token` | AC1 |
| `tabs.test.ts › getToken(rejected) returns a token another tab broadcast, with no /token call` | AC2 |
| `tabs.test.ts › a message older than the tab's own token is ignored` (and `at` older than 10 s via the parser) | AC2 |
| `tabs.test.ts › a message for another account is ignored (token and signedOut)` | AC2, AC3 |
| `tabs.test.ts › a signed-out tab never adopts a token` | Scope (no "signedIn" broadcast) |
| `tabs.test.ts › an adopted token is not re-broadcast` | No ping-pong |
| `tabs.test.ts › sign-out in A signs out B (memory, storage, listener), no /logout from B` | AC3 |
| `tabs.test.ts › B's /token resolving after A's sign-out is dropped and not broadcast` | AC3 (epoch) |
| `tabs.test.ts › proactive renewal fires at exp - 60 s (900 s and 43200 s tokens)` | AC4, D46 |
| `tabs.test.ts › hidden tab skips the timer and renews on visibilitychange` | AC4 |
| `tabs.test.ts › transient failure keeps the session and retries in 15 s while the token is still valid; session_invalid notifies` | AC4, error handling |
| `tabs.test.ts › sign-out disarms the timer; start() cleanup removes the listener, closes the channel and clears the timer; start() twice is safe` | Lifecycle (StrictMode) |
| `tokenStore.test.ts › signOut waits for a running renewal before /logout` (order: token resolves → logout) | Ticket "wait for a running renewal" |
| `tokenStore.test.ts › signOut resolves {confirmed}` (table: 204 → true, `session_invalid` → true, `network` / `rate_limited` / `unknown` → false; never rejects) | AC5 |
| `tokenStore.test.ts › signOut broadcasts {v:1,type:"signedOut",accountId} before /logout; nothing when already signed out` | AC3 |
| `tokenStore.test.ts › works when localStorage throws` (spy `Storage.prototype.getItem/setItem/removeItem` to throw; default storage) | AC7 |
| `identityClient.test.ts › token carries an AbortSignal (15 s timeout)` | Timeout |
| `AuthGate.test.tsx › remote sign-out while ready -> App unmounted -> sign-in with the signed-out notice` | AC3 |
| `AuthGate.test.tsx › remote sign-out during restore -> App never rendered` | AC3 (epoch at the UI) |
| `AuthGate.test.tsx › remote sign-out on the join screen -> sign-in` | AC3 |
| `AuthGate.test.tsx › logout not confirmed -> sign-in shows the shared-computer warning` | AC5 |
| `AuthGate.test.tsx › a late unconfirmed logout does not overwrite a newer screen` (go to sign-up before logout settles) | AC5 |
| `AuthGate.test.tsx › resend 409 email_already_verified -> /token -> App rendered` | AC6 |
| `SignInScreen.test.tsx › notice=logout_unconfirmed shows its copy in role=status` | AC5 |
| `boundary.test.ts` (extended ALLOWED map) | AC7 |

### Existing tests that change (and why)
- `tokenStore.test.ts › removes the id even when logout rejects`: `resolves.toBeUndefined()` → `resolves.toEqual({ confirmed: false })` (new return type).
- `tokenStore.test.ts › discards a late refresh`: today it awaits `signOut()` before releasing the pending `/token`; signOut now waits (≤ 5 s) for that renewal, so the test starts `signOut()`, releases the token, then awaits both. Assertions unchanged.
- `tokenStore.test.ts › never writes anything but mm_account_id; no history or console use`: extended (started store with a fake channel; also asserts posted messages carry the token only in `accessToken`, and `setItem` calls are still only `["mm_account_id", ID]`).
- `AuthGate.test.tsx › logout failure still signs out`: after a `network` logout the notice is now the warning, so it expects `AUTH_COPY.signIn.logoutUnconfirmed` instead of `signedOut`.
- `AuthGate.test.tsx` `setup()`: passes a fake lock (shared fake manager) and a fake channel endpoint to `createTokenStore`, and returns a second hub endpoint so tests can post as "another tab". Existing cases keep their assertions; `order: App unmount -> id cleared -> logout` must still pass unchanged.
- `AuthRoot.test.tsx`: global `BroadcastChannel` stubbed to `undefined` (see Files).
- All other `tokenStore.test.ts` cases (single-flight, cache window, `getToken(stale)`, notify codes, join, accountEmail) must pass **unchanged**: the store stays backward-compatible for `createTokenStore({ client, storage, now })` and does not arm timers or open a channel until `start()`.

## Approach
1. **config.ts** — the two names.
2. **refreshLock.ts** — `detectLocks()`: `typeof navigator !== "undefined" && typeof navigator.locks?.request === "function" ? navigator.locks : undefined`.
   `run(fn, { waitMs })`: without locks → `fn(false)`. With locks: `AbortController` aborted by `timers.setTimeout(waitMs)`
   (injected timers, so fake timers drive it; not `AbortSignal.timeout`), `locks.request(name, { mode: "exclusive", signal }, () => { clear wait timer; return fn(true) })`.
   If `request` throws synchronously or rejects with `AbortError` before the callback ran → `fn(false)`. A rejection from
   `fn` itself propagates.
3. **authChannel.ts** — types `AuthMessage = { v: 1; type: "token"; accountId; accessToken; expiresAt; at } | { v: 1; type: "signedOut"; accountId; at }`.
   `parseAuthMessage(raw, now)` per consult §2 (UUID regex as in `accountId.ts`; token `/^[A-Za-z0-9._-]{1,8192}$/`;
   `expiresAt` in `(now, now + 86_400_000]`; `at` in `[now − 10_000, now + 5_000]`); returns a fresh object with only the
   known fields. `createAuthChannel`: default `create = (n) => new BroadcastChannel(n)` when the global exists; any throw
   (constructor, `postMessage`, `close`) is swallowed; `subscribe` wraps `message` events with `parseAuthMessage(ev.data, now())`.
   No `console`, no storage fallback for tokens (consult §7).
4. **identityClient.ts** — `token()` passes `AbortSignal.timeout(15_000)`; an abort already maps to `network` (`:63-65`).
5. **tokenStore.ts** (single owner of auth state; consult §1, §3, §4):
   - New optional deps: `lock?: RefreshLock` (default `createRefreshLock({ timers })`), `channel?: () => AuthChannel`
     (factory, default `() => createAuthChannel({ now })`), `timers?` (default lazily calls global `setTimeout`/`clearTimeout`),
     `doc?: { visibilityState; addEventListener; removeEventListener }` (default `document` when defined).
   - New state: `expiresAt`, `tokenAt`; `validUntil = expiresAt − 60 s` (unchanged meaning).
   - `renew(rejected?)` replaces `fetchToken`: per-tab `inflight` single-flight as now; captures `epoch = generation`;
     `lock.run(async (locked) => { if epoch ≠ generation → null; if locked → await one timers.setTimeout(0); if fresh() && token ≠ rejected → token (double-check, no /token); r = await client.token(id); if epoch ≠ generation → null (dropped, not broadcast); set token/expiresAt/validUntil/tokenAt = now(); post {v:1,type:"token",accountId:id,accessToken,expiresAt,at:tokenAt} while still holding the lock; arm timer; return token }, { waitMs: 20_000 })`.
     Errors: if epoch ≠ generation → null. `session_invalid` clears token + id + storage (as `:72-76`); `not_member`,
     `email_unverified` clear the token; `network` / `rate_limited` / `unknown` leave the state as is (the cached token is
     not "fresh" any more anyway, `rejected` is never returned) and rethrow.
   - `getToken` unchanged in shape: returns the cached token when `fresh() && token !== rejected` — this is also how an
     adopted token answers a 401 retry with no network call (AC2). Notifies listeners for NOTIFY_CODES as today.
   - Incoming `token` message: adopt only if `id && msg.accountId === id && msg.at > tokenAt && msg.expiresAt − 60 s > now()`;
     set fields from the message, re-arm the timer; never re-broadcast.
   - Incoming `signedOut` with `msg.accountId === id`: `generation++`, `inflight = null`, clear memory, `storage.clear()`,
     disarm timer, call `onRemoteSignOut` listeners. No `/logout`, no re-broadcast.
   - Timer (only while started): one handle, `clamp(validUntil − now(), 0, 2^31 − 1)`. On fire: if `now() < validUntil`
     re-arm; if `doc.visibilityState === "hidden"` skip; else `renew()` — NOTIFY_CODES notify listeners like a background
     `getToken`; transient errors re-arm a retry in 15 s if `now() + 15 s < expiresAt`. `visibilitychange` → visible:
     `if (id && (token === null || now() >= validUntil)) void renew()` with the same error handling.
     `signIn`, `signOut`, `forget`, remote sign-out disarm it.
   - `start()`: idempotent; opens the channel via the factory, subscribes, adds the `visibilitychange` listener, arms the
     timer if a token exists; returns a cleanup that undoes all of it (StrictMode-safe; consult §1). Posting happens only
     while started.
   - `signOut(): Promise<{ confirmed: boolean }>`: `gone = id`, `running = inflight`; `generation++`, clear token/id/email,
     `inflight = null`, disarm, `storage.clear()`; if `gone`, post `{v:1,type:"signedOut",accountId:gone,at}`; if no `gone`
     → `{ confirmed: true }`. Then wait: `await` `running` (errors swallowed) raced with a 5 s timer, then
     `lock.run(() => client.logout(gone), { waitMs: 5_000 })` — the lock request waits for a renewal in any other tab,
     whose late answer that tab drops by epoch. Resolve `true` on success or `session_invalid`, else `false`. Never rejects.
   - `onRemoteSignOut(fn) → unsubscribe` (kept separate from `subscribe`, so the `AuthError` listener type and its tests stay unchanged).
6. **AuthGate.tsx**:
   - `useEffect(() => store.start(), [store])`.
   - `useEffect(() => store.onRemoteSignOut(() => { signOutSeq++; joinSeq++; joining = false; if ready → retireApp() + flushSync(checking); reset status/turnstile/email; setScreen("signIn"); setView({ kind: "signed_out", notice: "signed_out" }) }), [store])` — any view.
   - Restore success and `signIn` success call `enterReady()` only if `store.accountId() !== null` (a remote sign-out
     during the `/token` call makes `renew` return `null`; the remote handler already moved the view). `join` already checks this (`:289`).
   - `onSignOut`: unchanged order (App unmounts → `signOut()` clears the id → signed-out notice at once). Captures
     `seq = ++signOutSeq`; when `store.signOut()` resolves with `confirmed: false`, `seq === signOutSeq` and the view is
     still `signed_out`, set `notice: "logout_unconfirmed"`. `goto`, `signIn` and the remote handler bump `signOutSeq`.
   - `resendVerification`: on `email_already_verified` → `setResend({ status: "idle" })`, `setView({ kind: "checking" })`,
     `setAttempt(n + 1)` — reuses the restore effect, which already handles success, join offer and errors.
   - View union and `SignInScreenProps.notice` gain `"logout_unconfirmed"`.
7. **SignInScreen.tsx / copy.ts / AuthPreview.tsx** — `notice === "logout_unconfirmed"` → `copy.signIn.logoutUnconfirmed`
   in the existing `AuthNotice kind="info"` (`role="status"`, theme variables only, so dark mode and 390 px follow the
   existing notices; R9). Copy (R6):
   `logoutUnconfirmed: "Bạn đã đăng xuất khỏi Tủ đồ của tôi trên trình duyệt này, nhưng chưa xác nhận được việc đăng xuất khỏi tài khoản mmlabs. Nếu đây là máy dùng chung, hãy đóng hết các cửa sổ trình duyệt."`
   Preview: add `"logout_unconfirmed"` to `STATES.signIn` and pass `notice` for it.
8. **Rules.** R1: data access unchanged, `authFetch` untouched, no new `fetch` outside `identityClient.ts` (boundary test).
   R3/R11-style: only the access token, its `expiresAt` and the non-secret account id cross the channel; the HttpOnly
   `mm_device` cookie is never readable; no token in storage, URL or log; no `localStorage` token fallback. R6: copy in
   `copy.ts`. R7: follow-ups below. R8: tests above. R9: theme-variable notice, preview check.

## Specialist input used
`consult-software-architect.md`:
- §1 module boundaries (`refreshLock.ts`, `authChannel.ts`, names in `config.ts`, injectables, `start()` lifecycle) — **adopted**, with two changes: the store takes a channel *factory* (so `start()`/cleanup can reopen it under StrictMode), and the lock wait uses injected timers instead of `AbortSignal.timeout` (testable with fake timers).
- §1 events as a discriminated union vs separate `onRemoteSignOut` — **chose `onRemoteSignOut`**: keeps `subscribe`'s `AuthError` type and its existing tests untouched (smaller diff).
- §2 schema with `v: 1` and `accountId`, and the validation rules — **adopted** (assumption A1).
- §3 state machine, double-check under the lock, broadcast while holding the lock, adopt rules, `yieldTask` — **adopted**; the yield runs only when a real lock was granted (`locked === true`), so the default jsdom path (no Web Locks) and the existing tests see no extra macrotask.
- §3 keep a still-valid token on transient errors and retry in ~15 s — **adopted** for the timer path (no clearing, retry while before `expiresAt`); lazy callers still get the rejection as today.
- §3 hidden tabs skip the timer — **adopted**. Wake handling on `pageshow` and `online` — **rejected**: `visibilitychange` plus the lazy `getToken` check already cover a stale token; fewer listeners.
- §4 sign-out ordering, `{ confirmed }`, lock as "wait for a running renewal", confirmed = 2xx or `session_invalid` — **adopted**; additionally awaits this tab's own captured `inflight` (≤ 5 s) before the lock request, so the no-Web-Locks path uses the same code. Remote sign-out handling and the `signOutSeq` guard in AuthGate — **adopted**.
- §4 copy example — **adopted, reworded** to say TuDo is signed out and the mmlabs account sign-out is unconfirmed.
- §5 resend 409 → restore — **adopted**, implemented by reusing the restore effect (`checking` + `attempt`). Leave `VerifyEmailPage` alone — **adopted**.
- §6 no `authFetch.ts` change — **adopted**; the AC2 test is at store level.
- §7 security (channel scope, no storage fallback, no logs, extend the no-console test) — **adopted**; also boundary-test entries for the two browser APIs. Optional `storage`-event sign-out fallback — **rejected** (follow-up F2).
- §8 fakes, fake timers, test cases — **adopted** (`fakeTabs.ts`, `tabs.test.ts`); Playwright two-tab run — optional, under Ming verification.
- Risks: `/token` timeout 15 s and lock wait 20 s / 5 s — **adopted** (A3); StrictMode — handled by `start()`; bfcache close/reopen — **not done** (acceptable per consult); hotspots — noted below.
- Open question 2 (`session_invalid` broadcasts `signedOut`) — **no**, ticket scope (follow-up F1).

## Assumptions
Needing Ming's approval (decided by the planner inside the ticket's scope):
- **A1 — message shape.** Both messages carry `v: 1` and `accountId` in addition to the ticket's fields:
  `{v:1, type:"token", accountId, accessToken, expiresAt, at}` and `{v:1, type:"signedOut", accountId, at}`. A tab only
  adopts / signs out for its own account (a device can hold several mmlabs accounts, T-028.3). The account id is
  already in `localStorage`, not a secret.
- **A2 — "received in the last 10 s"** is enforced at receipt (`at` within `[now − 10 s, now + 5 s]`); a tab adopts a
  valid newer token for its account immediately (not only after a 401), so a later 401 retry uses it with no `/token`
  call. This is what "a token renewed in one tab is reused by the others" (Goal) needs.
- **A3 — timeouts.** `/token` request 15 s; waiting for the renewal lock 20 s, then renew without the lock; sign-out
  waits ≤ 5 s for this tab's running renewal and ≤ 5 s for the lock, then `/logout` (its existing 5 s timeout). Worst
  case before the warning can appear: ~15 s; the UI is never blocked.
- **A4 — hidden tabs** skip the proactive timer and renew on becoming visible (or lazily on their next API call), so N
  background tabs do not contend.
- **A5 — warning semantics.** "Confirmed" = `/logout` 2xx or 401 `session_invalid`; anything else (network, timeout,
  429, unknown) shows the warning. Remote sign-out shows the existing "Bạn đã đăng xuất." notice, no warning.
- **A6 — copy** of the warning as written in Approach 7.

Other assumptions:
- Without BroadcastChannel each tab still works on its own (lazy and proactive renewal, its own lock); cross-tab
  sign-out then happens only when the other tab's next renewal fails. Without Web Locks renewals are single-flight per
  tab only; the double-check after adoption still avoids most duplicate `/token` calls.
- Hotspots: `AuthGate.tsx`, `SignInScreen.tsx`, `types.ts`, `copy.ts`, `AuthPreview.tsx` are also planned for T-028.3
  (BACKLOG, depends on this ticket), so they land sequentially. No ticket in `IN_PROGRESS`/`REVIEW`/`DONE` edits these files.
- `fakeTabs.ts` sits in `src/features/auth/` (walked by `boundary.test.ts`), so it must not contain the words
  `BroadcastChannel`, `navigator.locks`, `console.` or other boundary-listed strings; it is never imported by app code.

## Blocking questions
None.

## Split proposal
None. Fallback if review finds the diff too large: (a) store, lock, channel, timer, `identityClient` timeout and their
tests (AC1–AC4, AC7); (b) AuthGate wiring: remote sign-out view, `logout_unconfirmed` warning, resend 409 (AC3 UI,
AC5, AC6, AC8).

## Follow-ups (not in this diff, R7)
- F1: a `session_invalid` renewal (or `forget()` / `onAuthLost`) in one tab could also broadcast `signedOut`; today
  other tabs notice at their own next renewal (consult open question 2).
- F2: `storage`-event fallback for cross-tab sign-out when BroadcastChannel is missing (consult open question 3).
- F3: close/reopen the channel on `pagehide`/`pageshow` for bfcache eligibility.
- F4: Playwright as a repo dependency for real two-tab tests (Ming's decision, D42).
