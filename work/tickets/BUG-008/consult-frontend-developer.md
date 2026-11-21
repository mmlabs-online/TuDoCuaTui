## Findings

Both cases are confirmed by reading `src/features/auth/AuthGate.tsx` and `AuthGate.test.tsx`. I did not run anything.

**Case 1: stale mount-time list after continue → network → retry → restore → not_member (no join)**
- The mount-time list comes from `accounts` state (:73-75) via `loadAccounts` (:104-122). Only `clearAccounts` (:124-127) drops it. `enterReady` (:92) calls it, but nothing on the failure path does.
- `continueAs` (:404-421) catches the network error and calls `onTokenError` (:173). `canJoin` is false, so it goes to `failTo` and takes the `network` branch (:141-142), `setView(retry)`. The list state is untouched.
- "Thử lại" (:510-513) sets the view to `checking` and bumps `attempt`. The restore effect (:212-223) runs `store.restore()`. A `not_member` without `joinAvailable` goes `onTokenError` → `failTo` → `else` branch (:143-145), `setView(signed_out, error)`. `clearAccounts` is not called.
- The final render (:565-581) passes `accounts` to `SignInScreen`, so the stale list shows next to the `not_member` error. This contradicts A2 in `work/tickets/T-028.3/plan.md`: the list only on a cold page and after `session_invalid`.
- `failTo` is only reached with a non-`session_invalid`, non-unverified code from three sources: `onTokenError` (continue and restore), the background `subscribe` (:226-234, always `ready`, so already cleared), and `offerJoin`'s catch (:169-171).
- `signIn`'s own catch (:331-332) sets the view directly, so it is not affected by the fix. Only `email_unverified` goes through `failTo` there, and that is the first branch.

**Case 2: id cleared during `offerJoin`'s lookup → `session_invalid` but no re-list**
- `offerJoin` (:151-172) awaits `store.accountEmail()` (:155). In `tokenStore.ts:315-324` that returns `null` when the generation changed (:321), for example after `store.forget()` or a reset.
- Back in `offerJoin`, `store.accountId() === null` (:157), so the `setView` updater (:159-161) sets `signed_out` with `session_invalid` directly. It never calls `failTo`, so `loadAccounts()` (:138) never runs.
- The existing test at `AuthGate.test.tsx:537-549` exercises exactly this branch but asserts neither the list nor the accounts call count.

## Recommendations

Both map to the BUG-008 scope.

1. **Case 1.** In `failTo` (:128-146), call `clearAccounts()` in the non-`session_invalid` branches. The least invasive way:
   - Leave the `email_unverified` branch (:131-135) and the `session_invalid` branch (:136-140) as they are.
   - Add `clearAccounts();` as the first statement before `setView` in both the `retry` branch (:141-142) and the `else` branch (:143-145), or hoist a single call above the `if`.
   - `clearAccounts` bumps `listSeq`, so an in-flight cold `loadAccounts` answer is ignored. The `session_invalid` branch still re-lists via `loadAccounts`, which bumps the sequence again.

2. **Case 2.** In `offerJoin`, replace the updater at :159-161 with a view check followed by `failTo`:
   ```ts
   if (viewRef.current.kind === "checking") failTo({ code: "session_invalid" });
   return;
   ```
   - `failTo` already sets `signed_out` with `session_invalid` and calls `loadAccounts`.
   - Do not put `failTo` inside the functional `setView` updater, because side effects in an updater are unsafe, for example under StrictMode double invocation.
   - `viewRef` is refreshed on render (:85-86), so a remote sign-out that has just called `setView(signed_out)` may not be visible yet.
   - Optional hardening, still small: capture `const seq = signOutSeq.current` before the await and `return` if it changed. The remote sign-out handler bumps it (:189), so the remote-sign-out branch stays silent and the list is not re-fetched for it.
   - If this is judged beyond the minimal fix, record it as a follow-up.

**Paths checked against the fix**

| Path | Effect of the fix |
|---|---|
| Own sign-out (:259) and remote sign-out (:204) | Already `clearAccounts`. Unaffected. |
| "Dùng tài khoản khác" on join (:470) and unverified (:495) | Already clear. Unaffected. |
| Lost session `onAuthLost` (:268) | Already clears and never goes through `failTo`. Unaffected. |
| `session_invalid` re-list | The `failTo` branch (:136-140) is unchanged. `resendVerification` (:393-398) and `join` (:440) still re-list. Case 2 now re-lists too. |
| Join flows | The join screen's error stays in the view (:441). `join` → `enterReady` already clears. A join lookup failing with network goes through `failTo` → retry, and clearing is harmless because the success path clears anyway. |
| Unverified screen | The `email_unverified` branch is untouched. "Check again" → restore → `not_member` now clears the list. That is intended. |
| Cold page | Password sign-in errors set the view directly (:332), so the list is kept. This matches A2. A pending cold `loadAccounts` that is overtaken by a `failTo` is dropped through the `listSeq` bump (:113). That is correct. |

## Proposed regression tests

Both go in `describe("continue as")` (:889+), using `setup`, `continueAsMe`, `click`, `emailField`, `listBtn` and `alertText`. Both are deterministic and need no new helpers.

**T1 (must fail on main):** "continue -> network -> retry -> not_member (no join) -> form + error, no list, accounts called once".
```ts
const s = setup({ firstTokenError: err("network") });
await continueAsMe();
s.client.token.mockRejectedValueOnce(err("not_member"));
await click(await screen.findByRole("button", { name: AUTH_COPY.actions.retry }));
expect(await emailField()).toBeTruthy();
expect(alertText()).toContain(AUTH_COPY.errors.not_member);
expect(screen.queryByRole("button", { name: /^Tiếp tục với / })).toBeNull();
expect(s.client.accounts).toHaveBeenCalledTimes(1);
```
- On main the list button is present, so the `queryByRole(...)` null assertion fails.
- Mocking `token` after `continueAsMe` is safe: the first rejection is already consumed, and the retry is the second token call.

**T2 (must fail on main):** a sibling of the test at `AuthGate.test.tsx:537-549`. It can sit in the join `describe` or in `continue as`.
```ts
const s = setup({ id: ID, firstTokenError: { code: "not_member", joinAvailable: true } });
let release: (v: { accountId: string; email: string }[]) => void = () => {};
s.client.accounts.mockReturnValueOnce(new Promise((r) => (release = r)));
await waitFor(() => expect(s.client.accounts).toHaveBeenCalledTimes(1));
await act(async () => {
  s.store.forget();
  release([{ accountId: ID, email: "me@b.co" }]);
});
expect(await emailField()).toBeTruthy();
expect(alertText()).toContain(AUTH_COPY.errors.session_invalid);
expect(await listBtn("me@b.co")).toBeTruthy();
expect(s.client.accounts).toHaveBeenCalledTimes(2);
```
- On main `accounts` is called once and there is no list, so it fails.
- After the fix the second `accounts` call falls through to the default mock, which returns the list `[{ID, me@b.co}]`.
- Optionally add `expect(s.stored()).toBeNull()`.

**Optional guard test** for the `signOutSeq` hardening: while the lookup is pending, post a remote `signedOut` via `s.other.postMessage({ v: 1, type: "signedOut", accountId: ID, at: Date.now() })`, then release. Expect the sign-in form, the `signed_out` notice, no `session_invalid` alert, and `accounts` called once.

**Existing tests that would change:** none are expected to break. These need a glance, since all should still pass:
- `:537-549`: now also re-lists, which only adds an `accounts` call and a list button. It has no count assertion.
- `:1010-1017`, the network → retry success: `enterReady` clears the list anyway.
- `:1081-1093`, `:1000-1008` and `:1070-1079`: the `accounts` count stays 1.
- `:551-557`: restore with no account match goes through `offerJoin`'s `setView` at :164-168, not `failTo`, so it is untouched.
- Case 1 is the only behaviour change; no assertion in the suite expects a stale list after a failure.

## Risks
- Both changes are in `src/features/auth/**`, which is High risk, so Ming's plan approval is required.
- Hoisting `clearAccounts()` above the `email_unverified` branch would be wrong. The list is not shown there anyway, but it adds an unneeded behaviour change.
- The `viewRef` staleness described under the case 2 recommendation is the only subtle race. It is why I suggest the `signOutSeq` guard.
- `failTo`'s `rechecking.current = false` is already cleared by `offerJoin` (:152), so the case 2 reroute does not change that behaviour.

## Open questions
- Is the `signOutSeq` guard in `offerJoin` in scope for this bug, or a follow-up? I recommend including it only if it stays a 2-line change.
- T1 uses `not_member` as the restore result. Should `unknown` and `rate_limited` after a retry also be covered, for example via `it.each`? They route to the retry view, where the list is not shown anyway, so the value is low.

Files: `/home/user/TuDoCuaTui/src/features/auth/AuthGate.tsx`, `/home/user/TuDoCuaTui/src/features/auth/AuthGate.test.tsx`, `/home/user/TuDoCuaTui/src/features/auth/tokenStore.ts`, `/home/user/TuDoCuaTui/work/tickets/BUG-008/ticket.md`.
