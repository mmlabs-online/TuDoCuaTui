# T-028.3: "Continue as {email}" on the sign-in page and a verify-email screen

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | ui, security |
| Gate | plan-approval |
| Depends on | T-028.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | — |

## Goal
Someone already signed in to another mmlabs app on this browser enters TuDoCuaTui with one click; an unverified account gets a clear verify-email screen.

## Feature reference
"Sign in with mmlabs" consumer spec (reference ricotdin; contract org-admin-api `docs/consumers.md`, which wins on conflict); `work/decisions.md` D50 (what TuDoCuaTui adopts and where it differs), D31/D32 (rows keyed by `sub`), D37, D38 (owner sub), D46 (12 h tokens). Ming 2026-11-19: show the "Continue as" list (D50).

## Scope
- Sign-in page: `GET /accounts` → one "Continue as {email}" button per account, then "hoặc đăng nhập bằng tài khoản khác" and the existing email + password form; errors → form only.
- "Continue as" stores `account_id` and gets a token (join consent / join closed flows unchanged).
- 403 `email_unverified` → a dedicated verify screen with resend (reuse `VerifyEmailScreen` if it fits).
- Vietnamese copy in the auth copy file (R6).

## Out of scope
- Cross-tab session (T-028.2); verifier (T-028.1).

## Acceptance criteria
- [ ] With accounts on the device, the sign-in page shows "Continue as {email}" buttons; one click signs in (component tests with a fake client).
- [ ] With no accounts or an error, only the form shows.
- [ ] `email_unverified` shows the verify screen with resend.
- [ ] 390px and dark mode (one-off Playwright check, D42).
- [ ] All checks pass.

## Technical notes
- High path (`src/features/auth/**`): plan approval.
- Files: `AuthGate.tsx`, sign-in screen component(s), `identityClient.ts` (`accounts()` exists), `copy.ts`, tests.

## Notes / answers from Ming

## Handoff
