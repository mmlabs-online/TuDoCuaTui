# T-006: Replace magic-link login with email + password

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | ui, security |
| Gate | plan-approval |
| Depends on | F-101 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-09 |
| Claimed by | claude@2026-11-09T09:15:41Z |
| PR | — |

## Goal
Ming signs in to TuDo with the same email and password as stoktok (shared Supabase Auth, D17/D18), instead of
waiting for a magic-link email. Magic link is removed entirely.

## Feature reference
No feature in `docs/feature-list.md` covers this; it changes the auth method from the stack line
("Auth (magic link)") and replaces part of F-101 (resend button with 60 s cooldown). Ming confirmed the scope in
chat on 2026-11-09 ("có và bỏ hẳn magic link"). Decisions: D17 (shared stoktok project), D18 (keep stoktok Auth
as is, no TuDo-specific sign-up or user setup).
**Conflicts to flag:** F-101's resend/cooldown and F-102 ("Google sign-in … shown next to the magic link") assume
magic link; the feature list is not edited by this ticket.

## Scope
- `AuthGate`: email + password form calling `supabase.auth.signInWithPassword`; keep the session handling
  and sign-out as today.
- Remove magic link entirely: the `signInWithOtp` call, the "sent" state, the resend button and cooldown
  (`src/features/auth/cooldown.ts` if nothing else uses it), and OTP-only copy and tests.
- Vietnamese error messages in `authMessages.ts` for: invalid email, empty password, wrong email or password
  (`invalid_credentials`), rate limit, network/unknown error.
- Update docs that describe login (README "Set up Supabase", `docs/qa/smoke-test.md`) to email + password.

## Out of scope
- Sign-up in TuDo (accounts come from stoktok).
- "Forgot password" / password reset in TuDo (stays in stoktok; follow-up).
- Changing any Supabase Auth setting (D18), Google sign-in (F-102).

## Acceptance criteria
- [ ] The login screen has email + password fields and signs in with `signInWithPassword`; a valid stoktok
      account reaches the app.
- [ ] No `signInWithOtp`, magic-link copy, resend button or cooldown remains in `src/`.
- [ ] Wrong credentials, empty fields, invalid email and rate limit each show a clear Vietnamese message; the
      button is disabled while the request runs.
- [ ] The password field uses `type="password"` with `autocomplete="current-password"` (email:
      `autocomplete="email"`), so phone password managers work.
- [ ] Matches the app style in light and dark mode at 390px (F-101 AC kept).
- [ ] Unit tests for the new validation and error mapping; build, typecheck and tests pass.

## Technical notes
- Files: `src/features/auth/AuthGate.tsx`, `src/features/auth/authMessages.ts` (+ test),
  `src/features/auth/cooldown.ts` (+ test, likely removed), README, `docs/qa/smoke-test.md`.
- High tier (auth flow, `src/features/auth/**`): plan approval required; security review at REVIEW.
- Local mode (no `VITE_SUPABASE_*`) must keep skipping the login screen (R1).
- Risks / open questions: with D18, any stoktok account can sign in (RLS keeps data separate). Redirect URLs are
  no longer needed for TuDo login once magic link is gone; M-1 step 3 / M-4 wording may need a follow-up update.

## Test plan
- Unit: email/password validation, `authErrorMessage` mapping (invalid_credentials, over_request_rate_limit,
  network), no OTP exports left.
- Manual (Ming, after merge and M-1): sign in on a phone with the stoktok email + password; wrong password shows
  the Vietnamese error; sign out works; dark mode at 390px.

## Notes / answers from Ming
- 2026-11-09: "có và bỏ hẳn magic link" — email + password with the stoktok account, magic link removed, put at
  the top of the run order. No "forgot password" requested.

- 2026-11-09: Plan approved (2026-11-09) — Ming: "approve"; assumptions A1–A5 accepted as defaults (D19 recorded; feature list, M-1, M-4 updated on main).

## Handoff

### 2026-11-09 — claude — BLOCKED
- Done: plan.md READY (email + password via signInWithPassword, magic link and cooldown removed, Vietnamese error mapping, AuthGate + authMessages tests, README/smoke-test updated). Assumptions A1–A9 listed for Ming.
- In progress / next: Ming writes "Plan approved (YYYY-MM-DD)" under Notes / answers from Ming (and answers A1–A5 if different from defaults); then /run implements.
- Gotchas: A4 drops the Redirect URL steps from the README (password login does not need them); M-1 step 3 / M-4 in ming-todo and the feature list (A1) are updated on main by the orchestrator after approval.
