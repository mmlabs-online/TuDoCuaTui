# T-029: Finish cross-tab sign-out (broadcast on lost sessions, fallback, retry sign-out)

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Size | M |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | BUG-007 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | — |

## Goal
Every way a session ends in one tab reaches the other tabs, and a user whose sign-out was not confirmed can try again.

## Scope reference
D50 ("Sign in with mmlabs" consumer spec: cross-tab session); follow-ups F1, F2 and "Thử đăng xuất lại" from T-028.2 (plan.md, security-review.md, PR https://github.com/mmlabs-online/TuDoCuaTui/pull/90).

## Scope
- Broadcast `signedOut` (for that account) on `session_invalid`, `forget()` and `onAuthLost`, not only on an explicit sign-out (F1).
- When BroadcastChannel is missing, fall back to the `storage` event on `mm_account_id` for cross-tab sign-out (F2); never carry tokens in storage.
- A "Thử đăng xuất lại" action on the `logout_unconfirmed` notice that re-calls `/logout` for the remembered (in-memory only) account id.

## Out of scope
- bfcache channel close/reopen (F3); Playwright as a dependency (F4).

## Acceptance criteria
- [ ] A `session_invalid`, `forget()` or lost session in tab A signs out tab B on the same account (fake channel tests).
- [ ] With no BroadcastChannel, removing `mm_account_id` for the tab's account signs it out via the storage event; other accounts are unaffected.
- [ ] "Thử đăng xuất lại" calls `/logout` once per click and replaces the warning with "Bạn đã đăng xuất." on success.
- [ ] 390 px and dark mode for the notice action (one-off Playwright, D42).
- [ ] All checks pass.

## Technical notes
- Files: `src/features/auth/tokenStore.ts`, `authChannel.ts`, `AuthGate.tsx`, `SignInScreen.tsx`, `copy.ts`, tests.
- High path (`src/features/auth/**`): plan approval. Depends on BUG-007 (storage clear only for the departing account).

## Test plan
- Unit: tabs.test.ts with the fake hub; storage-event fallback with a fake window.
- Manual: two real tabs, DevTools Offline sign-out then retry.

## Notes / answers from Ming
- 2026-11-23 — Plan approved (Ming, in chat: "duyệt tất cả"); assumptions A1–A6 accepted with their defaults.

## Handoff

### 2026-11-23 — claude — BLOCKED
- Done: consult (software-architect), plan.md (Status READY, T1–T20, assumptions A1–A6 with defaults).
- In progress / next: Ming approves the plan (M-47); then /run T-029 resumes at IMPLEMENT.
- Gotchas: AuthGate.tsx is shared with BUG-008 (whichever lands second rebases and re-runs BUG-008 T1–T3); SignInScreen.tsx props shared with T-031. loop.config.md High paths omit src/features/auth/** (already a BUG-008 follow-up).

### 2026-11-23 — claude — DONE
- Done: implemented the approved plan (attempt 1, merged with main incl. BUG-008); reviewer PASS, security review no 🔴. Branch `ticket/T-029` pushed.
- In progress / next: no GitHub CLI or MCP on this machine; Ming opens the PR from `ticket/T-029` with the body in `work/tickets/T-029/pr.md`, then the PR URL goes into this ticket.
- Gotchas: security 🟡 1 (retry completion after a same-tab re-sign-in) is a follow-up; T-031 must keep the retry props and T19–T20; 7 Windows-only `pnpm test` failures are pre-existing (rely on CI).
