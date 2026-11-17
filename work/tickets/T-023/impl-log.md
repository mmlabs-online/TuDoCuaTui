# Implementation log — T-023

## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/validation.ts` | `PASSWORD_MIN` 12 → 6; comment now cites org-admin-api default 6, ge=6 (87026db; D43). Scope item 1. |
| `src/features/auth/copy.ts` | `signUp.passwordHint`, `fieldErrors.tooShort`, `errors.weak_too_short` say "6 ký tự". Scope item 2, R6. |
| `src/features/auth/validation.test.ts` | Boundary tests 11/12 → 5/6 (sign-up and reset), "does not trim", NFKC and full-width tests. Scope item 3, R8. |
| `src/features/auth/SignUpScreen.test.tsx` | Short password uses 5 chars; default `fill` password is 6 chars, so the valid-submit test proves 6 is accepted at screen level. AC 1. |
| `src/features/auth/ResetPasswordScreen.test.tsx` | "5 chars and mismatch…" (mismatch step at 6 chars); new "6 chars are accepted" test. AC 1. |
| `src/features/auth/copy.test.ts` | New "password length copy › matches PASSWORD_MIN" guarding copy ↔ constant drift. AC 2. |

### Tests added / changed
Written first; with `PASSWORD_MIN = 12` and the old copy, 8 tests failed (the 5/6 boundary, trim, NFKC, full-width, reset 5/6, SignUp valid submit, Reset 5-char/mismatch and 6-char acceptance). All pass after the source change.
- `validation.test.ts` › `passwordError (sign-up)` › "5 → tooShort, 6 → ok"
- `validation.test.ts` › `passwordError (sign-up)` › "does not trim" (`" aaaa "` → null, `" aaa "` → tooShort)
- `validation.test.ts` › `passwordError (sign-up)` › "measures after NFKC" (`"é".repeat(5)`, `"mật k"`/`"mật kh"` in NFD, `"ｍａｔｋｈ"`/`"ｍａｔｋｈａ"`)
- `validation.test.ts` › `validateNewPassword` › "5 chars -> tooShort, 6 -> ok"
- `validation.test.ts` › `validateNewPassword` › NFKC full-width test (`"１".repeat(6)` → null, `"１".repeat(5)` → tooShort)
- `SignUpScreen.test.tsx` › "short password shows error…" (5 chars); "valid submit omits the confirm value" (6 chars)
- `ResetPasswordScreen.test.tsx` › "5 chars and mismatch focus the first invalid field and do not call onReset"; "6 chars are accepted" (new)
- `copy.test.ts` › "password length copy › matches PASSWORD_MIN" (new)

### Checks (actual output summary)
- typecheck: `pnpm typecheck` exit 0
- format:check: `pnpm format:check` exit 0 — "All matched files use the correct format." (ran `pnpm format` first)
- test: `pnpm test` exit 0 — Test Files 99 passed | 10 skipped (109); Tests 1232 passed | 205 skipped (1437)
- build: `pnpm build` exit 0 — built in 616ms
- `grep -rn "12 ký tự" src/` → no matches (exit 1); `grep -rn "6 ký tự" src/features/auth/copy.ts` → lines 46, 76, 103.

### Deviations
- `weak_too_short` lives under `AUTH_COPY.errors` (`copy.ts:103`), not `actions` as the plan's A2 states; the ticket's `errors.weak_too_short` was right. Changed it in place; the copy test reads `AUTH_COPY.errors.weak_too_short`.
- Reset screen: the plan says the reset test should include "a valid step" at 6 chars. Put it in a separate test ("6 chars are accepted") so the existing test still asserts `onReset` is never called.
- Sign-in validation (`signInPasswordError`, `validateSignIn`) untouched (AC 3). Tests that use 12-char passwords as valid input (`validateSignUp`, `validateNewPassword` mismatch) left as is (A3).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- None in code. Ming's post-merge production check (plan, "Ming verification after merge") still applies before deploying.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +46 / -25 lines (6 files). Not committed (orchestrator commits).
