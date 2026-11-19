# Review — T-028.2

## Attempt 1 — 2026-11-19
Verdict: PASS

Reviewed commit b72f2e5 (`git diff origin/main...HEAD`, 21 files, +1298/−54).

### Checks (run by reviewer)
- `pnpm typecheck` — exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- `pnpm format:check` — exit 0, "All matched files use the correct format." (332 files).
- `pnpm test` — exit 0, Test Files 135 passed | 11 skipped (146); Tests 1828 passed | 222 skipped (2050). Matches impl-log.
- `pnpm build` — exit 0, "built in 425ms".

### Acceptance criteria
- [x] Two tabs (fake lock + channel): one `/token` call, both get the token — evidence: `tabs.test.ts › two tabs renewing at once -> one /token, both return the same token`; `› tab B waiting on the lock adopts A's broadcast instead of calling /token` (B's `client.token` never called). Code: lock-guarded double-check after the post-lock yield, `tokenStore.ts:120-124`; broadcast while holding the lock, `:133-140`.
- [x] A 401 adopts a token broadcast within 10 s; older tokens ignored — evidence: `tabs.test.ts › getToken(rejected) returns a token another tab broadcast, with no /token call`; `› a message older than the tab's own token is ignored`; `› a message for another account is ignored (token and signedOut)`; `authChannel.test.ts › rejects at older than 10 s` (and 17 other rejections). Code: adopt rule `tokenStore.ts:201-211` (`msg.at > tokenAt`, still valid, case-insensitive account match); never re-broadcast (`› an adopted token is not re-broadcast`).
- [x] Sign-out in one tab signs out the other; a late renewal answer is dropped — evidence: `tabs.test.ts › sign-out in A signs out B (memory, storage, listener), no /logout from B`; `› B's /token resolving after A's sign-out is dropped and not broadcast` (probe sees only `["signedOut"]`); `tokenStore.test.ts › signOut waits for a running renewal before /logout` (order `clear, token, logout`); `AuthGate.test.tsx › remote sign-out while ready / during restore / on the join screen`. Code: epoch checks in `renew` (`tokenStore.ts:121-127`, catch `:146`); remote handler `:212-217`.
- [x] Renewal fires 60 s before expiry (fake timers) — evidence: `tabs.test.ts › proactive renewal fires at exp - 60 s for a 900 / 43200 s token` (no call at −1 ms, call at the instant); `› hidden tab skips the timer and renews on visibilitychange`; `› transient failure keeps the session and retries in 15 s …; session_invalid notifies`; `› sign-out disarms the timer; start() cleanup …; start() twice is safe`.
- [x] Unconfirmed `/logout` shows a warning on the sign-in page — evidence: `tokenStore.test.ts › signOut resolves {confirmed} …` table (204/session_invalid → true; network/rate_limited/unknown → false; never rejects); `AuthGate.test.tsx › logout not confirmed -> sign-in shows the shared-computer warning`; `› a confirmed logout keeps the plain signed-out notice`; `› a late unconfirmed logout does not overwrite a newer screen`; `SignInScreen.test.tsx` new case. Code: `AuthGate.tsx:177-186` (seq guard + functional `setView` only from `signed_out/signed_out`).
- [x] Resend → 409 `email_already_verified` gets a token — evidence: `AuthGate.test.tsx › resend 409 email_already_verified -> /token -> App rendered` (`client.token` called twice). Code: `AuthGate.tsx:311-317`.
- [x] No token in storage, URLs or logs; works without `localStorage`, Web Locks or BroadcastChannel — evidence: `tokenStore.test.ts › never writes anything but mm_account_id; no history or console use` (extended: started store, posts are `["token","signedOut"]`, token only in `accessToken`, `setItem` only `mm_account_id`); `› works when localStorage throws`; `refreshLock.test.ts` (undefined / throwing / timed-out lock → `locked=false`); `authChannel.test.ts` (missing / throwing constructor, throwing `postMessage` → no-op); `boundary.test.ts` (`navigator.locks` only in `refreshLock.ts`, `BroadcastChannel` only in `authChannel.ts`; `console.` nowhere). Manual read: no `console`, no storage write of the token, no URL use in the new files.
- [x] 390 px and dark mode for the warning; all checks pass — evidence (reviewer, Playwright Chromium 390×844, `/auth-preview.html`, Sign-in → state `logout_unconfirmed`, "Khung 390px" on; screenshots in the scratchpad, not committed): light — green-tinted info notice, full copy wraps over 4 lines inside the card, text readable, `scrollWidth 390 = innerWidth` (no horizontal scroll), notice box 324×126 px; dark (`html.dark`) — dark green notice with light text, good contrast, same layout, no overflow; no console errors in either. Diacritics render correctly (đ, ữ, ậ). All four checks green (above).

Ming verification after merge (from plan.md, not verified here): two real tabs → one `/auth/token` and cross-tab sign-out in production; a tab left open past 12 h / laptop sleep; sign-out with DevTools "Offline" shows the warning; real Safari/Chrome Web Locks + BroadcastChannel ordering.

### Scope
All 20 code/test files are in the plan's file list; `impl-log.md` is the implementer's own file. No out-of-plan file, no High path outside `src/features/auth/**` (planned and approved). `src/data/authFetch.ts`, `VerifyEmailPage.tsx`, server and migrations untouched, as planned.

Deviations (judged against the plan):
1. `AuthGate.test.tsx` injects only the fake channel, not the fake lock manager — accepted: jsdom has no `navigator.locks`, so the gate runs the planned no-lock path; lock + channel together are covered at store level in `tabs.test.ts` (AC1/AC3). The plan's "Existing tests that change" line is not fully followed, but no AC loses evidence.
2. `offerJoin` returns when `store.accountId()` is null after the accounts lookup (`AuthGate.tsx:104`) — accepted: one line, same feature as the planned `accountId() !== null` guards on restore/sign-in; without it a remote sign-out during the lookup would be overwritten by a `not_member` error screen. See Issue 2 for one narrow side effect.
3. `join()` now goes through `renew()` and its double-check — accepted: after `not_member` the token is null, so `/token` is still called; behaviour otherwise identical.
4. AC8 preview check not run by the implementer — now done by the reviewer (above); AC8 met.

### Issues
#### Issue 1 — 🟡 should-fix — proactive timer can spin on a short token
- **Where**: `src/features/auth/tokenStore.ts:131` (renew sets `validUntil = t + max(0, expiresIn − 60) * 1000`), `:101-103` (`arm` → `armAt(validUntil − now())`), `:189-195` (`onTimer`).
- **Expected**: the background timer never renews more often than a sane floor.
- **Actual**: `identityClient.token` accepts `expires_in ≥ 1` (`identityClient.ts:138`). For `expires_in ≤ 60`, `validUntil = t`, so `arm()` schedules a 0 ms timer, `onTimer` immediately calls `renew()`, whose success re-arms at 0 ms again: a back-to-back `/token` loop for as long as the tab is visible and the calls succeed. D46 fixes 12 h tokens, so this only bites on an Identity misconfiguration or a test environment, which is why it does not block.
- **Fix instruction** (next ticket touching tokenStore, or a follow-up): floor the proactive delay, e.g. `armAt(Math.max(validUntil − now(), RETRY_MS))` in `arm()` when `validUntil` came from a renewal, or skip arming when `expiresAt − now() ≤ REFRESH_MARGIN_S * 1000` (lazy renewal then covers it); add a fake-timer test with `expiresIn = 30` asserting ≤ 1 `/token` call per 15 s.

#### Issue 2 — 🟡 should-fix — visibility renewal while the gate is not `ready`
- **Where**: `src/features/auth/tokenStore.ts:196-199` (`onVisible`: `id && token === null` → `background()`), with `AuthGate.tsx:104` (deviation 2).
- **Expected**: a renewal nobody asked for does not leave the UI stuck.
- **Actual**: on the join / `email_unverified` / retry screens the store has `id` set and `token === null`, so every `visibilitychange` → visible fires a `/token` call (as the plan specified). If that call returns `session_invalid` while `offerJoin` is waiting on `accountEmail()`, the id is cleared silently (the `subscribe` handler ignores non-`ready` views) and `offerJoin` now returns early, leaving the gate on `checking` (spinner). Narrow window, needs a revoked device session at the same moment; not a data or security issue.
- **Fix instruction** (follow-up): either only renew on visibility when `token !== null` (a session that had a token), or in `offerJoin` fall through to `setView({ kind: "signed_out", notice: "signed_out" })` instead of returning when `accountId()` is null and the remote handler did not run.

### Rules (CLAUDE.md)
No violations found.
- R1: no new `fetch`; `authFetch.ts` untouched; `fetch` stays in `identityClient.ts` (boundary test green).
- R3: only access token, `expiresAt`, account id and timestamps cross the channel; nothing in `VITE_*`; no secret in client code.
- R6: new copy only in `copy.ts:16-17`.
- R7: deviations justified; follow-ups listed, not in the diff.
- R8: new pure logic (`parseAuthMessage`, lock wrapper, store renewal/adopt/sign-out) has unit tests.
- R9: checked at 390 px light and dark (above).

### Blockers from review agents
Ticket areas include `security`: the orchestrator runs `security-ai-generated-code-auditor` (`security-review.md`) and copies any 🔴 here. None at the time of writing.

### Nits (do not block)
- `tokenStore.ts:277-292`: `start()`'s cleanup closes whatever `channel` is current; calling an *old* cleanup after a newer `start()` would close the newer channel. React never does this; a per-start guard (`if (myChannel !== channel) return`) would make it bullet-proof.
- `tokenStore.ts:123`: the post-lock `setTimeout(0)` yield is throttled to ≥ 1 s in hidden tabs (chained timers can be throttled further); harmless, hidden tabs skip the timer anyway.
- `signOut` posts `signedOut` without an `at` ordering check on receipt (`tokenStore.ts:212-217`); fine with the 10 s window, noted for T-028.3 (account list) where several accounts share a device.

### Follow-ups (out of scope)
- Issues 1 and 2 above, if not fixed in T-028.3.
- F1–F4 from plan.md (broadcast `signedOut` on `session_invalid`/`forget`, `storage`-event fallback, bfcache channel close/reopen, Playwright as a repo dependency).

## Attempt 2 — 2026-11-19
Verdict: PASS

Scope: the attempt-2 delta `git diff b72f2e5..ac2aac3` (Ming's "Sửa cả 3 trong PR này": review Issues 1–2, security S1 and N4), and a re-check of the whole ticket `git diff origin/main...HEAD` (25 files).

### Checks (run by reviewer)
- `pnpm typecheck` — clean (both tsconfigs).
- `pnpm format:check` — "All matched files use the correct format" (332 files).
- `pnpm test` — Test Files 135 passed | 11 skipped; Tests 1832 passed | 222 skipped. Matches impl-log attempt 2.
- `pnpm build` — built OK (AuthRoot chunk 35.01 kB).
- Regression proof: the attempt-2 tests run against attempt-1 `AuthGate.tsx` + `tokenStore.ts` (from `b72f2e5`, in a scratch copy) — all 3 new behaviour tests fail there (`a 30 s token is not renewed in a tight loop…`, `becoming visible does not renew when the tab has no token…`, `the account id cleared while the join lookup runs…`), and pass on `ac2aac3`.
- 390 px Playwright, `/auth-preview.html` → Đăng nhập / `logout_unconfirmed`, light and dark (preview's "Chế độ tối"): new text rendered in full, wraps in the notice box, `scrollWidth == 390` (no horizontal scroll), dark background `rgb(20,32,27)`, notice readable in both.

### Acceptance criteria (attempt-2 fixes)
- [x] **Copy = Ming's exact wording** — `src/features/auth/copy.ts:16-17`; scripted comparison with the string in ticket Notes: identical (253 chars, NFC). Pinned by `copy.test.ts › logout warning copy`.
- [x] **Short-token loop stopped** — `tokenStore.ts:103-105`: `arm()` floors the delay at `RETRY_MS` (15 s). For `expires_in ≤ 60` (`validUntil = receipt`) the timer now fires at 15 s and renews (stale) → one `/token` per 15 s, not back-to-back. `tabs.test.ts › a 30 s token…` asserts 1 call at 14 s, 2 at 16 s, still 2 at 28 s, ≤ 6 over 88 s. Normal scheduling unchanged: for 900 s / 43 200 s tokens `validUntil − now` (840 s / ~12 h) ≫ 15 s, so `max` is a no-op; `› proactive renewal fires at exp - 60 s (900 s and 43200 s tokens)` still green.
- [x] **Visibility only renews a stale existing token** — `tokenStore.ts:198-202`: `id && token !== null && now() >= validUntil`. Join / unverified / not_member states (`token === null`) no longer fire `/token`; `› hidden tab skips the timer and renews on visibilitychange` still green; new `› becoming visible does not renew when the tab has no token` covers the negative.
- [x] **offerJoin can no longer stall on `checking`** — `AuthGate.tsx:104-111`: when the id is gone after `accountEmail()`, a still-`checking` view moves to `signed_out` (`session_invalid`); the functional `setView` leaves a view a remote sign-out already set (`signed_out` + `signed_out` notice) alone. `AuthGate.test.tsx › the account id cleared while the join lookup runs…` holds `accounts()` pending, clears the id, releases, and asserts the sign-in form + no stored id — it fails on attempt-1 code (spinner), so it genuinely exercises the bug.
- [x] **boundary N4** — `boundary.test.ts:31` `fakeTabs: []`: any non-test auth file containing `fakeTabs` now fails the boundary test; `fakeTabs.ts` itself does not contain that string (only test files reference it), so the entry is consistent and the test is green. Imports from outside the auth folder are already caught by the "only src/main.tsx mentions features/auth" test.
- [x] Attempt-1 acceptance criteria — unchanged code paths, all their tests still green (full suite above); review attempt 1 evidence stands.

### Judgement on the deviations
- **Floor also applies to adopted-token re-arm** (`onMessage` → `arm()`, `tokenStore.ts:212`) and to the `onTimer` early-fire re-arm (`:194`). Acceptable: an adopted token is only taken when `validUntil > now`; if that is < 15 s away, the proactive renewal is at most 15 s late, still inside the 60 s margin before `expiresAt`, and `getToken` renews on demand once stale. No loss of correctness, only of proactivity in an edge that the floor exists to bound.
- **Tokens < 15 s renew on demand**, not proactively. Acceptable: D46 fixes 12 h tokens; a < 15 s token only happens on misconfiguration, and the lazy `getToken` path (unchanged) still covers it. Documented in the comment at `:101-102`.
- **Visibility no longer retries a tab that never got a token** (plan step said `token === null || stale`). This is the fix Ming chose (review attempt 1 Issue 2, option 1); the retry / join / unverified screens have their own buttons, and a transient renewal failure keeps the old token non-null, so stale-token renewal on wake still works.
- **Test uses `store.forget()`** to clear the id mid-lookup (impl-log deviation). Fine: it models the `session_invalid` clear that the production path can still produce (e.g. via a lazy `getToken` from elsewhere) without depending on visibility.

### Scope
Attempt-2 files: `copy.ts`, `tokenStore.ts`, `AuthGate.tsx`, three test files, `boundary.test.ts`, ticket/impl-log/review/security-review. All are either in the plan's file list or the ticket folder; no new High path beyond the approved `src/features/auth/**`. No unjustified out-of-plan change.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R6: copy only in `copy.ts`. R8: every changed behaviour has a test that fails before the fix. R9: 390 px light/dark checked. R7: diff limited to the three findings + N4.

### Blockers from review agents
None (security-review attempt 1 PASS; S1 and N4 addressed by this attempt).

### Nits (do not block)
- `AuthGate.tsx:107-109`: the stall fallback reuses `session_invalid` copy even when the id was cleared by a local `forget()`; today only `session_invalid` reaches that branch, so the copy is right.
- Working tree has an uncommitted edit to `work/tickets/T-028.2/security-review.md` that is not part of `ac2aac3` (not made by this reviewer); the orchestrator should commit or discard it.

### Follow-ups (out of scope)
- Unchanged from attempt 1: F1–F4 from plan.md; attempt-1 nits; security N1–N3 and the "Thử đăng xuất lại" action.

### Ming verification after merge
- As in plan.md (two real tabs: one renewal, cross-tab sign-out; logout warning on a shared machine reads correctly).
