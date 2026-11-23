Consult: T-029, finishing cross-tab sign-out (read-only, software-architect)

Files read:
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\tokenStore.ts
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\authChannel.ts
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\AuthGate.tsx
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\accountId.ts
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\fakeTabs.ts
- D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\auth\copy.ts and SignInScreen.tsx (notice block only)
- The T-028.2 plan, consult, review and security-review; BUG-007 ticket; BUG-008 plan; T-031 ticket; the board.

## Findings

1. **BUG-007 is MERGED, so the dependency is met.** `forgetStored(gone)` (tokenStore.ts:118-121) clears storage only while it still holds the departing id. All five places that clear storage already go through it.

2. **The paths that end a session are spread out and do not match each other.**
   - `signOut` (:253) runs `reset()`, `forgetStored` and `post signedOut`.
   - `forget` (:283) runs `reset()` and `forgetStored`. It posts nothing.
   - The `session_invalid` branch of `renew` (:159-164) clears token, id and email and calls `forgetStored` and `disarm`. It does **not** call `reset()` (no generation bump) and posts nothing.
   - `join`'s `session_invalid` branch (:331-335) clears only id and email: no `reset()`, no `disarm`, no post. The ticket's F1 list does not name it, but it is the same device-wide fact.
   - The remote handler `onMessage` (:224-229) runs `reset()` and `forgetStored` and notifies.
   - Five copies of "end the session" is the root cause of F1. Adding a `post` call to each copy would make it worse.

3. **Who calls `forget()`.**
   - `onAuthLost`: the Node API answered 401 twice with a freshly fetched token (authFetch.ts:48).
   - `resendVerification` → `session_invalid`.
   - JoinScreen "Dùng tài khoản khác" and UnverifiedScreen "Dùng tài khoản khác". These two are user choices; the Identity session for X is still valid.
   - So "broadcast signedOut on every `forget()`" (the ticket's AC1) also sends a "signed out" message for those two cases, which is not strictly true. However, `forget()` already removes X from the shared `mm_account_id`, and the F2 storage-event fallback cannot tell why the key was removed. Broadcasting on every `forget()` is therefore the only rule that behaves the same with and without BroadcastChannel.

4. **The store cannot tell whether a real BroadcastChannel exists.** `createAuthChannel` quietly becomes a no-op when the API is missing or the constructor throws (authChannel.ts:57-77). Its `subscribe` returns `() => {}` when there is no endpoint, which is the natural place to plug in the F2 fallback.

5. **Limits of F2.** `mm_account_id` is one shared slot. Tab A signing out X fires a storage event only if storage still holds X. If tab C has since stored Y, tabs on X get no event without BroadcastChannel. This is acceptable as best effort, but the plan should say so. The AC2 wording ("removing mm_account_id for the tab's account") already limits it correctly.

6. **Retry sign-out today.** The `logout_unconfirmed` notice is set in AuthGate `onSignOut` (:248-255) and guarded by `signOutSeq`. AuthGate never sees the departing id, because `signOut()` captures `gone` internally. `signOut` already wraps `/logout` in `lock.run`, which waits for another tab's renewal.

7. **What the receiving tab shows.** It always shows the "Bạn đã đăng xuất." notice with no account list (A2). After F1, a tab B whose account X died with `session_invalid` in tab A will show "you signed out". Tab A shows the `session_invalid` error and re-lists the accounts. The two tabs disagree about the same event.

## Recommendations

R1 (AC1). **Put all teardown in one private helper in the store**, for example `end(gone, { broadcast })`. It would:
- call `reset()`,
- null `id` and `email`,
- call `forgetStored(gone)`,
- post `signedOut` only when `broadcast && gone`.

Route `signOut`, `forget`, `renew`'s `session_invalid` branch and `join`'s `session_invalid` branch through it with `broadcast: true`. Route `onMessage` through it with `broadcast: false`; a received message must never be re-broadcast, or tabs ping-pong.
- Side effect to accept and test: `renew`'s `session_invalid` path now bumps the generation. Late answers from that epoch are dropped either way, so this is safe.
- Doing the broadcast in the store means `onAuthLost` and `resendVerification` in AuthGate need **no change**. That keeps AuthGate edits small; see the hotspots under Risks.

R2 (AC1, a cheap hardening). **Record the time each session starts** (`sessionAt`, set in `adopt`). In `onMessage`, ignore a `signedOut` whose `at < sessionAt`.
- This closes a small race: tab A's late `session_invalid` for an old X session must not kill a fresh X sign-in in tab B.
- It is a one-line guard. It also applies to the existing explicit sign-out message.

R3 (AC2). **Implement F2 inside `createAuthChannel` as a second inbound transport.** It is active only when there is no endpoint (missing API or a constructor that throws).
- Inject `win` (`addEventListener` / `removeEventListener` for `"storage"`).
- On `key === ACCOUNT_ID_KEY && newValue === null && UUID_RE.test(oldValue)`, deliver a synthetic `{ v: 1, type: "signedOut", accountId: oldValue, at: now() }` to subscribers.
- Ignore X→Y changes and `key === null` (`localStorage.clear()`); see open question 3.
- Export the key constant from accountId.ts rather than duplicating the string.
- `post` stays a no-op. The storage removal is the signal, so nothing new is written and no token ever goes into storage.
- tokenStore's `onMessage` already filters by account (case-insensitive), which gives "other accounts unaffected" for free.
- Alternative: an optional `AccountIdStorage.watch(onRemoved)` plus `AuthChannel.connected`, with the store deciding. This keeps knowledge of the key in accountId.ts, but adds a second injectable and a branch in `start()`. I recommend the first option because it keeps the store's inbound path single.

R4 (AC3). **Give the retry as a capability, not an id.** Change the signature to:
```ts
signOut(): Promise<{ confirmed: true } | { confirmed: false; retry: () => Promise<{ confirmed: boolean }> }>
```
- `retry` closes over `gone`, so the id stays in memory only and the UI layer never gets an "end any account" function.
- `retry` reuses the same `lock.run(() => client.logout(gone), { waitMs: SIGN_OUT_WAIT_MS })` tail, with the same confirmed rule (2xx or `session_invalid`).
- On confirmed, it posts `signedOut(gone)` and calls `forgetStored(gone)`. Another tab may have signed in as X again in the meantime, and the device's Identity session for X is now gone. Post **after** confirmation, not before: a failed retry should not sign other tabs out locally while Identity still holds the session.

In AuthGate:
- Keep `retry` in a ref tied to the `signOutSeq` value captured at `onSignOut`.
- Drop the ref wherever `signOutSeq` is bumped (goto, signIn, continueAs, the remote sign-out handler).
- A `retrying` ref plus a disabled button gives exactly one `/logout` per click.
- On success with an unchanged seq, set notice `"signed_out"`. On failure, keep `logout_unconfirmed` and offer the button again.
- Do not bump `signOutSeq` when the retry starts. Only read it.

R5 (AC3, R6). **Keep SignInScreen presentational.** Add `onRetrySignOut?: () => void` and `retryingSignOut?: boolean`, and render the button only with `notice === "logout_unconfirmed"`. Put the new copy in copy.ts: the action label "Thử đăng xuất lại" and a busy label.

R6 (tests, R8).
- Add a `createFakeStorageHub()` to fakeTabs.ts. It shares one map and sends `storage` events to every *other* fake window, never the writer, matching real browser behaviour.
- Cases for tabs.test.ts:
  - `session_invalid` in A (via renewal and via join) signs out B.
  - `forget` in A signs out B.
  - `onAuthLost` in A signs out B, at AuthGate level.
  - B on account Y is not affected.
  - A received message is not re-broadcast (post count).
  - A stale `signedOut` with `at < sessionAt` is ignored.
  - No BroadcastChannel: removing X signs out B on X; X→Y does not; removing Y leaves X alone.
  - The retry calls `logout` once while a double click is ignored; on success it posts and clears storage; a late result after a seq bump does nothing.

R7 (AC4). The one-off Playwright check (390 px, dark mode) applies only to the notice plus button. Record it in impl-log, as in T-028.2.

## Risks

1. **Hotspot: AuthGate.tsx with BUG-008.** BUG-008 is BLOCKED waiting for plan approval and sits above T-029 on the board. It edits `failTo` and `offerJoin` and makes `signOutSeq` mean "a remote sign-out happened" inside `offerJoin`. T-029 edits `onSignOut`, the render props and possibly the remote handler.
   - The text overlap is small, but the meaning is coupled. With R1, remote sign-outs become more frequent (from `forget` and `session_invalid` in other tabs), so BUG-008's T3 race becomes more reachable.
   - T-029 must not change when `signOutSeq` is bumped.
   - Recommendation: whichever lands second rebases and re-runs BUG-008's T1–T3. If BUG-008 is approved soon, land it first; it is about 6 lines. Otherwise T-029 keeps its AuthGate changes limited to R4 and R5.

2. **Hotspot: SignInScreen.tsx and SignInScreen.test.tsx with T-031.** T-031 removes the `email_unverified` banner and resend; T-029 adds the retry button in the notice block. The props interface conflicts. T-031 depends on BUG-008, not T-029, so it could land either way. Its plan must keep T-029's retry tests and props.

3. **The broadcast amplifies `onAuthLost`.** A server-side 401 bug (wrong JWKS or audience after a deploy, clock skew) now signs out every tab at once instead of one at a time. This is local only: `forget` makes no `/logout` call, and the other tabs would hit the same 401 anyway. Acceptable, but it should be written down.

4. **UX of "Dùng tài khoản khác".** Choosing another account in tab A kicks tab B (same account X) to "Bạn đã đăng xuất.". This is rare, because B is usually not member or unverified on the same X too. See open question 1.

5. **Retry kills a new X session.** If tab B signed in as X again after A's unconfirmed sign-out, A's successful retry ends B's session. This is the intended meaning of logout (it is device-wide at Identity), but it may surprise a user. See open question 2.

6. **F2 is best effort.** It misses events when the shared slot holds another account, and the storage event does not fire in the tab that caused it. Both are acceptable, and BroadcastChannel stays the primary path (security N3 accepted this).

7. **Gate config gap.** `.claude/loop.config.md` › High paths does not list `src/features/auth/**`, while CLAUDE.md does (also noted in BUG-008's follow-ups). The ticket sets `Gate: plan-approval` by hand, so it is fine here.

8. **Size and split.** M is about right. If Ming wants a smaller High-tier review, split it:
   - T-029.1: store and channel (F1, F2), with no UI.
   - T-029.2: the retry UI and copy (needs Ming's copy decision and Playwright; it conflicts with T-031).

   Default: no split.

## Open questions (batch for Ming, each with a default)

1. Should "Dùng tài khoản khác" also broadcast `signedOut`? It is a local choice, and X's Identity session is still valid.
   - Default: **yes**. It matches AC1 as written, and the F2 fallback cannot tell the cases apart anyway, so both paths stay consistent.

2. When a retry sign-out succeeds, should it also sign out other tabs that signed in to the same account again in the meantime?
   - Default: **yes**, posting only after Identity confirms.

3. Should the storage fallback treat `localStorage.clear()` (`key === null`) as a sign-out?
   - Default: **no**. Only an explicit removal of `mm_account_id` counts.

4. What should a tab show when it receives a sign-out caused by another tab's `session_invalid`: "Bạn đã đăng xuất." (current), or the `session_invalid` error plus the account re-list?
   - Default: **keep the plain notice** and add no `reason` field. The schema stays the same and A2 still holds.

5. Copy. The approved `logoutUnconfirmed` text (A6, adjusted after S1) tells the user to sign in and out again or clear cookies. With the button, should it say "kết nối mạng rồi bấm «Thử đăng xuất lại»"?
   - Default: keep the current text. Add only the button label "Thử đăng xuất lại" and the busy label "Đang đăng xuất…".

6. Order relative to BUG-008: wait for BUG-008 to land, or go ahead and rebase later?
   - Default: go ahead. Keep AuthGate edits to R4 and R5, and re-run BUG-008's T1–T3 on whichever lands second.
