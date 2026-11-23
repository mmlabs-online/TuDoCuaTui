<!-- PR title: T-029: Finish cross-tab sign-out (broadcast on lost sessions, fallback, retry sign-out) -->
<!-- Branch: ticket/T-029 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- One teardown helper in `tokenStore.ts` now ends every session: sign-out, `forget()` (incl. `onAuthLost`), and `session_invalid` in renewal and join all broadcast `signedOut`; a received message is never re-broadcast, and a `signedOut` older than the tab's session start is ignored (F1).
- Without BroadcastChannel, removing `mm_account_id` (storage event, watched in `accountId.ts`) signs out tabs on that account only; nothing new is written to storage, no token goes there (F2).
- An unconfirmed `signOut()` returns an in-memory `retry`; the `logout_unconfirmed` notice gets a "Thử đăng xuất lại" button (busy "Đang đăng xuất…"), one `/logout` per click, other tabs signed out only after Identity confirms.
- Tests T1–T20 across six auth test files, plus a fake storage hub in `fakeTabs.ts`; `logout_retrying` preview state.

## Acceptance criteria
- [x] `session_invalid`, `forget()` or lost session in tab A signs out tab B — named tests in `tabs.test.ts` / `AuthGate.test.tsx` green (review.md).
- [x] No BroadcastChannel: removing the tab's account id signs it out; other accounts unaffected — `accountId.test.ts`, `authChannel.test.ts`, `tabs.test.ts` green.
- [x] "Thử đăng xuất lại" calls `/logout` once per click, shows "Bạn đã đăng xuất." on success — `tokenStore.test.ts`, `AuthGate.test.tsx`, `SignInScreen.test.tsx` green.
- [x] 390 px and dark mode — one-off Playwright (Edge) on `/auth-preview.html`, light/dark × `logout_unconfirmed`/`logout_retrying`, button 298×44, no overflow (impl-log.md; reviewer checked screenshots).
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 2016 passed, 7 failed, 288 skipped on the agent's Windows machine. The 7 are the known Windows-only failures also on `main` (`server/api.test.ts`, `server/ai/tagPhoto.test.ts`, `server/index.cli.test.ts`, `server/scoping.test.ts`, `src/features/auth/boundary.test.ts`: socket resets, SIGTERM exit code, backslash paths). Please confirm CI (Linux) is green, especially `boundary.test.ts`, which guards the `localStorage` / `BroadcastChannel` allowlist this PR relies on.
- BUG-008 (merged, same `AuthGate.tsx`) was merged into this branch; its T1–T3 still pass (88/88 in `AuthGate.test.tsx`).

## Needs Ming's decision
- High path (`src/features/auth/**`): plan approved 2026-11-23 with assumptions A1–A6 at their defaults (A1: "Dùng tài khoản khác" also signs out other tabs on that account; A2: a successful retry also signs out tabs that re-signed-in to that account; A3: `localStorage.clear()` is not a sign-out; A4: plain "Bạn đã đăng xuất." in other tabs; A5: warning copy unchanged; A6: did not wait for BUG-008).
- Copy: the existing `logoutUnconfirmed` warning now partly repeats what the new button does — keep or reword (your call).
- Checks after deploy: two real tabs on one account — go offline in tab A, sign out, come back online, press "Thử đăng xuất lại" (tab B should go to the signed-out notice). Optional: "Dùng tài khoản khác" in tab A sends tab B to the signed-out notice.

## Follow-ups
- Security 🟡 1 / review nit 1: if the user signs in again to the same account in the same tab while a retry's `/logout` is in flight, the confirmed result still clears `mm_account_id` and posts `signedOut`. Fix: capture `generation` in `retry` and act only when unchanged and `id === null`; optionally disable sign-in while retrying; add test T8b. Impact: extra sign-out only, no leak.
- Security 🟡 9 (BUG-008 finding 3): AuthGate handlers that call `store.forget()` do not bump `signOutSeq`; still latent, not worsened.
- Security 💭 8: doc comment at `authChannel.ts:63-65` overstates when the storage fallback activates.
- Review nits: T18 covers only the `goto` path; T14 checks the visible result (reason in impl-log).
- T-031 must keep the retry props and tests T19–T20 when it edits `SignInScreen`.
- `.claude/loop.config.md` › High paths and the security review trigger omit `src/features/auth/**`.
- Windows-only test failures (debt).

Links: [plan.md](work/tickets/T-029/plan.md) · [review.md](work/tickets/T-029/review.md) · [security-review.md](work/tickets/T-029/security-review.md) · [impl-log.md](work/tickets/T-029/impl-log.md) · [consult-software-architect.md](work/tickets/T-029/consult-software-architect.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
