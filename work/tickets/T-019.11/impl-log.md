## Attempt 1 — 2026-11-13

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/types.ts` | Props / error contract for T-019.7 |
| `src/features/auth/copy.ts` | R6: all Vietnamese copy, `formatWait`, `authErrorMessage` |
| `src/features/auth/validation.ts` | Pure validation mirroring org-admin-api, `parseVerifyToken` |
| `src/features/auth/AuthLayout.tsx` | Shared card shell; also exports the small `LinkButton` (kept here to avoid a file outside the plan) |
| `src/features/auth/AuthField.tsx` | Label/input with `aria-invalid` + `aria-describedby` |
| `src/features/auth/AuthNotice.tsx` | `role="alert"` / `role="status"` box with optional action |
| `src/features/auth/SignInScreen.tsx`, `SignUpScreen.tsx`, `VerifyEmailScreen.tsx` | The three screens |
| `src/features/auth/preview/AuthPreview.tsx`, `preview/main.tsx` | Dev-only preview harness (A4) |
| `auth-preview.html` | Dev-only entry for the harness; not a build input |
| `src/features/auth/validation.test.ts`, `copy.test.ts`, `SignInScreen.test.tsx`, `SignUpScreen.test.tsx`, `VerifyEmailScreen.test.tsx`, `boundary.test.ts` | Tests listed in the plan |
| `vitest.config.ts` | Coverage include + thresholds for `validation.ts` and `copy.ts` |

### Tests added / changed
- validation.test.ts: emailError, passwordError, signInPasswordError, confirmError, validateSignIn/SignUp, parseVerifyToken
- copy.test.ts: formatWait, authErrorMessage (every code, rate_limited, weak_password reasons)
- SignInScreen.test.tsx, SignUpScreen.test.tsx, VerifyEmailScreen.test.tsx: validation, focus, submit contract, every state and error code, resend, Turnstile slot, a11y attributes, tab order
- boundary.test.ts: no network/storage calls, no app import of features/auth, theme variables and no wide fixed widths

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: "All matched files use the correct format."
- test: 63 files passed, 6 skipped; 723 tests passed, 101 skipped. `pnpm test:coverage` exit 0 (thresholds met)
- build: built OK. `dist/` has only index.html, assets, favicon.png, robots.txt: no `auth-preview.html`; `grep -rl "Tạo tài khoản" dist/` finds nothing

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Repo has no jest-dom and no automatic RTL cleanup, so the new tests use plain DOM assertions and `afterEach(cleanup)`.
- Password show/hide toggle; `aria-describedby` in shared `Field.tsx`; Figma Make kit stories (plan A15).

### Scope self-check
- Could the diff be smaller? No; every file is in the plan list.
- Diff size: new files only plus +4 lines in vitest.config.ts.

## Attempt 2 (REWORK) — 2026-11-13

### Files touched
- `src/features/auth/AuthLayout.tsx`: brand line `var(--muted)`, `LinkButton` `var(--text)` (review Issue 1).
- `src/features/auth/copy.ts`: `authErrorMessage` falls back to `unknown` for non-string / non-own codes (uses `Object.prototype.hasOwnProperty.call`; `Object.hasOwn` fails the repo's TS lib target); unknown `reasons` filtered (S1).
- `src/features/auth/copy.test.ts`: "__proto__"/"bogus"/"constructor" and bogus reasons tests (S1).
- `src/features/auth/validation.ts`, `types.ts`: doc comments with T-019.7 token rules (S2).
- `src/features/auth/validation.test.ts`: 32- and 128-char accept tests (S3).
- `src/features/auth/SignUpScreen.test.tsx`: asserts `method="post"` (S4).
- `src/features/auth/preview/AuthPreview.tsx`: `whitespace-pre-wrap` on the log (nit).

### Dark-mode check (Playwright, 390px, `.dark`, `/auth-preview.html`)
Card `rgb(28,42,36)`; brand `rgb(193,185,173)`; links `rgb(255,248,235)`; scrollWidth 390 for sign-in idle, sign-up idle, sign-up sent. All readable.

### Checks
- typecheck: clean. format:check: all files correct. test: 63 files passed, 6 skipped; 728 passed, 101 skipped. build: OK.

### Out-of-plan files: none. Follow-ups: skipped the "tới ." sentTo nit (wiring always passes it).
### Scope self-check: only review issues and orchestrator-directed hardening.
