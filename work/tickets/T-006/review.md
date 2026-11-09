# Review — T-006: Replace magic-link login with email + password

## Attempt 1 — 2026-11-09
Verdict: PASS

Reviewed `git diff origin/main...HEAD` on `claude/loving-fermi-t90upb` (HEAD `98ab18d`), against the approved
plan (Ming, 2026-11-09, A1–A5 defaults). Security review runs separately and is not repeated here.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit`): clean, no output.
- format:check: "All matched files use the correct format." (83 files)
- test: `pnpm test`: 349 passed (349); matches impl-log.
- test:coverage: exit 0; thresholds met, including the new `src/features/auth/authMessages.ts` entry
  (`vitest.config.ts:31,44`); "All files" 100 / 99.28 / 100 / 100.
- build: `pnpm build`: "✓ built in 340ms".

### Acceptance criteria
- [x] Email + password fields, signs in with `signInWithPassword`; a valid account reaches the app. Evidence:
  `src/features/auth/AuthGate.tsx:37` (`signInWithPassword({ email: email.trim(), password })`), fields
  `AuthGate.tsx:73-96`. Tests: `AuthGate.test.tsx:73` "renders email and password fields when signed out",
  `:91` "submits trimmed email and the raw password…" (asserts `{ email: "a@b.co", password: " pw " }`),
  `:160` "renders children once onAuthStateChange delivers a session". A real stoktok account is Ming's check.
- [x] No `signInWithOtp`, magic-link copy, resend button or cooldown in `src/` (production code). Evidence:
  `rg -n -i "signInWithOtp|emailRedirectTo|cooldown|secondsLeft|RESEND|Gửi lại|link đăng nhập|magic" src` returns 4
  hits, all in tests: `AuthGate.test.tsx:167,174` and `authMessages.test.ts:60,64` (a test title and negative
  assertions). `src/features/auth/cooldown.ts` is deleted, and nothing else imported it (typecheck is clean).
- [x] Wrong credentials, empty fields, invalid email and rate limit each show a Vietnamese message; the button is
  disabled while the request runs. Evidence: `authMessages.ts:11-14,23-39`. Tests: `authMessages.test.ts:13-56`;
  `AuthGate.test.tsx:100` (invalid email, no call), `:109` (empty password, no call), `:118` (invalid_credentials,
  button re-enabled), `:127` (429), `:135` (pending: disabled + `COPY.signingIn`), `:147` (throw → generic,
  re-enabled via `finally` at `AuthGate.tsx:41-43`). Empty email + empty password gives `errInvalidEmail` (email is
  checked first, `authMessages.test.ts:14`), as the plan specifies.
- [x] `type="password"` + `autocomplete="current-password"`; email `autocomplete="email"`. Evidence:
  `AuthGate.tsx:76-79,89-91`; test `AuthGate.test.tsx:81` checks the rendered `type`, `autocomplete` and `name`
  attributes.
- [x] Light and dark mode at 390px (code reading). The card markup and tokens are unchanged from F-101
  (`AuthGate.tsx:47-60`: `w-full max-w-sm`, `p-4`/`p-6`, `var(--bg|surface|border|shadow)`). The password field
  reuses the `.field` label and the same `fontSize: 16, height: 44` as email (16px prevents iOS zoom on focus).
  `.field input` is `width: 100%` and uses `var(--surface)`/`var(--border)` (`src/index.css:650-661`), and both
  are redefined under `.dark` (`index.css:16-25`). There are no fixed widths, so the layout fits 390px. The dark
  class goes on `<html>` before the gate renders (`src/lib/theme.ts:11`). Ming checks on a real phone.
- [x] Unit tests for validation and error mapping; build, typecheck and tests pass. Evidence:
  `authMessages.test.ts` (isValidEmail incl. `tên@miền.vn`, validateLogin, authErrorMessage incl.
  `email_not_confirmed` → generic, COPY), 12 component tests in `AuthGate.test.tsx`, all checks above green.
- [x] (Technical note, R1) Local mode skips login. Evidence: `AuthGate.tsx:24-25` and the session effect
  (`:17-22`) are unchanged in the diff. Test `AuthGate.test.tsx:55` "local mode renders children without a login
  form" (`supabase = null`).

### Ming verification after merge (carry into the PR)
- On a phone in Supabase mode (dev or production URL), sign in with the stoktok email + password. The app opens;
  after a reload you are still signed in; sign out returns the login screen.
- The phone's password manager (iOS Keychain / Google Password Manager) offers to save and fill the password.
- A wrong password shows "Email hoặc mật khẩu chưa đúng. Kiểm tra lại giúp mình nhé."
- Choose dark mode in the app, then sign out: the login card is dark and fits the phone width. Check light mode too.
- Approve the Vietnamese copy in `src/features/auth/authMessages.ts:1-15` or ask for changes.

### Issues
None.

### Scope
Every changed file in `src/`, `vitest.config.ts`, `README.md` and `docs/qa/smoke-test.md` is in the plan's file
table. The `work/` changes are workflow files: the ticket, plan and impl-log, plus the T-006 plan-approval line in
`work/ming-todo.md`. That line is from orchestrator commit `3272e24` ("plan approved"), not from the implementer.
The `vitest.config.ts` change is limited to the two coverage lines (R10 Figma plugins are in `vite.config.ts`,
which is untouched).

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: the gate still returns children when `supabase === null` (tested), and there is no new direct `supabase`
  use outside the gate (the gate is the existing auth boundary from F-101).
- R3: no new env or secret. The password stays only in component state (`AuthGate.tsx:13`) and is never logged
  or persisted.
- R6: all copy is in `COPY`.
- R8: pure logic is tested, with coverage thresholds.
- R9: see AC 5.
- R10: untouched.
- R2, R4 and R5 are not affected.

### Nits (do not block)
- `AuthGate.tsx:100-104`: if the same error repeats on a second submit, the alert text does not change, so a
  screen reader may not announce it again. Optional: clear the error when an input changes.
- `AuthGate.test.tsx:41`: `screen.getByRole("button")` assumes the form has exactly one button. A later
  show-password toggle would break this helper; querying by name (`{ name: COPY.submit }`) would be sturdier.

### Follow-ups (out of scope)
- Show-password toggle and a "forgot password" link to stoktok (plan A3).
- `work/ming-todo.md`: the branch adds the T-006 approval line while main gets M-1/M-4 edits from D19. Watch for a
  merge conflict when the PR merges.

## Attempt 2 — 2026-11-09
Verdict: PASS

Rework scope: Ming's note of 2026-11-09 (`ticket.md:75`) and security-review 🟡 1. Rework commit `a408274`.

### Checks (run by reviewer)
- typecheck: `tsc --noEmit` clean, no errors.
- format:check: oxfmt, exit 0 ("Finished … on 83 files").
- test: 21 files, 351 tests, all passed (attempt 1 had 349, so +2 is as expected).
- test:coverage: All files 100% statements, 99.28% branches, 100% functions, 100% lines. Thresholds met.
- build: `vite build` OK (`dist/assets/index-*.js` 233.42 kB).
These match the impl-log Attempt 2 claims.

### Rework items
- [x] (1a) Password cleared after a successful sign-in. Evidence: `src/features/auth/AuthGate.tsx:42`
  (`else setPassword("")`, runs only when `signInWithPassword` returns no error, so a wrong password still keeps
  the field for correction). Test `AuthGate.test.tsx:188` "password is cleared after a successful sign-in". The
  mock does not emit a session, so this test exercises the `else` branch on its own.
- [x] (1b) Password cleared whenever the session changes. Evidence: `AuthGate.tsx:20-23` calls `setPassword("")`
  in the `onAuthStateChange` callback before `setSession`. This covers sign-out through `useWardrobe.signOut`,
  which is the scenario in the security review. Test `AuthGate.test.tsx:177`: fill → emit session → app content →
  emit null → the password input is `""`. `AuthGate` keeps its state while the children are shown (same
  component, no unmount), so without the fix this test would read `"secret"`. It discriminates.
- [x] (2) README step 3 no longer contains the sign-ups/anonymous "if not, stop" check. It now reads "no changes
  are needed … (D18/D19) … Do not change the Site URL … or any other Auth settings. Log in with your existing
  stoktok email + password" (`README.md:25-26`). `grep` finds no "sign up"/"Allow new users" wording left in
  `README.md` or `docs/qa/smoke-test.md`.

### Regression / scope
- `git diff 867a90a..HEAD` (since the attempt-1 review): code changes are only `AuthGate.tsx` (+4/−1),
  `AuthGate.test.tsx` (+20) and `README.md` (step 3). The rest is workflow files: impl-log, security-review and
  ticket.md (orchestrator note and state). No out-of-plan files.
- The attempt-1 acceptance criteria still hold. All 12 earlier AuthGate tests and the authMessages tests pass
  unchanged, the local-mode path is untouched (`AuthGate.tsx:27`, test `:55`), and the error paths still keep the
  password (`:41,43-44`).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1 is unchanged (the clearing lives inside the `if (!supabase) return` effect). R3 is
improved: the password no longer lingers in state after sign-in or sign-out. R8: both changes are tested. R10 is
untouched.

### Nits (do not block)
- `AuthGate.tsx:21`: the callback also runs for `INITIAL_SESSION`/`TOKEN_REFRESHED`. That is harmless: on the
  form, `INITIAL_SESSION` fires right at mount before any typing, and refresh events only happen while signed in.
- The email stays filled after sign-out. That is fine (not secret) and matches the security review's scope.

### Ming verification after merge (carry into the PR)
Same as attempt 1, plus: sign in, then sign out. The login form shows the email but an **empty** password field.

### Follow-ups (out of scope)
Unchanged from attempt 1.
