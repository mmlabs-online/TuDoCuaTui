# T-023: Lower the password minimum to 6 characters

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | ui, security |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | claude@2026-11-16T15:14:52Z |
| PR | — |

## Goal
New passwords (sign-up and reset password) need at least 6 characters instead of 12, so users can pick shorter passwords.

## Feature reference
No `docs/feature-list.md` section sets the length; 12 came from org-admin-api `password_min_length` (T-019.11 plan, `src/features/auth/validation.ts:3`).
Ming, 2026-11-16: "thêm 1 thay đổi password chỉ yêu cầu tối thiểu 6 kí tự". Needs a new decision row when planned.

## Scope
- `PASSWORD_MIN` 12 → 6 in `src/features/auth/validation.ts` (sign-up and reset/new-password validation).
- Vietnamese copy in `src/features/auth/copy.ts`: `signUp.passwordHint`, `fieldErrors.tooShort`, `errors.weak_too_short` say 6.
- Update the tests that use 12 as the boundary.

## Out of scope
- The maximum (128), the "too common" check, sign-in validation.
- Changing org-admin-api itself (another repo; see risks).

## Acceptance criteria
- [ ] Sign-up and reset-password accept a 6-character password and reject a 5-character one (code points after NFKC, as today).
- [ ] Hint and error texts say "6 ký tự"; no "12 ký tự" left in `src/`.
- [ ] Sign-in validation is unchanged.
- [ ] Unit tests cover the 5/6 boundary; all checks pass.

## Technical notes
- Files: `src/features/auth/validation.ts`, `src/features/auth/copy.ts`, `*.test.ts(x)` in `src/features/auth/`.
- **Risk / open question (blocking for the real effect):** org-admin-api enforces the minimum server-side (`password_min_length = 12`, a setting declared `ge=8` per T-019.11 plan). With only this ticket, a 6–11 character password passes TuDo's form but the API answers `weak_password` / `too_short`. Getting 6 needs a change in org-admin-api (config and its `ge=8` floor) — Ming's decision, other repo. The planner should ask whether TuDo ships after that change, or whether the minimum should be 8 (the lowest the API can be configured to today).
- Security: 6 characters is a weak minimum; the reviewer should note it, the decision is Ming's.

## Test plan
- Unit: `passwordError("a".repeat(5))` → `tooShort`, `"a".repeat(6)` → null; screens accept 6 characters.
- Manual: 390px + dark mode sign-up hint text.

## Notes / answers from Ming
- 2026-11-16 (Ming): "thêm 1 thay đổi password chỉ yêu cầu tối thiểu 6 kí tự".

- Waiting for Ming: plan approval (High tier)
- 2026-11-16 (Ming): "duyệt T-023" — Plan approved.

## Handoff

### 2026-11-16 — claude — BLOCKED
- Done: plan READY (`plan.md`): `PASSWORD_MIN` 6, three copy strings, boundary/NFKC tests; D43 text for /run to add on approval. Open risk resolved: org-admin-api main 87026db sets `password_min_length` default 6, ge=6 (in release/v0.1.6).
- In progress / next: Ming approves → implement → review (+ security audit) → PR.
- Gotchas: deploy TuDo only after production identity rejects no 6–11 char password with `too_short`.
