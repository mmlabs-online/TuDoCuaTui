## Attempt 1 — 2026-11-15
Verdict: PASS

Reviewed commit 38be449 on `claude/magical-cori-2ssw8l` (HEAD 68e8a8d only touches `work/ming-todo.md` and
`work/tickets/T-019/ticket.md`, not this ticket).

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0
- format:check: "All matched files use the correct format." (251 files), exit 0
- test: Test Files 95 passed | 9 skipped (104); Tests 1232 passed | 176 skipped (1408), exit 0. Matches impl-log.md.
- build: `vite build` ok, `AuthRoot` chunk 30.50 kB, exit 0

Browser (Playwright, Chromium, 390x844, light and dark), built `dist/` served by `node server/index.js` under `env -i`:
identity mode (`TUDO_AUTH_MODE=identity`, `MM_IDENTITY_ISSUER=https://api.mmlabs.online`) on :3941, access mode
(`TUDO_ACCESS_DISABLED=1`) on :3942. The Identity API (api.mmlabs.online) and the Turnstile script were mocked with route
interception. Local mode used route interception with `/healthz` returning 404. Script:
`/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/r12-e2e-b.cjs`, screenshots in
`/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/r12/`.
- Forgot flow: sign-in, then "Quên mật khẩu?", then the forgot screen with the Turnstile slot (correct site key). Two
  different emails each got a 202, and the `#root` innerText was byte-identical both times with neither email in the DOM.
  The body was exactly `{email, turnstile_token}` with `X-MM-App: tudocuatui` and `credentials: "include"`. Error cases:
  `turnstile_failed` gives the Vietnamese copy and keeps the form. `origin_not_allowed` gives the generic copy, with no
  server text. 429 gives "2 phút" (once the mock exposes `Retry-After`, as org-admin-api `app/core/cors.py:21` does).
  With no Turnstile token, `turnstile_required` shows and no request is sent.
- `/reset-password#token=<43>`: the URL becomes `/reset-password` with no fragment. The only fetch before any user
  action (`/healthz`) ran with the hash already gone. There were no Identity requests until "Đổi mật khẩu". A 5-char
  password is blocked on the client and focuses the field. The `weak_password` (too_common) copy shows and the retry
  reuses the token. Each POST body was exactly `{"token","new_password"}` with no query string, `credentials: "omit"`,
  no `X-MM-App` and no cookie. After a 204, "Tiếp tục" leads to sign-in at `/` with "Mật khẩu đã được đổi. Hãy đăng
  nhập bằng mật khẩu mới.". `token_invalid` shows the invalid copy with no form, then "Gửi link mới" opens the forgot
  screen with Turnstile at `/`. 429 shows "45 giây" and keeps the form. A malformed token goes to `invalid` with no
  request. The token never appeared in the DOM, URL, local/session storage or console in any state.
- Trailing slash: `/reset-password/#token=` gives the reset page, with the URL rewritten to `/reset-password`. On
  `/reset-password//` both sides agree it is not a token page: the server sends `strict-origin-when-cross-origin` and
  the client renders the sign-in gate. This follows the shared list.
- `curl -I`: `/reset-password` and `/reset-password/` send `Referrer-Policy: no-referrer` on both servers.
  `/reset-password//` and `/` send `strict-origin-when-cross-origin`.
- Access mode: the reset page works the same way (one POST, no `X-MM-App`). "Tiếp tục" leads to the plain app at `/`.
  An invalid link offers only "Tiếp tục". `/` does not load the `AuthRoot` chunk.
- Local mode: `/` and `/reset-password#token=…` render the demo app with no `AuthRoot` chunk and no Identity call. The
  hash is stripped (plan A3).
- 390px: `scrollWidth` 390 on every auth screen. Text contrast on every auth screen is at least 5.24:1 (light min 5.28,
  dark min 5.24). The local home screen showed false positives from my generic probe (chip scrollers, a gradient chip).
  The home screen is not changed by this ticket.

Parity test check: `server/tokenPages.parity.test.ts` imports the real `NO_REFERRER_PATHS`/`referrerPolicyFor`
(`server/static.js:61-67`) and the real `TOKEN_PAGES`/`tokenPageOf` (`src/shared/tokenPages.ts`). I ran the same
assertions against mutated copies. An extra server path fails the set-equality test. A missing path fails both tests.
A server without trailing-slash handling fails the fixture-table test. So the test does catch drift between server and
client.

### Acceptance criteria
- [x] Forgot-password request shows the same confirmation whatever the email. Evidence: `copy.ts:24` `forgot.sentBody`
  is a static string. `ForgotPasswordScreen.tsx:19-28` renders no email. `AuthGate.test.tsx` › "two different emails,
  both 202 -> identical sent screen text, the email is not echoed" passes. The browser F1 check above passes in light
  and dark.
- [x] `/reset-password` handles the token per `consumers.md`. Evidence: `boot.ts:15-18` with `main.tsx:14` before
  `detectRuntime` (`main.tsx:16`). `boot.test.ts` › "replaceState runs before the /healthz fetch (/reset-password)".
  `identityClient.ts:159` with `identityClient.test.ts` › "is the public call: omit credentials, no app header, body
  only". `ResetPasswordPage.test.tsx` › "no request on mount…" and › "the token never appears in the DOM and nothing is
  logged, in any state". `server/static.test.ts` and the curl output for `no-referrer`. The browser R1/R4/R6 checks
  above.
- [x] All states with Vietnamese copy, 390px and dark mode, local mode unchanged. Evidence: all strings are in
  `copy.ts` (grep shows no Vietnamese literals in the new `.tsx` files). `ResetPasswordScreen.test.tsx`,
  `ForgotPasswordScreen.test.tsx` and `SignInScreen.test.tsx` cover the states. The browser layout, contrast and local
  mode checks above. `boot.test.ts` › needsAuth truth table (local + reset link gives false).
- [x] All checks pass. Evidence: the four checks above.
- [x] (Plan AC5) There is one shared token-page list with a consistent trailing-slash rule. Evidence:
  `src/shared/tokenPages.test.ts` (path table, plus "no other file in src/ spells…"), the parity test and the mutation
  check above.
- [x] (Plan AC6) The page works in access and identity mode. Evidence: `AuthRoot.test.tsx` › three reset cases, and the
  browser access-mode checks above.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data-layer change, and the auth chunk still loads only through the dynamic import in api
mode (verified in the browser). R3: only the public endpoints and the public Turnstile site key are used. R6: the copy
is in `copy.ts`. R7: every changed file is in the plan's file list (plus `impl-log.md` and the ticket state). R8: there
are tests for the client, validation, boot, path list, screens, page, gate and root. R9: verified at 390px in light and
dark. R10: no Figma Make files were touched. R2, R4 and R5 do not apply.

### Nits (do not block)
- `src/features/auth/ResetPasswordScreen.tsx:8` imports `hasErrors` but never uses it. tsc passes because
  `noUnusedLocals` is off.
- impl-log.md says "Not committed (per orchestrator instruction)", but the work is in commit 38be449. The orchestrator
  committed it, so this is wording only.

### Follow-ups (out of scope)
- Add a hidden username field on the reset form for password managers (plan A8). Chrome logs "[DOM] Password forms
  should have (optionally hidden) username fields".
- The "one path list" test in `tokenPages.test.ts` only matches quoted `"/x"` or `'/x'` literals, not template strings
  (noted in impl-log).
- On `/reset-password//#token=…` (not a real link shape) the fragment stays in the address bar because neither side
  treats it as a token page. Fragments are never sent in Referer, so nothing leaks, but stripping `#token=` on any path
  could be considered later.
