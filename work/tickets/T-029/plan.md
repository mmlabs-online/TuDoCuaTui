Status: READY

# Plan — T-029: Finish cross-tab sign-out (broadcast on lost sessions, fallback, retry sign-out)

Gate: **plan-approval** (every production file is under `src/features/auth/**`, a High path in `CLAUDE.md` › Risk tiers).
Ming approves this plan before IMPLEMENT.

## Scope summary
- `work/decisions.md` D50: "Adopted: … cross-tab Web Lock + BroadcastChannel session, proactive renewal, sign-out that
  warns when `/logout` is not confirmed …".
- Ticket › Scope:
  - "Broadcast `signedOut` (for that account) on `session_invalid`, `forget()` and `onAuthLost`, not only on an explicit sign-out (F1)."
  - "When BroadcastChannel is missing, fall back to the `storage` event on `mm_account_id` for cross-tab sign-out (F2); never carry tokens in storage."
  - "A "Thử đăng xuất lại" action on the `logout_unconfirmed` notice that re-calls `/logout` for the remembered (in-memory only) account id."
- T-028.2 follow-ups quoted by the ticket:
  - plan.md:251 "F1: a `session_invalid` renewal (or `forget()` / `onAuthLost`) in one tab could also broadcast `signedOut`".
  - plan.md:253 "F2: `storage`-event fallback for cross-tab sign-out when BroadcastChannel is missing".
  - security-review.md:47 "a "Thử đăng xuất lại" action that re-calls `client.logout(goneId)` would give the user a way to retry".
- Out of scope (ticket): bfcache channel close/reopen (F3); Playwright as a dependency (F4).
- `docs/feature-list.md` has no item for this; the scope source is D50 plus the T-028.2 follow-ups, as the ticket says.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A `session_invalid`, `forget()` or lost session in tab A signs out tab B on the same account (fake channel tests). | `pnpm test src/features/auth/tabs.test.ts`, describe "session ends reach other tabs": T1–T6 below. AuthGate level: `AuthGate.test.tsx` › "onAuthLost broadcasts signedOut for the lost account" (T15). |
| 2 | With no BroadcastChannel, removing `mm_account_id` for the tab's account signs it out via the storage event; other accounts are unaffected. | `accountId.test.ts` T9–T10 (watcher filter), `authChannel.test.ts` T11 (fallback is only used with no endpoint), `tabs.test.ts` › "no BroadcastChannel" T12–T13. |
| 3 | "Thử đăng xuất lại" calls `/logout` once per click and replaces the warning with "Bạn đã đăng xuất." on success. | `tokenStore.test.ts` T7–T8, `AuthGate.test.tsx` T16–T18, `SignInScreen.test.tsx` T19–T20. |
| 4 | 390 px and dark mode for the notice action (one-off Playwright, D42). | Implementer runs a one-off Playwright script (kept in the scratchpad, not committed) against `pnpm dev` › `/auth-preview.html`, sign-in screen, states `logout_unconfirmed` and `logout_retrying`, at 390 px in light and dark. Screenshots and the result go in `impl-log.md`; the reviewer reads them. Pattern: `scripts/mobile-verify.cjs` (reading it is fine; it is not changed). |
| 5 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` are green. |

## Ming verification after merge
- Ticket › Test plan › Manual: two real tabs on the same account. In tab A, set DevTools › Network › Offline and sign out:
  tab A shows the `logoutUnconfirmed` warning with the "Thử đăng xuất lại" button, and tab B moves to "Bạn đã đăng xuất.".
  Go back online and press "Thử đăng xuất lại" in tab A: the warning becomes "Bạn đã đăng xuất.", and the "Tiếp tục với …"
  list no longer offers that account after a reload.
- Optional: in tab A, open "Dùng tài khoản khác" on a join or unverified screen and check that tab B (same account) goes
  to "Bạn đã đăng xuất." (assumption A1).

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/auth/tokenStore.ts` | One private `end(gone, { broadcast })` teardown used by `signOut`, `forget`, `renew`'s `session_invalid` branch, `join`'s `session_invalid` branch (broadcast) and `onMessage` (no broadcast). `sessionAt` set in `adopt`; `onMessage` ignores a `signedOut` with `at < sessionAt`. `signOut` returns a `retry` capability when not confirmed. Updated `TokenStore` type and docs. | AC1, AC3 | Yes (`src/features/auth/**`) |
| `src/features/auth/authChannel.ts` | New optional `watchRemoved` dependency of `createAuthChannel` (default `watchAccountIdRemoved` from accountId.ts). Used only when there is no endpoint: each removal becomes a parsed `signedOut` message for the subscribers. `post` stays a no-op without an endpoint. | AC2 | Yes |
| `src/features/auth/accountId.ts` | Export `ACCOUNT_ID_KEY` and `watchAccountIdRemoved(onRemoved, win?)`. It listens to `storage` events, filters on key, a `null` new value, a UUID old value and `storageArea` (localStorage), and returns the cleanup. It is a no-op without `window`. | AC2. The boundary test allows `localStorage` and `mm_account_id` only in this file. | Yes |
| `src/features/auth/fakeTabs.ts` | Add `createFakeStorageHub()`: a shared value plus per-tab `{ storage: AccountIdStorage, win }`. A write or clear sends a `storage` event to every other tab's window, never to the writer. It uses `ACCOUNT_ID_KEY`. | Tests for AC2 (ticket › Test plan: "storage-event fallback with a fake window") | Yes (test helper) |
| `src/features/auth/AuthGate.tsx` | In `onSignOut`, keep `{ seq, run: retry }` in a ref when the result is not confirmed. Add `onRetrySignOut` (guarded by a `retrying` ref and by `seq === signOutSeq.current`) and `retryingSignOut` state, passed to `SignInScreen`. No change to `onAuthLost`, `resendVerification`, `failTo`, `offerJoin` or to where `signOutSeq` is bumped. | AC3 | Yes |
| `src/features/auth/SignInScreen.tsx` | When `notice === "logout_unconfirmed"` and `onRetrySignOut` is set, pass `action` to the info `AuthNotice` (label "Thử đăng xuất lại" / "Đang đăng xuất…", disabled while retrying). | AC3, AC4 | Yes |
| `src/features/auth/types.ts` | `SignInScreenProps`: `onRetrySignOut?: () => void`, `retryingSignOut?: boolean`. | AC3 | Yes |
| `src/features/auth/copy.ts` | `AUTH_COPY.signIn.retrySignOut: "Thử đăng xuất lại"`, `retryingSignOut: "Đang đăng xuất…"`. `logoutUnconfirmed` is unchanged (assumption A5). | AC3, R6 | Yes |
| `src/features/auth/preview/AuthPreview.tsx` | Sign-in state `logout_retrying`; pass `onRetrySignOut={() => say("retrySignOut")}` and `retryingSignOut` for the two logout states. | AC4 (390 px / dark check in the dev-only preview) | Yes |
| `src/features/auth/tokenStore.test.ts` | New tests T7, T8, T14. Change the false cases of "signOut resolves {confirmed} …" (:266-271) and "removes the id even when logout rejects" (:333) from `toEqual({ confirmed })` to `toMatchObject({ confirmed })`, because the false result now has a `retry` function. | AC1, AC3, R8 | Yes |
| `src/features/auth/tabs.test.ts` | New describes "session ends reach other tabs" and "no BroadcastChannel" (T1–T6, T12, T13). | AC1, AC2 | Yes |
| `src/features/auth/authChannel.test.ts` | T11. | AC2 | Yes |
| `src/features/auth/accountId.test.ts` | T9, T10. | AC2 | Yes |
| `src/features/auth/AuthGate.test.tsx` | T15–T18. | AC1, AC3 | Yes |
| `src/features/auth/SignInScreen.test.tsx` | T19, T20. | AC3 | Yes |

`.github/risk-tiers.yml`, `.claude/loop.config.md` and `boundary.test.ts` are **not** changed. The boundary allowlist stays
as it is: `localStorage` and `mm_account_id` appear only in accountId.ts, and `BroadcastChannel` only in authChannel.ts.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| T1 `tabs.test.ts` › "session_invalid on renewal in A signs out B on the same account" (A's `/token` rejects `session_invalid`; B's `onRemoteSignOut` fires, `B.store.accountId()` is null, B's `getToken()` is null) | AC1 (`session_invalid`, renew path) |
| T2 `tabs.test.ts` › "session_invalid from join in A signs out B; one signedOut posted" (probe counts exactly one `signedOut`) | AC1 (join path; no double post when join's renew also fails) |
| T3 `tabs.test.ts` › "forget() in A signs out B" | AC1 (`forget`, which `onAuthLost` and "Dùng tài khoản khác" use) |
| T4 `tabs.test.ts` › "B on another account is not affected by A's session_invalid or forget" | AC1 (same account only) |
| T5 `tabs.test.ts` › "a received signedOut is not re-broadcast" (probe sees one message, from A only) | R1 no ping-pong |
| T6 `tabs.test.ts` › "a signedOut older than the tab's session start is ignored" (B `continueAs(ID)` at t; probe posts `signedOut` with `at = t - 1`; B stays signed in) | R2 hardening |
| T7 `tokenStore.test.ts` › "unconfirmed signOut returns retry; retry calls logout once, posts signedOut and clears storage only while it holds the id" (cases: storage still holds ID → cleared; storage holds ID2 → kept; two parallel `retry()` calls → one `logout`) | AC3 (one `/logout` per click at the store level) |
| T8 `tokenStore.test.ts` › "retry: network failure → confirmed false and no post; session_invalid → confirmed true; no-op once the store has a session again" (after `continueAs`, `retry()` makes no `logout` call and resolves `{ confirmed: false }`) | AC3 and the safety guard |
| T9 `accountId.test.ts` › "watchAccountIdRemoved reports a removed UUID only" (fake window: removal of a UUID → callback with it; X→Y change, `key: null` (clear), another key, a non-UUID old value, and a `storageArea` that is not localStorage → no callback) | AC2 filter |
| T10 `accountId.test.ts` › "watchAccountIdRemoved cleanup removes the listener; no window is a no-op" | AC2 |
| T11 `authChannel.test.ts` › "no endpoint: subscribers get signedOut from watchRemoved; with an endpoint watchRemoved is not used; post writes nothing" | AC2 (fallback only without BroadcastChannel; no tokens in storage) |
| T12 `tabs.test.ts` › "no BroadcastChannel: A signing out / forgetting X signs out B on X via the storage event" (fake storage hub, `create: () => undefined`) | AC2 |
| T13 `tabs.test.ts` › "no BroadcastChannel: X→Y does not sign out B; removing Y leaves B on X alone" | AC2 ("other accounts are unaffected") |
| T14 `tokenStore.test.ts` › "renew's session_invalid ends the epoch: a late token answer of that epoch is dropped" | R1 side effect (generation bump), R8 |
| T15 `AuthGate.test.tsx` › "onAuthLost broadcasts signedOut for the lost account" (click "lost"; `other` endpoint receives `{ type: "signedOut", accountId: ID }`) | AC1 (`onAuthLost`) |
| T16 `AuthGate.test.tsx` › "Thử đăng xuất lại calls /logout once per click and shows Bạn đã đăng xuất. on success" (first `logout` rejects `network`; double click while pending → one call; resolve → status text is `AUTH_COPY.signIn.signedOut`, no button) | AC3 |
| T17 `AuthGate.test.tsx` › "a failed retry keeps the warning and the button" | AC3 |
| T18 `AuthGate.test.tsx` › "a late retry result after moving on (goto / remote sign-out) changes nothing" | AC3 with the seq guard |
| T19 `SignInScreen.test.tsx` › "logout_unconfirmed with onRetrySignOut shows Thử đăng xuất lại; click calls it; retrying shows Đang đăng xuất… disabled" | AC3, R6 |
| T20 `SignInScreen.test.tsx` › "no retry button without onRetrySignOut or with another notice" | AC3 |

Existing tests that must still pass unchanged: `tabs.test.ts` explicit sign-out cases (:202-393), `AuthGate.test.tsx`
"logout not confirmed …" / "a confirmed logout …" / "a late unconfirmed logout …" (:833-875), `boundary.test.ts`.

## Approach
1. **accountId.ts.** Export `ACCOUNT_ID_KEY` (still used inside the file) and
   `watchAccountIdRemoved(onRemoved: (id: string) => void, win = typeof window !== "undefined" ? window : undefined): () => void`.
   The handler accepts `{ key, oldValue, newValue, storageArea }` only when `key === KEY`, `newValue === null`,
   `UUID_RE.test(oldValue)`, and `storageArea` is absent or `=== localStorage`. Wrap it in try/catch, as the other functions are.
2. **authChannel.ts.** Add `watchRemoved?: (fn: (id: string) => void) => () => void` to `createAuthChannel`, defaulting
   to `watchAccountIdRemoved`. In `subscribe`, when there is no endpoint, return
   `watchRemoved((accountId) => { const m = parseAuthMessage({ v: 1, type: "signedOut", accountId, at: now() }, now()); if (m) fn(m); })`.
   `post` is unchanged, so nothing is written to storage and no token ever reaches it. Update the doc comment
   ("degrades to a no-op" becomes "degrades to storage-event sign-out only").
3. **tokenStore.ts.**
   - Add `let sessionAt = 0`, set to `now()` in `adopt`.
   - `const end = (gone: string | null, broadcast: boolean) => { reset(); id = null; email = null; forgetStored(gone); if (broadcast && gone) channel?.post({ v: 1, type: "signedOut", accountId: gone, at: now() }); }`
   - Callers:
     - `signOut`: `end(gone, true)`, keeping today's order (teardown, then post, then `/logout`).
     - `forget`: `end(id, true)`.
     - `renew` catch on `session_invalid`: `end(accountId, true)`.
     - `join` catch on `session_invalid` with `gen === generation`: `end(id, true)`.
     - `onMessage` for `signedOut`: `if (msg.at < sessionAt) return; end(id, false)`, then the remote listeners.
   - `signOut` result type: `{ confirmed: true } | { confirmed: false; retry: () => Promise<{ confirmed: boolean }> }`.
     - Factor the `/logout` attempt into `logoutOnce(gone)`: `lock.run(() => client.logout(gone), { waitMs: SIGN_OUT_WAIT_MS })`; confirmed = 2xx or `session_invalid`.
     - `retry` closes over `gone` (memory only) and is single-flight.
     - It resolves `{ confirmed: false }` with no call when `id !== null` (this tab has a session again).
     - On confirmed it runs `forgetStored(gone)` and posts `signedOut(gone)`, only after Identity confirms (consult R4).
4. **AuthGate.tsx.**
   - Add `const retrySignOut = useRef<{ seq: number; run: () => Promise<{ confirmed: boolean }> } | null>(null)`, a `retrying` ref and `const [retryingSignOut, setRetryingSignOut] = useState(false)`.
   - `onSignOut`'s `.then`: when the result is not confirmed and `seq` is current, store `{ seq, run: r.retry }`, then set the notice as today.
   - `onRetrySignOut`:
     - Return if there is no ref, `retrying.current` is set, or `ref.seq !== signOutSeq.current`.
     - Otherwise set busy and await `run()`, then clear busy.
     - If `seq` is still current and the result is confirmed, drop the ref and set the notice to `"signed_out"`, only if the view is still `signed_out` with `logout_unconfirmed`.
   - The bump sites of `signOutSeq` are **not** edited: a stale ref is ignored through the seq check (this is lighter than consult R4's "drop at every bump", with the same effect, and it keeps the BUG-008 overlap small).
   - Pass `onRetrySignOut` and `retryingSignOut` to `SignInScreen` only while `view.notice === "logout_unconfirmed"`.
5. **SignInScreen.tsx / types.ts / copy.ts / AuthPreview.tsx.** These are presentational only (consult R5): the
   `AuthNotice` `action` prop already exists. Copy goes into `AUTH_COPY.signIn` (R6).
6. **fakeTabs.ts and the tests** (table above). Then run Checks, then the one-off Playwright check (AC4), and record it in impl-log.

CLAUDE.md rules:
- R1: no data access changes; `/logout` still goes through `identityClient` (`fetch(` stays only in identityClient.ts, per the boundary test).
- R3: no secret reaches storage. The fallback only reads the removal of the non-secret account id; tokens stay in the closure and on the channel.
- R6: Vietnamese copy only in copy.ts.
- R7: stay inside this list.
- R8: pure logic (store teardown, watcher filter, retry) has unit tests.
- R9: AC4.
- R2, R4 and R5 do not apply (no schema, photo or derived-value change).

## Specialist input used
`consult-software-architect.md`:
- Finding 1 (BUG-007 merged, `forgetStored` everywhere): **adopted** as a precondition.
- R1 (single `end` helper; broadcast from the store, not AuthGate; no re-broadcast; join's `session_invalid` included): **adopted**.
- R2 (`sessionAt` guard): **adopted**.
- R3 (fallback as a second inbound transport of `createAuthChannel`, active only without an endpoint): **adopted, adjusted**. The `storage` listener and the key live in accountId.ts (`watchAccountIdRemoved`) and are injected into `createAuthChannel`. This is required because `boundary.test.ts` allows `localStorage` and `mm_account_id` only in accountId.ts, and checking `storageArea === localStorage` names `localStorage`.
- R4 (retry as a capability that closes over `gone`; post after confirmation): **adopted**. Added: single-flight, and a no-op once the store has a session again. AuthGate drops a stale retry by the seq check instead of clearing the ref at every bump site (fewer edits in the BUG-008 hotspot).
- R5 (presentational SignInScreen, copy in copy.ts): **adopted**.
- R6 (test cases, fake storage hub that never notifies the writer): **adopted** (T1–T20).
- R7 (one-off Playwright for the notice and button only): **adopted**, through `/auth-preview.html`.
- Risks 1–8: carried below as assumptions A6–A10. Open questions 1–6: carried as assumptions A1–A6 with the consult's defaults.

## Assumptions
- **A1 (consult OQ1).** "Dùng tài khoản khác" (JoinScreen, UnverifiedScreen) also broadcasts `signedOut`, because it calls
  `forget()`. Default **yes**: this matches AC1 as written, and the storage fallback cannot tell the cases apart anyway.
  Effect: a tab B on the same account X is sent to "Bạn đã đăng xuất.". Reversible: Ming can say no at plan approval,
  and then those two handlers would get a non-broadcasting variant.
- **A2 (consult OQ2).** A successful retry also signs out other tabs that signed in to the same account again in the
  meantime (the Identity logout is device-wide). It posts only after Identity confirms. Default **yes**.
- **A3 (consult OQ3).** `localStorage.clear()` (`key === null`) is **not** treated as a sign-out by the fallback. Only an
  explicit removal of `mm_account_id` counts.
- **A4 (consult OQ4).** A tab that receives a sign-out caused by another tab's `session_invalid` shows the plain
  "Bạn đã đăng xuất." notice. No `reason` field is added, so the message schema (`parseAuthMessage`) does not change.
- **A5 (consult OQ5).** The `logoutUnconfirmed` text (approved in T-028.2) is unchanged. New copy is only the button
  label "Thử đăng xuất lại" and the busy label "Đang đăng xuất…".
- **A6 (consult OQ6, hotspot).** BUG-008 (BLOCKED, waiting for plan approval, above T-029 on the board) edits
  `AuthGate.tsx` `failTo` / `offerJoin` and relies on `signOutSeq` meaning "a remote sign-out happened". T-029 does not
  edit those functions or any `signOutSeq` bump site. However, R1 makes remote sign-outs more frequent, so BUG-008's T3
  race becomes more reachable. Default: go ahead. Whichever ticket lands second rebases and re-runs BUG-008's T1–T3.
- **A7 (hotspot).** T-031 (BACKLOG, depends on BUG-008) edits `SignInScreen.tsx`, `SignInScreen.test.tsx` and
  `SignInScreenProps` (it removes the `email_unverified` banner and resend). Its plan must keep `onRetrySignOut`,
  `retryingSignOut` and T19–T20.
- **A8.** Broadcasting on `onAuthLost` means a server-side 401 problem (JWKS, audience, clock skew) signs out every tab at
  once instead of one by one. This is local only: `forget` makes no `/logout` call, and the other tabs would hit the same
  401 anyway. Accepted (consult Risk 3).
- **A9.** F2 is best effort: no event when the shared slot already holds another account, and none in the tab that made
  the change. BroadcastChannel stays the primary path (T-028.2 security N3). The AC2 wording already limits it this way.
- **A10.** `renew`'s `session_invalid` path now bumps the generation (via `reset()` in `end`). Late answers of that
  epoch were already dropped, so behaviour is unchanged (T14).
- **A11.** `.claude/loop.config.md` › High paths does not list `src/features/auth/**`, while CLAUDE.md does. The ticket's
  hand-set Gate covers this ticket. The config gap is a follow-up (already noted in BUG-008), not part of this diff (R7).
- **A12.** jsdom under Node 22 has a global `BroadcastChannel`, so the default store in existing tests keeps a real
  endpoint and the fallback stays inactive there. Fallback tests always inject `create: () => undefined`.

## Blocking questions
None. Assumptions A1–A6 have stated defaults; Ming can override any of them at plan approval.

## Split proposal
None. The production change is about 150 lines; the tests are about 250–300 lines. That is one implement/review cycle
for an M ticket. If Ming prefers a smaller High-tier review, the consult's split applies: T-029.1 is the store and channel
(F1, F2, no UI: tokenStore, authChannel, accountId, fakeTabs and their tests), and T-029.2 is the retry UI and copy
(AuthGate, SignInScreen, types, copy, preview, Playwright). This plan would then cover T-029.1 first. Default: no split.
