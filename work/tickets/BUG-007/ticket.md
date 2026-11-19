# BUG-007: Signing out in one tab wipes another tab's saved account

| Field | Value |
|---|---|
| Type | bug |
| State | MERGED |
| Severity | S3 |
| Priority | P2 |
| Size | XS |
| Areas | security |
| Gate | plan-approval |
| Found in | main after T-028.3 (review follow-up) |
| Introduced in | T-028.3 (multi-account "Tiếp tục với" makes it reachable); the unconditional clear predates it |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/94 |

## Report
Follow-up from the T-028.3 consult, plan and security review (PR https://github.com/mmlabs-online/TuDoCuaTui/pull/91): "tab A signing out X wipes tab B's stored Y."

## Environment
- Any browser with two TuDoCuaTui tabs on two different mmlabs accounts (possible since T-028.3).

## Steps to reproduce
1. Tab A signed in as X. Tab B uses "Tiếp tục với Y" (shared `localStorage.mm_account_id` is now Y).
2. Tab A signs out (or receives a remote sign-out for X).
3. Reload tab B.

## Expected
- Tab B still restores Y: only the departing account's id is removed from storage.

## Actual
- `mm_account_id` is cleared, so tab B comes back to the sign-in page.

## Root cause
**Confirmed by code reading:** `src/features/auth/tokenStore.ts:221` (remote signedOut handler), `:252` (signOut) and `:280` (forget) call `storage.clear()` unconditionally instead of clearing only when `storage.read() === <departing id>`. (`:157` and `:326`, the `session_invalid` paths, need the same check.)

## Scope
- Clear `mm_account_id` only when it still holds the departing account; nothing else.

## Out of scope
- Broadcasting sign-out on session_invalid/forget (T-029).

## Acceptance criteria
- [ ] A regression test reproduces the bug: two stores sharing storage, A=X signs out after B continued as Y → storage still holds Y (fails on `main`, passes after).
- [ ] Signing out the account that is stored still clears it (existing tests stay green).
- [ ] All checks pass.

## Technical notes
- Files: `src/features/auth/tokenStore.ts`, `tokenStore.test.ts` / `tabs.test.ts`.
- High path (`src/features/auth/**`): plan approval.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-19 — Plan approved by Ming ("duyệt BUG-007"), including the plan's assumptions.

## Handoff

### 2026-11-19 — claude — BLOCKED
- Done: plan READY (helper forgetStored(gone) replaces all five storage.clear() calls; regression tests in tabs.test.ts and tokenStore.test.ts). No consult (area security).
- In progress / next: waiting for Ming's plan approval (M-37); then implement.
- Gotchas: assumptions in plan.md (a dead Y stays until its own next token request; no-id signOut/forget no longer clear storage).

### 2026-11-19 — claude — DONE
- Done: plan approved; forgetStored(gone) replaces the five storage.clear() calls in tokenStore.ts; 6 regression tests failed before the fix (reviewer re-verified, incl. per-site reverts). Review PASS; security PASS. PR https://github.com/mmlabs-online/TuDoCuaTui/pull/94.
- In progress / next: Ming merges the PR; then BUG-008, T-029.
- Gotchas: after X signs out in tab A, reloading tab A now restores the Y that tab B stored (security note 7: no access gained).
