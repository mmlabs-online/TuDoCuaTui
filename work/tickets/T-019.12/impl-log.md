## Attempt 1 — 2026-11-15

Built on the current branch (T-019.10 already merged; plan A9 rebase note moot). Ming approved the plan as one ticket and all Vietnamese copy as proposed. Not committed (per orchestrator instruction).

### Files touched
| File | Required because |
|---|---|
| `src/shared/tokenPages.ts` (new) | Y2: one client path list + `tokenPageOf` |
| `src/shared/tokenPages.test.ts` (new) | AC5 |
| `server/static.js` | `export` `NO_REFERRER_PATHS` + comment (no behaviour change) |
| `server/tokenPages.parity.test.ts` (new) | AC5 parity |
| `src/lib/boot.ts`, `src/lib/boot.test.ts` | `takeTokenHash` / `needsAuth(rt, link)` |
| `src/main.tsx` | wiring: `link`, `verifyHash`, `resetHash` |
| `src/features/auth/identityClient.ts`, `identityClient.test.ts` | `forgotPassword`, `resetPassword` |
| `src/features/auth/types.ts` | new screen props, `password_reset` notice, `onGoForgot` |
| `src/features/auth/validation.ts`, `validation.test.ts` | `validateNewPassword`, `parseResetToken` |
| `src/features/auth/copy.ts` | forgot / reset / signIn / fields / preview copy |
| `src/features/auth/ForgotPasswordScreen.tsx` + `.test.tsx` (new) | forgot screen |
| `src/features/auth/ResetPasswordScreen.tsx` + `.test.tsx` (new) | reset screen |
| `src/features/auth/ResetPasswordPage.tsx` + `.test.tsx` (new) | reset wiring (D36) |
| `src/features/auth/SignInScreen.tsx`, `SignInScreen.test.tsx` | "Quên mật khẩu?" link, `password_reset` notice |
| `src/features/auth/AuthGate.tsx`, `AuthGate.test.tsx` | forgot screen, `initialScreen`, notice |
| `src/features/auth/AuthRoot.tsx`, `AuthRoot.test.tsx` | `resetHash`, reset view |
| `src/features/auth/preview/AuthPreview.tsx` | forgot + reset preview screens |
| `work/tickets/T-019.12/impl-log.md` | this log |

### Tests added / changed
- `tokenPages.test.ts`: tokenPageOf table; "no other file in src/ spells the page paths".
- `tokenPages.parity.test.ts`: set equality; referrerPolicyFor vs tokenPageOf fixture table.
- `boot.test.ts`: takeTokenHash verify/reset/trailing slash/no-op; replaceState before /healthz (both paths); needsAuth truth table with links.
- `identityClient.test.ts`: forgotPassword (shape, 403/429 mapping), resetPassword (shape, weak_password reasons, token_invalid).
- `validation.test.ts`: validateNewPassword, parseResetToken.
- `ForgotPasswordScreen.test.tsx`, `ResetPasswordScreen.test.tsx`, `ResetPasswordPage.test.tsx` (incl. token never in DOM, no console calls, no request until submit, double submit).
- `SignInScreen.test.tsx`: forgot link, password_reset notice.
- `AuthGate.test.tsx`: `describe("forgot password")` (6 tests).
- `AuthRoot.test.tsx`: 3 reset cases.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: "All matched files use the correct format." (251 files)
- test: Test Files 95 passed | 9 skipped (104); Tests 1232 passed | 176 skipped (1408) (skips are the existing DB-backed suites)
- build: `vite build` ok (`AuthRoot` chunk 30.50 kB)

### Out-of-plan files
None (`work/tickets/T-019.12/impl-log.md` is the required log). `pnpm format` was run; it changed only plan-listed files.

### Follow-ups (noticed, not done)
- Password-manager hint: hidden username field on the reset page (plan A8).
- The tokenPages "one list" test only matches quoted `"/x"` or `'/x'` literals, not template strings.

### Scope self-check
- Could the diff be smaller? No; every change maps to a plan row.
- Diff size: about +1300 / -50 lines including tests and new files.
