# T-019.11: Auth screens UI: sign-in, sign-up, verify email (not wired)

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | ui, security |
| Gate | plan-approval |
| Depends on | T-016 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | claude@2026-11-13T03:17:24Z |
| PR | — |

## Goal
Build the TuDo sign-in, sign-up and email-verification screens now, as presentational UI with no calls to the Identity
API, so that T-019.7 only has to wire them once org-admin-api is ready.

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`; D31, D35). Ming 2026-11-13: "dựng UI cho phần đăng kí, đăng nhập
trước, sau đó đợi API repo done thì integrate API sau". A8 changed: TuDo hosts sign-up and `/verify-email` because
org-admin-api USR-04c sends the verification link to the app the user signed up in
(`/home/user/mmlabs-online/org-admin-api/docs/consumers.md`, "Sign-up", "Link format", error tables).

## Scope
- Screens in `src/features/auth/` (Figma Make design language, Tailwind, existing primitives in `src/components/`):
  - Sign-in: email + password, submit, link to sign-up, error/notice area.
  - Sign-up: email + password (+ confirm), Turnstile placeholder slot, link to sign-in, "check your email" success state.
  - Verify email (`/verify-email`): verifying / verified / link invalid-expired (with "gửi lại email") / rate-limited states.
  - Shared notice states for the Identity error codes: `invalid_credentials`, `email_unverified` (+ resend),
    `not_member`, `session_invalid`, `turnstile_required`, `rate_limited` (with wait time), `network`.
- Client-side form validation only (email format, password rules as org-admin-api enforces them, confirm match).
- A props/callback interface (e.g. `onSignIn(email, password)`, `onSignUp(...)`, `status`, `error`) so T-019.7 plugs in
  the real client without changing the screens.
- Vietnamese copy in one file (`src/features/auth/copy.ts`, R6).
- A way to view the screens without the API that does not affect the running app (planner proposes: e.g. dev-only
  preview route or test-only harness).

## Out of scope
- Any network call, token handling, `mm_account_id`, Turnstile script loading, routing the real app through an AuthGate
  (all T-019.7); server changes; CSP (T-019.8).

## Acceptance criteria
- [ ] Sign-in, sign-up and verify-email screens with every state above; no `fetch` / Identity call anywhere in the slice.
- [ ] The running app is unchanged: local mode, API mode and the Figma Make preview show no auth screen (R1).
- [ ] Copy in Vietnamese in one place; component tests cover validation and each state.
- [ ] Works at 390px and in dark mode (R9); accessible labels and focus order.
- [ ] All checks pass.

## Technical notes
- Files (likely): `src/features/auth/*` (new; High tier path → plan approval), `src/components/*` only if a primitive is
  missing.
- Password rules and error codes: read org-admin-api `app/` validation and `docs/consumers.md`; mirror them, do not invent.

## Test plan
- Unit/component: validation, each state renders the right copy, callbacks fire with the form values.
- Manual: 390px light/dark in the preview harness.

## Notes / answers from Ming
- 2026-11-13: **Plan approved** (Ming, in session: "duyệt T-019.11"; A1–A15 and the draft copy as in plan.md).
- 2026-11-13: UI first, integrate the API later (T-019.7).

## Handoff
### 2026-11-13 — claude — BLOCKED
- Done: plan.md (Status READY): three presentational screens + shared layout/field/notice in `src/features/auth/`, `types.ts` contract for T-019.7, rules mirrored from org-admin-api (password 12–128 after NFKC, verify token regex), copy in `copy.ts`, dev-only preview page `auth-preview.html` (not in `dist/`), tests incl. a boundary test; assumptions A1–A15.
- In progress / next: Ming approves the plan (or edits A-n / the draft copy), then implement → review → PR.
- Gotchas: ~650 product + ~500 test lines (over the ~400 guide); fallback split moves verify-email + token parser to T-019.12. `vitest.config.ts` is shared with later T-019 slices.
