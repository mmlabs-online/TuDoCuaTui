## Attempt 1 — 2026-11-07

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/AuthGate.tsx` | Restyle, client email check, mapped errors, resend button with countdown. Session effect, early returns and `signInWithOtp` call unchanged (`git diff -w` shows them as context lines). |
| `src/features/auth/authMessages.ts` (new) | `COPY`, `isValidEmail`, `authErrorMessage` (pure, no imports). |
| `src/features/auth/cooldown.ts` (new) | `RESEND_COOLDOWN_MS`, `secondsLeft` (pure). |
| `src/lib/theme.ts` (new) | `applySavedTheme()` reads `tu-do-theme` in try/catch, toggles `dark`. |
| `src/main.tsx` | Call `applySavedTheme()` before render. |

### Tests added / changed
- No test runner on this branch. Throwaway script (scratchpad, deleted, not committed) run with `node --experimental-strip-types`: all 8 plan cases (secondsLeft 60 / 1 / 0 / 0 / null; isValidEmail accept and reject lists; 429 and both rate-limit codes; email_address_invalid; `{status:0}`, `{}`, `null`, unknown code -> generic). Output: `ALL CHECKS PASSED`.

### Checks (actual output summary)
- typecheck: `tsc --noEmit` passed, no errors
- format:check: "All matched files use the correct format." (22 files)
- test: n/a (no runner; see script above)
- build: `vite build` passed (built in 937ms)
- Not done: visual check in a browser (no dev server started).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- F-005: move the check-script cases into `src/features/auth/*.test.ts` (Vitest, fake timers).
- F-004.1: `App.tsx` should import `THEME_KEY` from `src/lib/theme.ts`.
- Optional: "use a different email" link in the sent state.
- `.field input` in `index.css` is 11px; AuthGate overrides to 16px / 44px inline to avoid iOS zoom.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see `git diff --shortstat` against main (about +150 / -35 including new files).
