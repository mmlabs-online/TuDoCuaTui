# BUG-007: Signing out in one tab wipes another tab's saved account

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S3 |
| Priority | P2 |
| Size | XS |
| Areas | security |
| Gate | plan-approval |
| Found in | main after T-028.3 (review follow-up) |
| Introduced in | T-028.3 (multi-account "Tiếp tục với" makes it reachable); the unconditional clear predates it |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | — |

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

## Handoff
