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

## Attempt 2 — 2026-11-15
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean (exit 0).
- format:check: exit 0 (236 files).
- test: Test Files 88 passed | 8 skipped (96); Tests 1083 passed | 167 skipped (1250). Matches impl-log Attempt 2 exactly (+2 over attempt 1: "a hanging logout does not hold the gate", "a getToken from an old App generation resolves null…").
- build: ok; entry `index-CVKywT86.js` 264.84 kB, lazy `AuthRoot-D9Ev-EBC.js` 21.32 kB (matches impl-log).
- Playwright, attempt-1 script re-run on the new `dist/` (390x844, light and dark): every assertion PASS, no FAIL (sign-in, storage, reload restore, sign-out with blob revoke + logout POST + id cleared, 401 once/always, verify-email both modes, local/access without the auth chunk).
- Playwright, new rework script (Turnstile script stubbed, 390x844, light and dark), 28/28 PASS:
  - first login → 403 `turnstile_required` → widget + Turnstile copy; solve → second login carries `turnstile_token: "TS1"` → 401 `invalid_credentials` → alert "Email hoặc mật khẩu không đúng." (no Turnstile wording), widget still mounted, `reset()` called; scrollWidth 390; `dark` class follows the theme (screenshot checked: error + widget + button fit at 390 in dark).
  - next submit without a new token: no login request, Turnstile copy shown; new solve → login with `TS2` → app.
  - sign-out with a never-answering `/auth/logout`: "Bạn đã đăng xuất." after ~55–60 ms, logout request was sent with `account_id`, `mm_account_id` removed, app unmounted, email field empty; reload → sign-in form and **no** `/auth/token` call (session not restored).

### Acceptance criteria
- [x] 1, 3–9, 11–15, 17, 18 — unchanged from attempt 1; re-verified by the full test run and the attempt-1 Playwright script (all pass).
- [x] 2 Sign-out order — now "App unmounted → id cleared → logout (best effort, 5 s timeout) → signed-out notice": `AuthGate.test.tsx` › "order: App unmount -> id cleared -> logout…", "a hanging logout does not hold the gate", "logout failure still signs out"; `tokenStore.test.ts` › "clears the id, then calls logout with it…"; `identityClient.test.ts` logout carries an `AbortSignal`; Playwright hanging-logout + reload.
- [x] 10 Turnstile on sign-in — Issue 1 of attempt 1 fixed: `AuthGate.tsx` passes the server error unchanged and `turnstileRequired={needTurnstile}`; `SignInScreen.tsx` shows the slot while `turnstileRequired`; `AuthGate.test.tsx` › "the Turnstile token is single-use; a wrong password is reported as such and the widget stays" (asserts invalid_credentials copy, no 3rd login without a new token, 3rd login carries `ts2`); Playwright above.
- [x] 16 Stable getToken, remount per sign-in — now stable per App instance (`AuthGate.test.tsx` › "login -> token -> App rendered with a stable getToken" asserts one identity across re-renders of one instance); old generation's `getToken` → `null`, old `onAuthLost` is a no-op (new test). Plan AC16 / T-019.6 obligations ask for stability within an App instance, which still holds; the cross-generation identity assertion was stronger than required and is correctly dropped.

### Deviations judged
- AC2 order change (id cleared before `/logout`): accepted. Plan AC2's essential obligation is "App unmounts first (blob URLs revoked)", which still holds (flushSync to `checking` before `store.signOut()`, verified in the browser). Clearing the id first is strictly safer (security S1): a hung or failed logout can no longer leave a restorable `mm_account_id`. The id is captured in `gone` before clearing, so the logout body is unchanged.
- S1 (`tokenStore.ts` clear before await; `identityClient.ts` `AbortSignal.timeout(5000)` on logout only; gate goes to `signed_out` without awaiting): correct, in scope (files in the plan, fixing a defect in this diff).
- S2 (`appPropsFor(gen)` stored in the `ready` view): correct. Props are created once per `enterReady`, so they are stable for that App instance; `current()` compares against `generation.current`, which only advances on the next `enterReady`, so the new session cannot be read or ended from an old App. In scope.
- Clearing the pre-filled email on sign-out / `no_access` (security 🟢): two lines in `AuthGate.tsx`, in scope.
- `turnstileRequired` prop on `SignInScreen` / `types.ts`: minimal, optional, files in the plan; `AuthPreview` unaffected.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. Rework touches only `src/features/auth/**` files from the plan; no `VITE_*`, no storage change besides the earlier `mm_account_id` removal, no Vietnamese literals outside `copy.ts`; 390px light/dark re-checked; `vite.config.ts`, `AGENTS.md`, `.figma/` untouched.

### Nits (do not block)
- Because sign-out no longer waits for `/logout`, a user who signs in again within the 5 s logout window could receive the late logout response after the new login. If the Identity server's logout response clears the refresh cookie (`Set-Cookie`), the new session would fail at its next `/token` refresh and show sign-in again. Fails closed, needs a hung logout plus a fast re-login; worth one line in the M-21 checks.
- Attempt-1 nits still open (lazy chunk load failure → blank page; `VerifyEmailPage` resend `session_invalid` leaves the id; `tsFailed` sticky until a screen switch).

### Follow-ups (out of scope)
- Security 🟢 items not done: `authFetch` same-origin check via `new URL(...)` and `new Headers(init.headers)`; reload notice when the auth chunk fails to load.
- Ship with T-019.8 (CSP: `connect-src 'self' https://api.mmlabs.online`, Turnstile only in `script-src`/`frame-src`; `Referrer-Policy: no-referrer` on `/verify-email`).

### Ming verification after merge (carried to the PR)
- M-21 checks 1–11 from plan.md *Ming verification after merge*; plus: sign out, then sign in again at once, and confirm the session survives a reload (nit 1). Ship with T-019.8; rollback `TUDO_AUTH_MODE: access`.

### Orchestrator note (2026-11-15) — PASS overridden to REWORK
The security re-check (security-review.md, Attempt 2, 🟡 S2) found the window this review's S2 judgement relies on: `generation.current` advances only in the next `enterReady`, so between sign-out of A and `enterReady` for B an unmounted A App's pending step (authFetch retry, later steps of a save) calls the old `getToken`, joins B's in-flight `/token` and sends A's request with B's bearer — a cross-account write, the exact risk multi-user ownership (T-019) exists to prevent. The fix is a few lines in a planned file, so it goes back as rework attempt 3 (the last allowed) rather than a follow-up.
