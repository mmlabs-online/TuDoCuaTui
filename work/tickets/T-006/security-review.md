# Security review — T-006

## Attempt 1 — 2026-11-09 (security-ai-generated-code-auditor)

**Verdict: no 🔴 blockers; one 🟡 worth fixing.** Read-only review.

### 🟡 1. The password stays in React state after login and is still in the form after sign-out
- `src/features/auth/AuthGate.tsx:13` keeps `password` in `useState`; nothing clears it on success or sign-out.
- `AuthGate` wraps the whole app (`src/main.tsx:12`) and never unmounts. When `useWardrobe.signOut` (`src/data/useWardrobe.ts:96-97`) sets the session back to `null`, the login form returns with the email and the old password filled in.
- Risk: on a shared or borrowed phone the next person taps "Đăng nhập" and is signed into Ming's account; the value is also readable with React DevTools (CWE-522 / CWE-316; needs physical access).
- Fix: `setPassword("")` after a successful `signInWithPassword`, or better in the `onAuthStateChange` callback whenever the session changes; add a test that the password field is empty after the session goes from set to null.

### 🟢 2. Password handling is otherwise correct
- No `console.*` in `src/`. Errors are fixed strings from `COPY` (`authMessages.ts:10-14`); neither raw `error.message` nor the input reaches the DOM.
- Password sent untrimmed (`AuthGate.tsx:37`, `authMessages.ts:25`), tested (`AuthGate.test.tsx:91-98`).
- Inputs: `type="password"`, `name="password"`, `autoComplete="current-password"` (`AuthGate.tsx:88-91`); email `type="email"`, `autoComplete="email"` (`:76-79`); tested (`AuthGate.test.tsx:80-89`).

### 🟢 3. No account enumeration
- `invalid_credentials` (no such user / wrong password) → one message (`authMessages.ts:37`); `email_not_confirmed`, `user_banned` and other codes → `errGeneric`.

### 🟢 4. Errors can't leave the UI stuck
- `try/catch/finally` (`AuthGate.tsx:36-43`) resets `busy`; thrown errors show `errGeneric`; tested (`AuthGate.test.tsx:118-158`). Button disabled while busy (`:97`).

### 🟢 5. Session handling unchanged
- `getSession` / `onAuthStateChange` as before (`AuthGate.tsx:17-22`); client options unchanged (`src/lib/supabase.ts:14`).
- Pre-existing follow-ups: `getSession()` has no `.catch`; `detectSessionInUrl: true` no longer needed (harmless, revisit with F-102).

### 🟢 6. No secrets / new `VITE_*` (R3)
- Only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; `vitest.config.ts:22` blanks them for tests.

### 🟢 7. Local mode still skips auth (R1)
- `AuthGate.tsx:11,24`; tested `AuthGate.test.tsx:55-64`.

### 🟢 8. Docs don't advise unsafe Auth settings
- `README.md:25-28` keeps Site URL and sign-up settings unchanged; the only check is read-only. `docs/qa/smoke-test.md:75` auto-confirms a test user in local Studio only.
- Orchestrator note: the README's "confirm sign-ups are OFF (if not, stop)" contradicts D18 (keep stoktok Auth as is); Ming asked to fix it in the rework.

### 🟢 9. Magic link fully removed
- No `signInWithOtp`, cooldown or resend in `src/`; test `AuthGate.test.tsx:167-175`.

### Risks
- Accepted under D18: any stoktok account can sign in; isolation relies on RLS (unchanged).
- Brute force relies on Supabase's server-side rate limit; 429 / `over_request_rate_limit` mapped (`authMessages.ts:29-36`).

## Attempt 2 — 2026-11-09 (security-ai-generated-code-auditor, re-review of a408274)

**Verdict: 🟡 1 is fixed. Nothing regressed, no 🔴, and the README change gives no unsafe advice.**

### 🟢 1. Password no longer stays in state or in the form after sign-out (was 🟡 1)
- `onAuthStateChange` clears the password before setting the session (`src/features/auth/AuthGate.tsx:20-23`). Sign-out (`src/data/useWardrobe.ts:96-98`) fires that callback with `null`, so the form returns with an empty password even though `AuthGate` never unmounts.
- Cleared after a successful `signInWithPassword` (`AuthGate.tsx:41-42`); kept on error so the user can retry.
- Tests catch a regression: `AuthGate.test.tsx:177-186` (session set → null → empty field) and `:188-195` (empty after successful sign-in).

### 🟢 2. No regressions
- No `console.*` / `service_role` in `src/`; only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (R3).
- Password untrimmed (`AuthGate.tsx:40`, test `:91-98`); input attributes unchanged (`:79-99`); fixed `COPY` errors and `try/catch/finally` (`:39-47`); local mode skips auth (`:11,18,27`, test `:55-64`, R1).

### 🟢 3. README change is safe
- `README.md:25-26`: no Auth changes (D18/D19), don't change the Site URL or other Auth settings, log in with the existing stoktok email + password. The D18 contradiction is gone. `README.md:61-63` and `:68-69` unchanged and correct; `docs/qa/smoke-test.md` has no sign-up/anonymous/Site URL/redirect wording.

### 🟢 4. Minor notes (no action)
- Password is cleared on every auth event (incl. `INITIAL_SESSION`, `TOKEN_REFRESHED`); at most a half-typed password could be wiped — UX nit.
- Email stays prefilled after sign-out; not a secret. Optional follow-up.

### Risks (accepted under D18)
- Anyone who can sign up to stoktok can sign in to TuDo; isolation relies on RLS (`supabase/tests/`, not yet run in CI).
- Brute force relies on Supabase's rate limit; 429 mapped.
