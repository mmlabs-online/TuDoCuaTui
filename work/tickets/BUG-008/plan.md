Status: READY

# Plan — BUG-008: Stale "Tiếp tục với" list after a retry, and no re-list after a join-lookup sign-out

## Scope summary
Scope reference is the bug report in `work/tickets/BUG-008/ticket.md`:

> **Expected**
> - Case 1: sign-in form with the error and no stale list (A2: list only on a cold page and after `session_invalid`).
> - Case 2: the list is re-fetched from Identity, as for any other `session_invalid`.

> **Scope**
> - Call `clearAccounts()` in `failTo`'s non-`session_invalid` branches; route the `offerJoin` branch through `failTo`. Nothing else.

The rule both cases break is approved assumption A2 in `work/tickets/T-028.3/plan.md`:

> - It shows only on a cold sign-in page with no stored account, and after an Identity `session_invalid` (contract: "re-list the accounts").
> - It never shows right after an own sign-out, a sign-out from another tab, "Dùng tài khoản khác" or a lost session (`onAuthLost`). In those cases only the form shows.

Sources: T-028.3 `review.md` attempt 1, Issue 1, and the follow-ups of attempts 1 and 2 (":157-161 sets `session_invalid` without a re-list"). T-028.3 `security-review.md` attempt 2, item 5 ("a one-line follow-up (`clearAccounts()` in `failTo`'s non-`session_invalid` branches)").

### Root cause (confirmed, file:line on `main` @ 8cc1f31)
- **Case 1.** `src/features/auth/AuthGate.tsx:128-146` `failTo`. The `retry` branch (:141-142) and the `else` → `signed_out` branch (:143-145) call `setView` without touching `accounts`. The flow is:
  1. Continue → `/token` network error (`continueAs` :404-421 → `onTokenError` :173 → `failTo` → retry). The mount-time list stays in state.
  2. "Thử lại" → restore effect (:212-223) → `not_member` without join → `failTo` `else` → `signed_out`.
  3. The render passes the old `accounts` array to `SignInScreen`, so the stale list shows.
  
  `enterReady` (:92) is the only failure-free path that clears the list.
- **Case 2.** `AuthGate.tsx:151-172` `offerJoin` awaits `store.accountEmail()` (:155). That returns `null` when the store's generation changed (`tokenStore.ts:321`, through `forget()`/`reset()`). Back in `offerJoin`, `store.accountId() === null` (:157), and the updater at :159-161 sets `{ kind: "signed_out", error: { code: "session_invalid" } }` directly. It bypasses `failTo` and never reaches `loadAccounts()` (:138).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces case 1 (continue → network → retry → not_member → no list) and fails on `main` before the fix. | Test T1 (below) passes on the branch. Reviewer reverts only the `AuthGate.tsx` change (`git stash` / `git checkout main -- src/features/auth/AuthGate.tsx`) and T1 fails on the `queryByRole(/^Tiếp tục với /)` null assertion. Recorded in impl-log. |
| 2 | A regression test for case 2 (id cleared during the join lookup → accounts re-listed). | Test T2 passes on the branch and fails with `main`'s `AuthGate.tsx` (accounts called once, no list button). Recorded in impl-log. |
| 3 | A remote sign-out during the join lookup still shows the plain "signed out" notice with no list and no extra `/accounts` call (A2 is not regressed by the case 2 reroute). | Test T3 passes on the branch. It also passes on `main`, because it guards the change and is not a regression test. Reviewer additionally removes the `signOutSeq` guard line, and T3 must fail. Recorded in impl-log. |
| 4 | All checks pass; no existing test changed. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` green; `git diff main -- src/features/auth/AuthGate.test.tsx` shows additions only. |

## Ming verification after merge
- Optional, on the deployed app: on a cold sign-in page with an account listed, take the device offline, click "Tiếp tục với …", go back online and press "Thử lại". If Identity answers `not_member`, the form shows the error with no "Tiếp tục với" list. The reviewer cannot trigger a real `not_member` locally without Identity, so the unit tests are the evidence.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/auth/AuthGate.tsx` | `failTo`: `clearAccounts()` before `setView` in the `retry` and `else` branches. `offerJoin`: capture `signOutSeq.current` before the await. In the "signed out meanwhile" branch, call `failTo({ code: "session_invalid" })` when the seq is unchanged, instead of the `setView` updater. Update that branch's comment. About 6 changed lines. | Fix for both cases | **Yes**: `src/features/auth/**` (CLAUDE.md risk tiers, auth flow). Gate: plan approval. |
| `src/features/auth/AuthGate.test.tsx` | Add tests T1, T2, T3 to `describe("continue as")`. No existing test edited. | Regression and guard tests (D42, R8) | Yes (same folder) |

No other file is touched.

## Tests to write
All tests go in `src/features/auth/AuthGate.test.tsx` › `describe("continue as")` (:889+). They reuse `setup`, `continueAsMe`, `click`, `listBtn`, `emailField`, `alertText`, `err` and `ID`. No new helpers, timers or mocks of React internals are used, so all three are deterministic. Bug test level: unit (Vitest, jsdom), per `loop.config.md`.

| Test (file › name) | Covers |
|---|---|
| **T1 (regression, must fail on main)** `AuthGate.test.tsx › continue as › continue -> network -> retry -> not_member (no join) -> form + error, no list, accounts called once` | Case 1. Steps: `setup({ firstTokenError: err("network") })`, then `continueAsMe()`, then `s.client.token.mockRejectedValueOnce(err("not_member"))`, then click `AUTH_COPY.actions.retry`. Expect the email field, `alertText()` containing `AUTH_COPY.errors.not_member`, `queryByRole("button", { name: /^Tiếp tục với / })` null, and `s.client.accounts` called exactly once. On main the null assertion fails. |
| **T2 (regression, must fail on main)** `AuthGate.test.tsx › continue as › restore: id cleared while the join lookup runs -> form + session_invalid + accounts re-listed` | Case 2. Steps: `setup({ id: ID, firstTokenError: { code: "not_member", joinAvailable: true } })`, then `s.client.accounts.mockReturnValueOnce(<pending promise>)`, then `waitFor` accounts called once. Then, in one `act`: `s.store.forget()` and release `[{ accountId: ID, email: "me@b.co" }]`. Expect the email field, `alertText()` containing `AUTH_COPY.errors.session_invalid`, `await listBtn("me@b.co")` present (the second call falls through to `setup`'s default mock), `s.client.accounts` called exactly twice, and `s.stored()` null. On main accounts is called once and there is no list. |
| **T3 (guard, passes on main)** `AuthGate.test.tsx › continue as › remote sign-out while the join lookup runs -> signed-out notice, no list, no re-list` | Remote-sign-out race on the rerouted branch. Same setup and pending `accounts` as T2. Then, in **one** `act`: `s.other.postMessage({ v: 1, type: "signedOut", accountId: ID, at: Date.now() })`, then `await Promise.resolve()` (the fake channel delivers on a microtask, `fakeTabs.ts:68`), then release the list. Expect the email field, `getByRole("status")` containing `AUTH_COPY.signIn.signedOut`, `queryByRole("alert")` null, no `/^Tiếp tục với /` button, and `s.client.accounts` called once. Because the remote handler's `setView` has not rendered inside the `act`, a fix without the `signOutSeq` guard would call `failTo` here and fail T3. |


## Approach
1. **Tests first.** Add T1 and T2, run `pnpm test src/features/auth/AuthGate.test.tsx` on the unchanged `AuthGate.tsx`, and confirm both fail for the stated reason. Paste the failure lines into impl-log. Add T3 and confirm it passes on main.
2. **Case 1, `failTo`** (`AuthGate.tsx:141-145`). Add `clearAccounts();` as the first statement inside the `retry` branch and inside the `else` branch. Do **not** hoist it above the `email_unverified` branch (:131-135), so that branch is unchanged. Leave the `session_invalid` branch (:136-140) unchanged; it re-lists through `loadAccounts`, which bumps `listSeq` again. `clearAccounts` bumps `listSeq`, so a pending cold `/accounts` answer that this failure overtakes is dropped.
3. **Case 2, `offerJoin`** (`AuthGate.tsx:151-162`).
   - Add `const seq = signOutSeq.current;` before `await store.accountEmail()`.
   - Replace the `setView((v) => v.kind === "checking" ? … : v)` updater with `if (seq === signOutSeq.current) failTo({ code: "session_invalid" }); return;`.
   - Update the comment to: "signed out meanwhile: a remote sign-out bumped signOutSeq and already moved the view; otherwise (id cleared by session_invalid) go to sign-in and re-list via failTo".
   - Keep `if (!live()) return;` before it, and keep the rest of `offerJoin` (join / `not_member` / catch) unchanged.
4. Run the checks: `pnpm format`, then `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
5. Run the reverse checks for impl-log:
   - With `main`'s `AuthGate.tsx`, T1 and T2 fail.
   - With the branch's `AuthGate.tsx` minus the `seq` guard, T3 fails.
   - Restore the branch version.

Rules:
- R1 (no data access change).
- R6 (no new copy; tests use `AUTH_COPY`).
- R7 (only the two changes named in the ticket, plus the guard that makes the reroute safe; see below).
- R8 / D42 (regression tests that fail first).
- R9: no UI or layout change, so there is no viewport or dark-mode impact.

## Specialist input used
From `consult-frontend-developer.md`:
- **Recommendation 1** (`clearAccounts()` in the `retry` and `else` branches only, not hoisted above `email_unverified`): **adopted** as written.
- **Recommendation 2** (route the "signed out meanwhile" branch through `failTo` outside the `setView` updater): **adopted**, but without the `viewRef.current.kind === "checking"` test.
  - `viewRef` is refreshed only on render, so it can be stale in both directions.
  - Stale "checking" after a remote sign-out would re-list over the signed-out notice, which breaks A2.
  - Stale non-"checking" (for example "ready" right after `subscribe` → `offerJoin` before a render) would leave the spinner stuck, which the existing test at :537 forbids.
  - The `signOutSeq` capture is the explicit signal for the only competing writer (the remote sign-out handler, :189). `live()` still covers the restore effect's cleanup.
- **Optional `signOutSeq` guard**: **adopted, in scope.** Without it, the reroute itself would regress A2 in the remote-sign-out race. Main's updater form handles that race today, and the naive `failTo` does not. It is one line plus the capture, so it stays inside the ticket's "route the `offerJoin` branch through `failTo`".
- **Regression tests T1/T2**: **adopted** (T2 moved into `continue as` to reuse `listBtn`; adds `s.stored()` null).
- **Optional guard test**: **adopted** as T3, and made to fail without the guard by doing the post, the microtask and the release in one `act`.
- **`it.each` over `unknown` / `rate_limited` after retry**: **rejected.** Those codes land on the retry view, where no list renders, so they add little value (R7).
- **"Existing tests that would change: none"**: **confirmed** by reading the tests below. None of them asserts a stale list or a single `/accounts` call on a path whose behaviour changes:
  - :537-549 now also re-lists, but it has no count or list assertion and its sign-in form assertions still hold.
  - :1010-1017 (retry → App) is unchanged.
  - :551-557 goes through offerJoin's `not_member` setView, which is untouched.
  - :1081-1093 stays at one accounts call.
  - :1132-1147 (remote sign-out during continue) is not on `offerJoin`.

## Assumptions
For Ming's approval at the gate:
- **B1.** After any non-`session_invalid` failure (retry view, or the form with `not_member` / `no_access` / other errors), the "Tiếp tục với" list is dropped for the rest of the page's life. It only comes back after a reload (cold page) or an Identity `session_invalid`. This is A2 applied literally. It also means the unverified screen's "Tôi đã xác minh email" → `not_member` now shows the form without a list.
- **B2.** When the account id disappears during the join lookup, the result is the form, the `session_invalid` error and a fresh list from Identity. This happens when the id was cleared by `forget()` or a `session_invalid` in the store. A remote sign-out in the same window keeps today's behaviour: the "Đã đăng xuất" notice, no error and no list.
- **B3.** The `signOutSeq` guard is part of this fix, not a follow-up. It adds 2 lines.

Non-blocking:
- No hotspot: no other ticket is `IN_PROGRESS`/`REVIEW`/`DONE`. T-031 (BACKLOG, depends on BUG-008) may later touch `AuthGate.tsx` and will rebase on this.
- Size: about 6 product lines and about 50 test lines, well under one cycle.
- `src/features/auth/**` is High per `CLAUDE.md` (risk tiers), though `.claude/loop.config.md` › High paths does not list it. The ticket's `Gate: plan-approval` is followed.

## Blocking questions
None

## Split proposal
None

## Follow-ups (not in this diff, R7)
- `.claude/loop.config.md` › High paths does not list `src/features/auth/**`, while `CLAUDE.md` › Risk tiers does. Align them, or the `/run` gate may miss auth tickets that do not set `Gate` by hand.
- `signIn`'s catch (:331-332) sets `signed_out` errors directly. On a cold page that keeps the list, which A2 allows. No change is needed, but note it if A2 is ever narrowed.
