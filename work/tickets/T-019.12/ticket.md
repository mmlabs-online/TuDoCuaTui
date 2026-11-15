# T-019.12: Forgot password and /reset-password page

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | ui, security |
| Gate | plan-approval |
| Depends on | T-019.7 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-14 |
| Claimed by | claude@2026-11-15T10:13:54Z |
| PR | — |

## Goal
A TuDo user who forgot their password can request a reset link and set a new password on TuDo's own `/reset-password` page.

## Feature reference
Slice of T-019 (D31, D35). org-admin-api USR-04b (live in v0.1.3): every registered app origin must serve
`/reset-password` (`/home/user/mmlabs-online/org-admin-api/docs/consumers.md`, "Password reset"; link
`{origin}/reset-password#token=<43 chars>`). Reset revokes all sessions of the user.

## Scope
- "Quên mật khẩu?" from the sign-in screen: email (+ Turnstile) → `POST /api/v1/auth/password/forgot` (always 202, same message).
- `/reset-password`: parse and clear `#token` at once (`history.replaceState`), `Referrer-Policy: no-referrer`, new password
  (+ confirm) with the same rules as sign-up, submit only on button press (D36 pattern), `POST /api/v1/auth/password/reset`;
  states success (→ sign in), token invalid/expired (→ request a new link), weak password, rate-limited.
- Screens follow the T-019.11 pattern (presentational + copy in `src/features/auth/copy.ts`), wired with the T-019.7 client.

## Out of scope
- Changes to org-admin-api; account settings / change password while signed in.

## Acceptance criteria
- [ ] Forgot-password request shows the same confirmation whatever the email (no account enumeration).
- [ ] `/reset-password` handles the token per `consumers.md` (cleared before any network call, POST body only, never logged or rendered).
- [ ] All states with Vietnamese copy; 390px and dark mode; local mode unchanged.
- [ ] All checks pass.

## Notes / answers from Ming
- 2026-11-15 (Ming: "duyệt T-019.12"): **Plan approved**, one ticket (no split), Vietnamese copy as proposed.
- 2026-11-14: added because org-admin-api USR-04b requires every app origin to serve `/reset-password`.

## Handoff

### 2026-11-15 — claude — BLOCKED
- Done: plan.md READY: shared token-page path list (`src/shared/tokenPages.ts` + server parity test), `takeTokenHash` in boot, ForgotPasswordScreen (Turnstile always, fixed "sent" copy), ResetPasswordScreen/Page (button-press POST, token cleared before any request), AuthGate/AuthRoot/SignInScreen wiring; works in access and identity mode; local mode unchanged.
- In progress / next: Ming approves the plan and the Vietnamese copy (plan Approach, copy list); then implement.
- Gotchas: ~430 + ~450 lines (fallback split 12a/12b in the plan); T-019.10 is merged now, so the plan's A9 rebase note is moot.
