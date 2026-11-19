# Review — T-028.3

## Attempt 1 — 2026-11-19
Verdict: REWORK

Reviewed commit d9f2fca (`git diff origin/main...HEAD`, 17 files, +860/−51; 16 under `src/features/auth/`, plus impl-log.md).

### Checks (run by reviewer)
- `pnpm typecheck` — pass (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- `pnpm format:check` — pass ("All matched files use the correct format.", 334 files).
- `pnpm test` — pass: Test Files 136 passed | 11 skipped (147); Tests 1869 passed | 222 skipped (2091). Matches impl-log.
- `pnpm build` — pass (built in 426 ms).
- One-off Playwright (D42, R9), repeated by the reviewer: `vite --port 5291`, `/auth-preview.html`, viewport 390×844, "Khung 390px" on, light and dark. States: signIn `accounts`, `accounts_long`, `continuing`; unverified `idle`, `sending`, `sent`, `still` (14 runs). `scrollWidth` = 390 in all runs; 0 elements in `<main>` past 390 px. Background: light `rgb(246, 241, 231)`, dark `rgb(20, 32, 27)`. `continuing`: the chosen button and the form submit read "Đang đăng nhập…" and all 4 buttons are disabled. `sending`: only resend is disabled. I looked at the screenshots: the long email wraps onto two lines inside the primary button, and the unverified body wraps the long email. Text is readable in both themes. Dev server stopped afterwards. Script and screenshots are in the scratchpad only.

### Acceptance criteria
- [x] AC1: list with one button per account, one click → token(id), id stored, App rendered, no login or join. Evidence: `AuthGate.test.tsx › continue as › list -> one click -> …`; `SignInScreen.test.tsx › one button per account …`; `tokenStore.test.ts › continueAs writes the id …`. Cap 5, server order kept and case-insensitive dedupe (A1): `… the list is capped at 5 and deduped …` (8 items → u1, u2, dup1, u3, u4). This test genuinely checks order, dedupe and the cap.
- [x] AC1a: join flows are unchanged. Evidence: `continue -> not_member + join_available -> join screen …, accounts called once, join only on click; join_closed …`; the existing join suite still passes (one assertion changed from 0 to 1 accounts calls, as planned).
- [x] AC1b: double click → one `/token`. Evidence: `double click on a continue button -> one /token`. The `continuing` ref (AuthGate.tsx:403) guards it, and the button is also disabled after the first click.
- [x] AC1c: continue → `session_invalid` → form + error + re-list, id cleared. Evidence: `continue -> session_invalid -> …` (accounts ×2, stored null).
- [x] AC2: `[]` or any failure → form only, no banner. Evidence: `accounts [] -> form only`; `it.each` over network/rate_limited/session_invalid/unknown. The 5 s timeout: `identityClient.ts:180-182` and `identityClient.test.ts › accounts carries an AbortSignal …`. An abort ends in the `get` catch, which maps it to `network`.
- [x] AC2a: loader while pending (no form flash), and a stored id never lists. Evidence: `no id -> checking notice while accounts is pending …`; `id stored -> accounts not called`.
- [ ] AC2b / A2 "the list shows **only** on a cold sign-in page and after `session_invalid`": the four named exits clear the list, and each has a test. But a list loaded at mount survives into later sign-in pages. See Issue 1.
- [x] AC3: `email_unverified` → `UnverifiedScreen` via `failTo` (AuthGate.tsx:130-134) from password sign-in (:329), continue (:413 → onTokenError), restore and the background subscriber (:230). Evidence: `UnverifiedScreen.test.tsx` (4 tests); AuthGate tests for password sign-in, continue, restore (id kept, generic body), re-check → `still`, resend → sent, resend 409 → App (the changed existing test), resend `session_invalid` → form + re-list, and "Dùng tài khoản khác" → no logout and no list.
- [x] A6: unverified accounts are listed, and clicking one opens the verify screen with the listed email (`continue -> email_unverified -> unverified screen with the list email`).
- [x] AC4 (R6): copy lives only in `copy.ts` (`copy.test.ts › continue-as and unverified copy` pins it). A grep found no Vietnamese literals in `AuthGate.tsx`, `SignInScreen.tsx` or `UnverifiedScreen.tsx`.
- [x] AC5 (R9): the reviewer's Playwright run above.
- [x] AC6: all checks green.

Epoch and multi-account: `continueAs` → `adopt()` (tokenStore.ts:226-232): `reset()` bumps the epoch, and the store posts no `signedOut` and calls no `/logout`. Evidence: `tokenStore.test.ts › drops a late /token answer of the previous epoch`, `› posts no signedOut …`. `tabs.test.ts › tab A signed in as X, tab B continueAs Y` shows A keeps tok1 (B got tok2 from the shared counter, so the test can tell the two apart) and A is never signed out. Remote sign-out during a continue: renew returns null (epoch) → no App (`remote sign-out during a continue -> App never rendered`).

### Issues
#### Issue 1 — 🔴 blocker — approved assumption A2 / plan Approach §3 not met (stale list)
- **Where**: `src/features/auth/AuthGate.tsx:90-98` (`enterReady` keeps `accounts`), `:140-144` (`failTo` non-`session_invalid` branches), `:438` (join `session_invalid`), `:576` (the list is passed whenever `accounts` is an array).
- **Expected** (plan A2, approved by Ming): the list shows only on a cold sign-in page with no stored account, and after an Identity `session_invalid` (re-listed). Plan §3: "Load the list only (a) on that mount and (b) whenever the gate enters `signed_out` because of `session_invalid` … This covers restore, continue, **join**, the background refresh and resend."
- **Actual**:
  - The list loaded at mount is never dropped when the gate leaves the sign-in page (continue or password sign-in → `ready`/join/unverified/retry). Any later return to the sign-in form that is not one of the four cleared exits shows that old list again. Reachable examples: a background refresh `not_member` without join (`subscribe` → `failTo` → `signed_out`), and continue → network → Retry → restore → `not_member` without join. Both show the mount-time list again.
  - `join()`'s catch at :438 sets `signed_out` with `session_invalid` directly, so it neither re-lists (plan §3 says join is covered) nor clears. The user sees the mount-time list, which can include the account Identity just called invalid.
  - No test covers either path.
- **Fix instruction**:
  1. Drop the list when the gate leaves the sign-in page for good: call `clearAccounts()` in `enterReady()`, which covers continue and password sign-in. Do not clear it in `goto()`.
  2. In `join()`'s catch, route `session_invalid` through `failTo(err)` instead of `setView(...)`, so it re-lists as the plan says. Keep the `stale()` guard.
  3. Add these tests in `AuthGate.test.tsx › continue as`:
     - "continue → App → background `not_member` (no join) → form with the error, no list, accounts called once". Use the existing `subscribe`/getToken pattern the background tests already use.
     - "continue → join screen → join `session_invalid` → form + error, accounts re-listed (called twice)".

### Rules (CLAUDE.md)
- R1: no new `fetch` outside `identityClient.ts`; `boundary.test.ts` passes.
- R3: nothing secret. The token stays in memory; only `mm_account_id` is written.
- R6: met. R8: met except the gap in Issue 1. R9: met (Playwright above).
- R7 (scope): `AuthRoot.test.tsx` is outside the plan's file list but is justified under "Out-of-plan files". It is a test-only, mechanical change: the cold page now makes one `/accounts` call, so expected fetch counts go 1 → 2 and the form is awaited. Accepted.
- Implementer's test deviations:
  1. "Remote sign-out while the list loads" was dropped. Accepted: `tokenStore.ts:207` ignores every message while `id` is null, and the list loads only while `id` is null (cold page, or after `session_invalid` cleared it), so the race cannot happen. `listSeq` still guards it.
  2. The own and remote sign-out tests were merged. Accepted: the own sign-out test and "remote sign-out during a continue" both assert no list and accounts called once.
  3. The extra join-screen "Dùng tài khoản khác" test: accepted (more coverage).
  4. `goSignUp`/`goForgot` were made async: mechanical, and the plan allowed it.
  5. The resend 409 case lives in the changed existing cross-tab test. Accepted.

  No R7/R8 violation from these.
- No other violations found.

### Blockers from review agents
None (orchestrator to add `security-review.md` 🔴 findings if the security trigger ran).

### Nits (do not block)
- 💭 `SignInScreen.test.tsx:225`: `queryByRole("group", …)` is always null, because the list is a `<section aria-label>` (role `region`). Query `"region"` so the assertion can fail.
- 💭 `AuthGate.tsx:483-488` / `:128-129`: `rechecking` is consumed only by `failTo`/`enterReady`. A re-check that lands on the join screen leaves it `true`. After "Dùng tài khoản khác" there, a fresh sign-in into another unverified account would open the verify screen with `still` already set. Reset `rechecking.current = false` in `offerJoin` or in the two "other account" handlers.
- 💭 `UnverifiedScreen` `still` state: the `errors.email_unverified` text largely repeats the body. Acceptable, but a shorter "still not verified" line would read better.
- 💭 In `accounts_long` at 390 px, the `Btn` arrow icon is squeezed into an oval next to the two-line label (same Btn as the join screen). This is cosmetic.

### Ming verification after merge
- On production, while signed in to another mmlabs app on the same browser: open TuDoCuaTui signed out. "Tiếp tục với {email}" shows, and one click opens the app (or the join screen for a new member).
- With a new, unverified account: the "Xác minh email" screen shows, resend delivers an email, and after you open the link in another tab, "Tôi đã xác minh email" enters the app.
- Real `/accounts` latency on a cold page: the loader should be brief.

### Follow-ups (out of scope)
- As in plan.md: conditional `storage.clear()`, `signedOut` on forget, removing the unreachable SignInScreen `email_unverified` banner, `display_name`/badges, the "không phải tôi" hide option, and a `Retry-After` countdown.
- `offerJoin`'s "signed out meanwhile" branch (AuthGate.tsx:157-159) sets `session_invalid` without a re-list. Consider routing it through `failTo` along with Issue 1's join fix.

## Attempt 2 — 2026-11-19
Verdict: PASS

Reviewed commit e894ba9. Delta `git diff d9f2fca..e894ba9`: in `src/`, only `AuthGate.tsx` (+2/−1 code lines), `AuthGate.test.tsx` (+3 tests) and `SignInScreen.test.tsx` (1 line). The whole ticket (`git diff origin/main...HEAD`, 20 files, +1059/−54) touches the same 16 `src/features/auth/` files as attempt 1, plus the ticket's `work/` files. No new files and no new High path beyond what the plan named.

### Checks (run by reviewer)
- `pnpm typecheck` — pass (exit 0).
- `pnpm format:check` — pass (exit 0, 334 files).
- `pnpm test` — pass: Test Files 136 passed | 11 skipped (147); Tests 1872 passed | 222 skipped (2094). Matches impl-log attempt 2 (+3 tests compared with attempt 1).
- `pnpm build` — pass (built in 438 ms).
- No visual change in this delta (logic and tests only), so I did not run Playwright again. The attempt-1 390 px / dark-mode evidence still applies.

### Issue 1 (attempt 1) — fixed
- `AuthGate.tsx:92`: `enterReady()` now calls `clearAccounts()`, which bumps `listSeq` and sets the list to null. Every path that reaches the app (continue, password sign-in, join, restore, retry → restore) drops the mount-time list, and a late `/accounts` answer is ignored. I checked that this breaks nothing. The list renders only in `signed_out`/`signIn`. The mount effect (`:180-183`) runs once. Each later sign-in page either clears the list (the four A2 exits: `:204`, `:259`, `:268`, `:470`, `:495`) or re-lists it (`failTo` session_invalid, `:136-139`). So nothing depends on the list surviving `ready`.
- `AuthGate.tsx:440`: join's `session_invalid` now goes through `failTo(err)`, so it re-lists (plan §3). The `stale()` guard still runs first (`:436`). `failTo` cannot take the `email_unverified` branch for this code.
- The A2 exits still clear the list: own sign-out, remote sign-out (`:204`), and "Dùng tài khoản khác" on join (`:470`) and on unverified (`:495`) are unchanged. Their existing tests pass ("own sign-out -> form only, accounts not called again", "remote sign-out during a continue …", and the other-account tests).
- **The tests fail without the fix. I checked this myself** in a scratch copy of e894ba9 (`/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/rv-t0283b/`, node_modules symlinked):
  - With d9f2fca's `AuthGate.tsx`: exactly the 3 new tests fail; the other 78 pass.
  - With each change reverted on its own, exactly one test fails:
    - remove the `clearAccounts()` in `enterReady` → only "continue -> App -> background not_member (no join) …" fails;
    - put back `setView({ kind: "signed_out", error: err })` in join → only "continue -> join screen -> join session_invalid … re-listed" fails;
    - remove `rechecking.current = false` in `offerJoin` → only "re-check leading to the join screen -> other account …" fails.
  So each change is pinned by its own test.

### Acceptance criteria
- [x] AC2b / A2: the list shows only on a cold sign-in page and after `session_invalid`. Evidence: `AuthGate.tsx:92` and `:440`, plus the two new tests above (background `not_member`: no list, accounts ×1; join `session_invalid`: list re-shown, accounts ×2).
- [x] AC1, AC1a, AC1b, AC1c, AC2, AC2a, AC3, A6, AC4 (R6), AC5 (R9), AC6: the evidence from attempt 1 stands. Every test cited there still passes in the full run above, and the delta does not touch the code behind them except as described.

### Nits from attempt 1
- `SignInScreen.test.tsx:225` now queries role `region`. This matches `<section aria-label>` (`SignInScreen.tsx:84`) and the positive test at `:233`, so the null assertion can now fail. Fixed.
- `rechecking` reset: `AuthGate.tsx:152` resets it in `offerJoin`, which covers re-check → join → other account. `failTo` and `enterReady` still consume it on the other paths. Fixed, and covered by its own test.
- The `still` wording and the `Btn` arrow at 390 px were not changed. They remain cosmetic nits.

### Issues
None.

### Rules (CLAUDE.md)
- R1 and R3 are unchanged by the delta: no fetch, nothing secret.
- R6: no new copy; the tests use `AUTH_COPY`.
- R7: the delta does only what the attempt-1 fix instructions and the two nits asked for.
- R8: met, with a regression test per change.
- R9: no UI change.
- No violations found.

### Blockers from review agents
None from me. The working tree has an uncommitted "Attempt 2" section in `security-review.md`, written by the orchestrator's security run, not by me. The orchestrator should copy in any 🔴 from it. Its summary is PASS, and it asked the main reviewer to confirm the checks; they are confirmed above.

### Nits (do not block)
- 💭 `UnverifiedScreen` `still` text repeats the body (carried over from attempt 1).
- 💭 The `Btn` arrow icon is squeezed beside a two-line long-email label at 390 px (carried over from attempt 1).

### Ming verification after merge
- Same as attempt 1: on production, "Tiếp tục với {email}" while signed in to another mmlabs app; the unverified flow (resend, then the re-check enters the app); a brief `/accounts` loader on a cold page.

### Follow-ups (out of scope)
- From attempt 1, still open: `offerJoin`'s "signed out meanwhile" branch (`AuthGate.tsx:158-161`) sets `session_invalid` without a re-list.
- The plan.md follow-ups from attempt 1 are unchanged.
