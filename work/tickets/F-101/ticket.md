# F-101: Polish the login screen

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | ui, security |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-07T08:57:09Z |
| PR | — |

## Goal
The login screen looks like the rest of the app and handles common errors clearly.

## Feature reference
`docs/feature-list.md` F-101. Decisions: `work/decisions.md`.

## Scope
- Restyle `AuthGate` to the Figma Make design language.
- A resend button with a 60-second cooldown and a visible countdown.
- Clear Vietnamese messages for invalid email and for rate limiting (Supabase 429 / `over_email_send_rate_limit`).
- Apply the saved theme before `AuthGate` renders: today the `dark` class is set by an effect inside `App`,
  so the login screen is never dark.

## Out of scope
- Google sign-in (F-102, M2).

## Acceptance criteria
- [ ] Matches the app style in light and dark mode.
- [ ] Works on a 390px viewport.
- [ ] Resend is disabled for 60 seconds after each send.

## Technical notes
- Files: `src/features/auth/AuthGate.tsx`, `src/main.tsx` (theme init), `src/components/*`.
- Expected tier: **High** (`src/features/auth/**`), so a PLAN needs Ming's approval before coding.

## Test plan
- Unit: cooldown timer with fake timers; error message mapping.
- Manual: real magic link on a phone in light and dark mode; trigger the rate limit.

## Notes / answers from Ming
- 2026-11-07: Plan approved (2026-11-07) — Ming: "duyệt".
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
### 2026-11-07 — claude — BLOCKED (plan approval)
- Done: plan.md READY (AuthGate restyle, 60 s resend cooldown, mapped Vietnamese errors, theme applied before render; `signInWithOtp` call, `emailRedirectTo` and session handling unchanged — see plan "Security summary").
- In progress / next: Ming approves → add "Plan approved (YYYY-MM-DD)" under Notes → `/run F-101` implements.
- Gotchas: no Vitest on main yet; plan verifies pure modules with a throwaway `node --experimental-strip-types` script; Vitest cases are a follow-up for F-005.
