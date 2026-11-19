# BUG-008: Stale "Tiếp tục với" list after a retry, and no re-list after a join-lookup sign-out

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S3 |
| Priority | P2 |
| Size | XS |
| Areas | ui, security |
| Gate | plan-approval |
| Found in | main after T-028.3 (review/security follow-up) |
| Introduced in | T-028.3 |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | — |

## Report
Follow-ups from the T-028.3 review and security review attempt 2 (PR https://github.com/mmlabs-online/TuDoCuaTui/pull/91).

## Environment
- Any browser; cold sign-in page with accounts on the device.

## Steps to reproduce
1. Cold sign-in page shows the list; click "Tiếp tục với X".
2. `/token` fails with a network error → retry view → "Thử lại" → restore answers `not_member` without join.
3. Second case: during `offerJoin`'s account lookup the id is cleared by `session_invalid`.

## Expected
- Case 1: sign-in form with the error and no stale list (A2: list only on a cold page and after `session_invalid`).
- Case 2: the list is re-fetched from Identity, as for any other `session_invalid`.

## Actual
- Case 1: the mount-time list is shown again with the `not_member` error.
- Case 2: sign-in form with `session_invalid` but no re-list.

## Root cause
**Confirmed by code reading (review + security review):** `src/features/auth/AuthGate.tsx` `failTo` (~:130-145) clears the list only via `enterReady`; its retry/signed_out branches keep it. The "signed out meanwhile" branch of `offerJoin` (~:157-161) sets `session_invalid` directly instead of going through `failTo`.

## Scope
- Call `clearAccounts()` in `failTo`'s non-`session_invalid` branches; route the `offerJoin` branch through `failTo`. Nothing else.

## Out of scope
- Other auth follow-ups (T-029, T-031).

## Acceptance criteria
- [ ] A regression test reproduces case 1 (continue → network → retry → not_member → no list) and fails on `main` before the fix.
- [ ] A regression test for case 2 (id cleared during the join lookup → accounts re-listed).
- [ ] All checks pass.

## Technical notes
- Files: `src/features/auth/AuthGate.tsx`, `AuthGate.test.tsx`.
- High path (`src/features/auth/**`): plan approval.

## Notes / answers from Ming

## Handoff
