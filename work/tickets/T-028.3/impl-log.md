# Implementation log — T-028.3

## Attempt 1 (2026-11-19, implementer)

### Files touched
Product (all under `src/features/auth/`, High path, plan approved):
- `tokenStore.ts`: `continueAs(accountId, email)` on `TokenStore`; private `adopt()` shared with `signIn`. No `signedOut`, no `/logout`.
- `identityClient.ts`: `get(path, signal?)`; `accounts()` uses `AbortSignal.timeout(ACCOUNTS_TIMEOUT_MS = 5000)`.
- `AuthGate.tsx`: `accounts` state (`"loading" | list | null`), `listSeq`, `loadAccounts` (dedupe by lowercased id, cap 5, any failure -> form only), `clearAccounts`, `continueAs` handler (`continuing` ref), `unverified` view, `email_unverified` routed in `failTo` (also from `signIn`'s catch and the background subscriber), `session_invalid` in `failTo` re-lists, resend `session_invalid` -> `forget` + `failTo`, loader while `accounts === "loading"` on the sign-in screen.
- `SignInScreen.tsx`: list `<section aria-label>` of buttons, divider `<p>`, disabled/continuing states.
- `UnverifiedScreen.tsx` (new), `types.ts` (`AccountChoice`, new props, `UnverifiedScreenProps`), `copy.ts` (exact strings from plan + `preview.unverified`).
- `preview/AuthPreview.tsx`: signIn states `accounts`, `accounts_long`, `continuing`; screen `unverified` with `idle`, `sending`, `sent`, `still`.

Tests: `tokenStore.test.ts` (4 new), `tabs.test.ts` (1), `identityClient.test.ts` (1), `SignInScreen.test.tsx` (5), `UnverifiedScreen.test.tsx` (new, 4), `AuthGate.test.tsx` (new describe "continue as": 19 cases counting it.each rows 4), `copy.test.ts` (1).

### Existing tests changed (and why)
`AuthGate.test.tsx`:
- `signInWith()` awaits the email field first (the form renders after the list resolves).
- `setup()` gained an `accounts` override (default list unchanged); `withFailure()` fake client gained `accounts: async () => []`.
- `restore > no id -> sign-in with zero network...` renamed "no id -> one accounts call, then sign-in; ..." (awaits the form, asserts one `/accounts`).
- `restore > notice verified...`: awaits the sign-in form.
- `restore outcomes > %s -> sign-in with that error`: split; `not_member` row kept as is, `email_unverified` moved to the new "email_unverified -> unverified screen without an email, id kept".
- `sign-in > email_unverified -> resend -> sent` and `cross-tab > resend 409 ...`: start from the unverified screen instead of the banner.
- `join flow > sign-in: not_member + join_available ...`: `accounts` `not.toHaveBeenCalled()` -> `toHaveBeenCalledTimes(1)` (mount listing only).
- Mechanical (plan: "any other no-id test awaits the form"): `goSignUp`/`goForgot` helpers are now async (`findByRole`) and their call sites `await` them (sign-up and forgot suites); `initialScreen=forgot ... password_reset` test is async and awaits the form.

### Out-of-plan files
- `src/features/auth/AuthRoot.test.tsx` (not in the plan's file list, not listed under "Existing tests that change"). Three tests failed because the cold sign-in page now makes one `/accounts` call and renders the form after it: "verify hash + identity -> ..." and "reset hash ... -> sign-in with the notice" now `await findByLabelText(password)` and expect 2 fetches (verify/reset, then accounts); "no hash + identity -> the gate" is now async, its fetch returns `{items: []}`, and it asserts one call to `/auth/accounts` instead of "no network". Mechanical consequence of the planned behaviour (A2/A4).

### Test deviations from the plan's list
- Not written: "remote sign-out while the list loads -> the late list is dropped". With no stored id a remote `signedOut` is ignored by the store (`onMessage` needs an id), so that race is not reachable; `listSeq` still guards it. Instead: "remote sign-out during a continue -> App never rendered, form only" (listed in the plan) covers the reachable remote case.
- Not written: "own sign-out / remote sign-out -> accounts not called again" as separate tests: covered by "own sign-out -> form only, accounts not called again" and the remote-during-continue test (accounts called once).
- Not written: "Dùng tài khoản khác" on the join screen is covered by one extra test (join screen), the unverified one is per plan.

### Checks (final run)
- `pnpm typecheck`: pass.
- `pnpm format:check`: "All matched files use the correct format."
- `pnpm test`: Test Files 136 passed | 11 skipped (147); Tests 1869 passed | 222 skipped (2091). (Auth folder alone: 374 passed.) One earlier full run showed a single unrelated failure ("Hoàn tác" restores the previous values) during the broken-test phase; it passed in the final full run.
- `pnpm build`: pass.

### One-off Playwright (D42, R9) — `/auth-preview.html` on `pnpm dev`, viewport 390x844, "Khung 390px" on
Script and screenshots only in `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/impl-t0283/` (not committed); dev server stopped afterwards.
States: signIn `accounts`, `accounts_long`, `continuing`; unverified `idle` (long email), `sending`, `sent`, `still`; each in light and dark.
- `document.documentElement.scrollWidth` = 390 in all 14 runs; zero elements inside `<main>` with right edge > 390.
- Dark background `rgb(20, 32, 27)`, light `rgb(246, 241, 231)`.
- `continuing`: 4 disabled buttons (the 3 list buttons and the form submit); `unverified sending`: 1 disabled (resend); others 0.
- Screenshot of dark `accounts_long`: the 60-character email wraps inside the primary button, divider and form readable.

### Follow-ups (not in the diff, R7)
As listed in plan.md (conditional `storage.clear()`, `signedOut` on forget, `Retry-After` countdown, `display_name` badges, banner removal, hide-account option). New: none.

## Attempt 2 (2026-11-19, implementer, REWORK)

Fixes review attempt 1, Issue 1 (blocker) plus two nits in this ticket's own code.

### Files touched
- `src/features/auth/AuthGate.tsx`: `enterReady()` calls `clearAccounts()` (a mount-time list never reappears once the app was reached, A2); the join catch's `session_invalid` goes through `failTo(err)` (re-lists, plan §3); `offerJoin()` resets `rechecking.current` (nit: a re-check that lands on the join screen no longer leaves `still` preset for a later unverified account).
- `src/features/auth/AuthGate.test.tsx`: 3 new tests in "continue as": (a) continue -> App -> background `not_member` (no join) -> form + error, no list, accounts called once; (b) continue -> join -> join `session_invalid` -> form + error, list re-shown, accounts called twice; (c) re-check -> join screen -> other account -> new unverified account shows no alert (no `still`). All three fail without the AuthGate change (verified by stashing it).
- `src/features/auth/SignInScreen.test.tsx`: the empty-list assertion queries role `region` (what the `<section aria-label>` renders) instead of `group`.

### Checks
- `pnpm typecheck`: pass.
- `pnpm format:check`: pass.
- `pnpm test`: Test Files 136 passed | 11 skipped (147); Tests 1872 passed | 222 skipped (2094).
- `pnpm build`: pass.

### Out-of-plan files / follow-ups
None. Left alone (R7): other nits, and `offerJoin`'s "signed out meanwhile" branch (already a listed follow-up).
