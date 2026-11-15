## Attempt 1 — 2026-11-15

Commits (plan Approach order): `a036fe8` pure logic, `c72e38d` data layer + App/Header, `3f1e0e4` detectRuntime/boot, `c87e9c4` screens + lazy boot.

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/config.ts` | new: identity base URL, app key, public Turnstile site key (AC9) |
| `src/features/auth/errors.ts` (+test) | new: server error normalising (AC12) |
| `src/features/auth/identityClient.ts` (+test) | new: login/token/logout/signup/verify/resend (AC1, 9, 11, 15) |
| `src/features/auth/accountId.ts` (+test) | new: only `mm_account_id` on the device (AC3, 7) |
| `src/features/auth/tokenStore.ts` (+test) | new: in-memory token, single-flight, lazy refresh (AC2-5, 7, 16) |
| `src/features/auth/turnstile.ts`, `TurnstileWidget.tsx` (+`turnstile.test.tsx`) | new: sole script injector and widget (AC9, 10) |
| `src/features/auth/AuthGate.tsx` (+test) | new: identity state machine (AC1, 2, 5, 7, 10, 15-17) |
| `src/features/auth/VerifyEmailPage.tsx` (+test) | new: button-gated verify, resend (AC11, 13, 14) |
| `src/features/auth/AuthRoot.tsx` (+test) | new: lazy entry (AC8, 14) |
| `src/features/auth/types.ts` | `ready` state, `onVerify`/`error`, `no_access` (AC5, 13) |
| `src/features/auth/copy.ts` (+`copy.test.ts`) | `verify.ready/submit`, `no_access`, `actions.retry`, `gate.checking`, `Array.isArray(reasons)` (AC6, 12, 13) |
| `src/features/auth/VerifyEmailScreen.tsx` (+test), `preview/AuthPreview.tsx` | `ready` state (AC13) |
| `src/features/auth/validation.ts` | comment reworded only, so the boundary test's `history.` rule holds |
| `src/features/auth/boundary.test.ts` | rewritten as per-file allowlist (A12) |
| `src/lib/boot.ts` (+test) | `takeVerifyHash`, `needsAuth` (AC8, 11) |
| `src/data/mode.ts` (+test) | `detectRuntime`; `detectMode` wrapper (AC1, 8) |
| `src/data/authFetch.ts` (+test) | new: bearer, one retry, `onAuthLost` (AC4) |
| `src/data/repo.http.ts`, `aiSettings.ts`, `photoUrls.ts`, `useWardrobe.ts` (+tests) | inject `auth` / `getToken(rejected)` (AC4, 16) |
| `src/App.tsx`, `src/features/layout/Header.tsx`, `layout/copy.ts` | `onSignOut`, per-App AI client, sign-out icon (AC16, 17) |
| `src/main.tsx` | verify hash first, `detectRuntime`, dynamic `import()` only when `needsAuth` (AC8, 11) |

### Tests added / changed
- New: `errors.test.ts`, `identityClient.test.ts`, `accountId.test.ts`, `tokenStore.test.ts`, `turnstile.test.tsx`, `AuthGate.test.tsx`, `VerifyEmailPage.test.tsx`, `AuthRoot.test.tsx`, `src/lib/boot.test.ts`, `src/data/authFetch.test.ts`.
- Extended: `copy.test.ts`, `VerifyEmailScreen.test.tsx`, `mode.test.ts`, `repo.http.test.ts`, `aiSettings.test.ts`, `photoUrls.test.ts`, `useWardrobe.test.tsx`, `boundary.test.ts` (rewritten).
- Changed existing: `photoUrls.test.ts` — dropped `401` from the "rejects, caches nothing" table (a 401 now retries once; covered by two new tests) and the rejecting `getToken` now surfaces as `ApiError(0, "network")` instead of the raw error (plan AC4: message never carries the token).

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: 88 files passed | 8 skipped (96); 1081 tests passed | 167 skipped (1248). The skipped ones are the existing DB suites (server not touched, so not run).
- test:coverage: same counts; All files 84.93 stmts / 85.51 branch / 85.38 funcs / 84.7 lines; no threshold failure.
- build: ok; `dist/assets/index-*.js` 264.84 kB, `AuthRoot-*.js` 21.28 kB (lazy).
- Chunk check: `grep -l "api.mmlabs.online" dist/assets/*.js` lists only `AuthRoot-ngq-Wez0.js`; `mm_account_id` and `challenges.cloudflare` are not in the entry chunk.
- Playwright (system Chrome, `vite preview` of `dist/`, `/healthz` stubbed to `auth: "identity"`, api.mmlabs.online stubbed incl. CORS), 390px light and dark: sign-in, sign-up, verify-email (`ready`) and the `not_member` error render with `scrollWidth` 390 (no horizontal scroll). `/verify-email#token=…` -> address bar `/verify-email` with no hash. After login only `mm_account_id` (and `tu-do-theme`) in localStorage, sessionStorage empty; requests: `POST /auth/login` then `POST /auth/token`, both with `X-MM-App: tudocuatui`. Turnstile script was blocked in this run, so sign-up showed the `turnstile_failed` copy with submit disabled (intended fail-closed path); the real widget is an M-21 check. Screenshots were kept in the scratchpad, not in the repo.

### Out-of-plan files
- None. (`src/features/auth/validation.ts` is in the auth dir; only a comment was reworded.)

### Follow-ups (noticed, not done)
- In sign-in after `turnstile_required`, a later `invalid_credentials` is shown as `turnstile_required` copy, because `SignInScreen` renders the widget slot only next to a turnstile error (its test pins that). A screen prop to keep the slot visible would show the real error; separate small ticket.
- `rate_limited` state in `VerifyState` stays unused by the wiring (A7).
- `useWardrobe.test.tsx` was reformatted on disk by `oxfmt` during the run (no content change beyond my added describe).

### Scope self-check
- Could the diff be smaller? No: each file is in the plan's list; no extra abstractions added. `resetTurnstileLoaderForTests` is the only test-only export.
- Diff size: about +2735 / -63 lines over 44 files (roughly half tests). `server/**`, `vite.config.ts`, `public/`, `Dockerfile`, CI: no diff.
