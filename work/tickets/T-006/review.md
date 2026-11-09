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
