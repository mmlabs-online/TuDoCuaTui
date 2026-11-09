## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/AuthGate.tsx` | Email + password form, `signInWithPassword`, `try/finally` for `busy`; OTP/resend/cooldown removed; session effect and early returns unchanged |
| `src/features/auth/authMessages.ts` | New password-login `COPY`, `validateLogin`, `invalid_credentials` mapping |
| `src/features/auth/authMessages.test.ts` (new) | Unit tests for validation, error mapping, COPY |
| `src/features/auth/AuthGate.test.tsx` (new) | Component tests (local mode, session, attributes, submit, errors, busy, throw, onAuthStateChange, no resend) |
| `src/features/auth/cooldown.ts` | Deleted (only AuthGate imported it) |
| `vitest.config.ts` | `authMessages.ts` added to coverage include + thresholds |
| `README.md` | Magic link wording replaced (line 14, setup step 3, deploy steps 8-9, code map) per A4 |
| `docs/qa/smoke-test.md` | Sign-in step, ports row, Run B prerequisites, "Login user" row |

### Tests added / changed
- `authMessages.test.ts`: isValidEmail accept/reject, validateLogin (5 cases), authErrorMessage (credentials, rate limit x3, invalid email, fallbacks x6), COPY has no link/resend wording.
- `AuthGate.test.tsx`: 12 tests as listed in the plan.

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean
- format:check: "All matched files use the correct format."
- test: 21 files, 349 tests passed
- test:coverage: exit 0 (thresholds incl. authMessages.ts met), 349 passed
- build: built OK
- AC 2 grep (`rg -n -i "signInWithOtp|emailRedirectTo|cooldown|secondsLeft|RESEND|Gửi lại|link đăng nhập|magic" src`): only 4 hits, all negative assertions in the new tests (`/Gửi lại/` and `/link|Gửi lại/i`, one test title with "magic-link"). No production code matches.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- None beyond the plan's (show-password toggle, forgot password).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: source/docs about +73 / -93 plus ~290 lines of new tests.
