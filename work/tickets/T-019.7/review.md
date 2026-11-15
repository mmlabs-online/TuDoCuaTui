## Attempt 1 — 2026-11-15
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean (exit 0).
- format:check: "All matched files use the correct format." (236 files, exit 0).
- test: 88 files passed | 8 skipped; 1081 tests passed | 167 skipped (skipped = DB suites, server untouched). Matches impl-log.
- build: ok; `index-DyBZ39K3.js` 264.84 kB, lazy `AuthRoot-ngq-Wez0.js` 21.28 kB.
- Chunk grep on `dist/assets/*.js`: `api.mmlabs`, `mm_account_id`, `challenges.cloudflare`, `auth/token` only in `AuthRoot-*.js`. (`Bearer` and the `/verify-email` path string are in the entry via `src/data/authFetch.ts` and `src/lib/boot.ts`, as planned.)
- `git diff origin/main...HEAD -- server vite.config.ts AGENTS.md .figma public index.html`: empty.
- Playwright (system Chrome, `dist/` served through route stubs, `/healthz` stubbed, Identity API stubbed with CORS), 390x844, light and dark, 82/82 assertions pass:
  - identity, no id: sign-in shown, zero Identity and `/api` calls; scrollWidth 390; `dark` class follows the theme.
  - sign-in: `POST /auth/login` then `/auth/token`, both `X-MM-App: tudocuatui`, no bearer to Identity; every `/api/items`, `/api/locations`, `/api/photos/<uuid>` request carries `Bearer tokA`; photos render as `blob:`.
  - storage after sign-in: localStorage `mm_account_id` (+ existing `tu-do-theme`), sessionStorage empty; no token in DOM, URL or console.
  - reload: only `/auth/token` with the stored `account_id`; no sign-in form.
  - sign-out: blob URL revoked, App unmounted, one `POST /auth/logout {account_id}`, `mm_account_id` removed, "Bạn đã đăng xuất." shown.
  - first 401: one `/token` refresh for the 2 parallel 401s (single-flight), retries carry `Bearer tokB`, app loads.
  - always 401: 2 tries per path, then the `no_access` notice, `mm_account_id` removed, no logout call.
  - `/verify-email#token=…` in identity and access mode: the only pre-render fetch (`/healthz`) sees `location.href` without the hash; no POST before the click; the token is not in the DOM or console; one POST with body `{"token":…}`, no `X-MM-App`, no query string; "Tiếp tục" → identity: sign-in with the verified notice at `/`; access: App with no Authorization header.
  - local (`/healthz` HTML) and access (no hash): AuthRoot chunk never requested, no Identity calls, no sign-in form, no Authorization header on `/api`, no `mm_account_id`.

### Acceptance criteria
- [x] 1 Gate until a valid token — `AuthGate.test.tsx` › "no id -> sign-in…", "login -> token -> App rendered…"; `mode.test.ts` `detectRuntime`; Playwright above.
- [x] 2 Sign-out order — `AuthGate.test.tsx` › "order: App unmount -> logout -> id cleared…", "logout failure still signs out"; `tokenStore.test.ts` › "discards a late refresh"; Playwright (blob revoked, logout POST, id gone).
- [x] 3 Token never stored or logged — `tokenStore.test.ts` › "never writes anything but mm_account_id; no history or console use"; `boundary.test.ts` allowlist; Playwright storage/DOM/console checks.
- [x] 4 Bearer + one retry — `authFetch.test.ts`, `repo.http.test.ts`, `aiSettings.test.ts`, `photoUrls.test.ts` (new 401 cases); Playwright 401-once/always.
- [x] 5 `no_access` — `AuthGate.test.tsx` › "onAuthLost -> no_access notice, id removed, logout not called, idempotent"; Playwright.
- [x] 6 Copy — `copy.ts` (incl. `no_access`, verify `ready`/`submit`, retry, `gate.checking`), `LAYOUT_COPY.signOut`; `copy.test.ts`. No new Vietnamese literals outside copy files.
- [x] 7 Restore outcomes — `AuthGate.test.tsx` restore tests (ready / session_invalid / retry), `tokenStore.test.ts`, `accountId.test.ts`; Playwright reload.
- [x] 8 Lazy auth chunk — `boundary.test.ts` › "only src/main.tsx mentions features/auth…"; `boot.test.ts` › "truth table"; dist grep; Playwright local/access.
- [x] 9 Sign-up + Turnstile — `identityClient.test.ts`, `turnstile.test.tsx`, `AuthGate.test.tsx` › "201 -> sent, the form is gone…", "without a Turnstile token no request is made".
- [ ] 10 Turnstile on sign-in — slot and `turnstile_token` work (`AuthGate.test.tsx:202`), but a wrong password after Turnstile is reported as a Turnstile error; see Issue 1.
- [x] 11 Verify hash stripped before any fetch — `boot.test.ts` › "replaceState runs before the /healthz fetch"; `identityClient.test.ts` verifyEmail shape; `VerifyEmailPage.test.tsx` › "the token is never in the DOM…"; Playwright `__fetchLoc`.
- [x] 12 Error normalising — `errors.test.ts`.
- [x] 13 Verify waits for the button — `VerifyEmailScreen.test.tsx`, `VerifyEmailPage.test.tsx` › "a good hash waits for the button…", 429/network/422 cases.
- [x] 14 Verify in both modes, resend gating — `AuthRoot.test.tsx` (4 cases), `VerifyEmailPage.test.tsx` resend block; Playwright both modes.
- [x] 15 Resend after `email_unverified` — `AuthGate.test.tsx` › "email_unverified -> resend -> sent".
- [x] 16 Stable getToken, remount per sign-in — `AuthGate.test.tsx` › "…stable getToken", "a new sign-in remounts the App"; `useWardrobe.test.tsx`; server diff empty.
- [x] 17 Header sign-out only with `onSignOut` — `AuthGate.test.tsx:397`/`:403`; Playwright (absent in access/local).
- [x] 18 Reused screens, checks green, 390px + dark — checks above; Playwright screenshots (sign-in, app, no_access, verify) at 390px light/dark, no horizontal scroll.

### Issues
#### Issue 1 — 🔴 blocker — correctness (sign-in error copy)
- **Where**: `src/features/auth/AuthGate.tsx` `signIn` catch block (`const shown: AuthError = needTurnstile && err.code === "invalid_credentials" ? { code: "turnstile_required" } : err;`); pinned by `src/features/auth/AuthGate.test.tsx:233`.
- **Expected**: when the server answers `invalid_credentials`, the user sees "wrong email or password" (`AUTH_COPY.errors.invalid_credentials`), also once Turnstile is required.
- **Actual**: once `needTurnstile` is true, every wrong password is shown as "Vui lòng hoàn tất bước xác minh bên dưới rồi thử lại.". A user who mistypes after the Turnstile threshold (exactly when mistypes are likely) solves the challenge, gets the same Turnstile message again, and is never told the password is wrong. Reloading does not help (the server asks for Turnstile again, then the same remap applies). The impl-log lists this as a follow-up, but it is a defect this diff introduces, and it can be fixed inside `AuthGate.tsx` without touching `SignInScreen`.
- **Fix instruction**: remove the `shown` remap and call `setView({ kind: "signed_out", error: err })`. Keep `needTurnstile` true and keep `spendTurnstile()`. The existing guard at the top of `signIn` (`needTurnstile && !tsToken.current` → `turnstile_required`) then shows the widget again on the next submit, so the flow is: wrong password shown → user fixes it and submits → widget shown → solve → login with `turnstile_token`. Update `AuthGate.test.tsx` "the Turnstile token is single-use…" to expect `AUTH_COPY.errors.invalid_credentials` after the second login, then assert that the next submit makes no login call and shows the slot (`turnstile_required`), and that after a new widget callback the third login carries the new `turnstileToken`. Remove the follow-up entry about this from impl-log.

### Deviations judged
- `photoUrls.test.ts` edits: accepted. Dropping `401` from the "rejects, caches nothing" table follows plan AC4 (401 now retries once, covered by two new tests); a rejecting `getToken` now surfaces as `ApiError(0, "network")`, which is what the plan's `authFetch` row asks for (no raw error, no token in the message).
- `invalid_credentials` shown with Turnstile copy: not accepted, Issue 1.
- `flushSync` in sign-out: accepted. It runs in a click handler (not during render or an effect), and it is what makes plan AC2's order (App unmount and `photos.clear()` before `/logout`) hold; confirmed in the browser (blob URL revoked before the logout POST, App gone).

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: local mode makes no `/api` or Identity call and never loads the auth chunk; without `getToken`, `createAuthedFetch` passes requests through unchanged. R3: only the public site key and public URLs, no `VITE_*`. R4/D34: bearer only in the `Authorization` header to same-origin paths, photos as `blob:`. R6: copy in `copy.ts` / `LAYOUT_COPY`. R7: every file is in the plan; `validation.ts` changes only a comment (explained in impl-log). R8: tests for every new pure module. R9: 390px light and dark checked. R10: `vite.config.ts`, `AGENTS.md`, `.figma/` untouched.

### Nits (do not block)
- `src/main.tsx`: if `import("./features/auth/AuthRoot")` fails (offline, stale deploy), the result is an unhandled rejection and a blank page. That fails closed, which is correct, but a plain Vietnamese "reload" message would be kinder.
- `VerifyEmailPage.tsx` resend `session_invalid`: hides resend but leaves the dead `mm_account_id` in place; the gate drops it on the next restore anyway.
- `TurnstileWidget` `onError` sets `tsFailed`, which stays set until the user switches screens; a transient widget error keeps sign-up disabled until then.

### Follow-ups (out of scope)
- Show a reload notice when the lazy auth chunk fails to load (see nit 1).
- Ship together with T-019.8 (CSP `connect-src https://api.mmlabs.online`, Turnstile `script-src`/`frame-src`, `Referrer-Policy: no-referrer` on `/verify-email`), as the plan's release notes say.

### Ming verification after merge (carried to the PR)
- M-21 checks 1–11 from plan.md *Ming verification after merge*; ship with T-019.8; rollback `TUDO_AUTH_MODE: access`.
