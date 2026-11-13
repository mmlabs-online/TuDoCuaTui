## Attempt 1 — 2026-11-13
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, clean.
- format:check: "All matched files use the correct format." (181 files)
- test: 63 files passed, 6 skipped; 723 passed, 101 skipped. Auth slice alone: 6 files, 88 tests passed. `pnpm test:coverage` exit 0 (thresholds for `validation.ts` / `copy.ts` met).
- build: OK. `dist/` = `assets/ favicon.png index.html robots.txt`; no `auth-preview.html`; `grep -rl "Tạo tài khoản\|auth-preview" dist/` finds nothing.
- These match impl-log.md.

Browser check (reviewer, Playwright Chromium, 390×844, `vite` dev server, `/auth-preview.html`): 14 states × light/dark
(sign-in idle/submitting/email_unverified/turnstile_required/rate_limited; sign-up idle/submitting/email_taken/
weak_password/sent; verify verifying/verified/invalid/rate_limited), plus a sign-up empty submit. No element inside
`<main>` extends past 390px. Theme variables switch (card `#fffdf8` → `#1c2a24`, text `#1a1a1a` → `#fff8eb`). After the
empty submit, focus is on `#signup-email`. Tab order is email → password → confirm → submit → sign-in link. No console errors.
The dark-mode failure is in Issue 1.

### Acceptance criteria
- [x] Sign-in, sign-up and verify-email screens with every state: `SignInScreen.test.tsx` (it.each over 9 codes, resend, turnstile slot, notice), `SignUpScreen.test.tsx` (validation it.each, email_taken, error it.each, sent, resend), `VerifyEmailScreen.test.tsx` (all 4 states and the resend sub-states). No fetch: `boundary.test.ts` › "auth sources make no network or storage call" passes.
- [x] Running app unchanged (R1): `src/App.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts`, `src/index.css`, `src/components/*` and `package.json` are not in the diff. `boundary.test.ts` › "no app module imports features/auth" passes. `App.test.tsx` and `mode.test.ts` are green and unchanged. Nothing from auth is in `dist/`.
- [x] Copy in Vietnamese in one place: `copy.ts` `AUTH_COPY`; the `.tsx` files have no JSX text literals; `copy.test.ts` › "every AuthErrorCode has a message".
- [x] Component tests cover validation and each state (see above, plus `validation.test.ts` covering NFKC, code points, the token regex).
- [ ] Works at 390px and in dark mode (R9). FAILED, see Issue 1. 390px is OK. Accessible labels and focus order are OK (`getByLabelText`, `aria-invalid`/`aria-describedby`, focus on the first invalid field, DOM order test, one `h1`).
- [x] All checks pass.

Ming verification after merge (carry into the PR): open `/auth-preview.html` at 390px in light/dark; read the copy in
`copy.ts` (A11); optionally confirm production `password_min_length = 12` (A1).

### Issues
#### Issue 1 — 🔴 blocker — R9 dark mode: brand line and nav links are invisible
- **Where**: `src/features/auth/AuthLayout.tsx:18` (brand `<p>`, `color: var(--green)`) and `src/features/auth/AuthLayout.tsx:33` (`LinkButton`, `color: var(--green)`).
- **Expected**: Readable text in dark mode. These links are the only way to switch between sign-in and sign-up, and in the sign-up "sent" state (with no `onResend`) the only action at all.
- **Actual**: The effective theme block ("Editorial wardrobe restyle", `src/index.css:1343-1355`) sets `.dark { --green: #0b2f24 }`, a dark surface colour. On the dark card `--surface: #1c2a24` the measured colour is `rgb(11,47,36)` on `rgb(28,42,36)`, about 1.1:1 contrast. In the screenshots, "Tủ đồ của tôi", "Chưa có tài khoản? Tạo tài khoản", "Đã có tài khoản? Đăng nhập" and the sent-state "Đăng nhập" are practically invisible. The plan's `#`-colour boundary test cannot catch this.
- **Fix instruction**: Do not use `var(--green)` as a text colour in the auth UI. Use `var(--text)` for `LinkButton` (keep the underline) and `var(--muted)` (or `var(--text)`) for the brand line. Do not edit `src/index.css`. Re-check `/auth-preview.html` at 390px in dark mode (sign-in idle, sign-up idle, sign-up sent), and record the check in impl-log.md.

### Implementer deviations (judged)
- `LinkButton` exported from `AuthLayout.tsx`: acceptable. It avoids a file outside the plan and is used only by the screens.
- Plain DOM assertions + `afterEach(cleanup)`: acceptable. The repo has no jest-dom and the vitest config has no globals, so RTL does not clean up on its own.
- Boundary width check ignores `max-w-[…]`: acceptable. The plan names `w-[NNNpx]` / `min-w-[NNNpx]` only, and `max-w` cannot force overflow (confirmed in the browser).
- Field errors through `aria-describedby` with no `role="alert"`: acceptable and matches plan AC7 (`role="alert"` is for the error notice). Focus moves to the first invalid field, so the description is announced. Putting `alert` on every field would cause duplicate announcements.

### Rules R1–R10 (CLAUDE.md)
- R9: violation, Issue 1.
- R1: the app does not import auth; the preview is dev-only and not a build input; `main.tsx` also guards `import.meta.env.PROD`.
- R3: no secret, no `VITE_*`, no site key. The preview log records the password length only.
- R6: copy is in `copy.ts`.
- R7: `work/ming-todo.md` is in the diff but was changed by the orchestrator's plan-approval commits (7eec096, cb4883f), not by the implementation. Allowed.
- R8: tests and coverage thresholds are in place.
- R10: no Figma Make file touched.
- R2, R4, R5: not applicable.

### Nits (do not block)
- `src/features/auth/preview/AuthPreview.tsx:120`: the `<pre>` log does not wrap long error text, so the preview page scrolls sideways at 390px (scrollWidth 523–595 for email_unverified / weak_password). This is the harness only. Add `whitespace-pre-wrap` if you touch it anyway.
- The preview has no control for `notice="verified"`/`signed_out` or the resend sub-states (sending / sent / error), so Ming cannot view these in the harness. They are covered by tests.
- `SignUpScreen.tsx:27`: when `sentTo` is missing, the text becomes "…tới ." A fallback sentence would be cleaner. The wiring always passes it.

### Follow-ups (out of scope)
- Plan A15 items: password show/hide, `aria-describedby` in shared `Field.tsx`, Figma Make kit stories.
- A boundary/visual check for text-colour contrast against theme variables (e.g. forbid `var(--green)` as `color` in new UI), since `--green` is a background colour in the dark theme.

## Attempt 2 — 2026-11-13
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, clean.
- format:check: "All matched files use the correct format." (181 files), exit 0.
- test: 63 files passed, 6 skipped; 728 passed, 101 skipped. That is +5 tests since attempt 1, matching impl-log.md attempt 2. `pnpm test:coverage` exit 0.
- build: OK. `dist/` = `assets/ favicon.png index.html robots.txt`; `grep -rl "auth-preview\|Tạo tài khoản" dist/` finds nothing.

Browser check (reviewer, Playwright Chromium, 390×844, `vite` dev server, `/auth-preview.html`): the same 14 states as attempt 1,
in light and in dark. No element inside `<main>` extends past 390px, and document scrollWidth = 390 in every state (the preview
log now wraps). Lowest WCAG contrast of any leaf text against its painted background: light 5.28:1 (brand, `rgb(111,106,98)` on
`rgb(255,253,248)`), dark 5.24:1 (error text `rgb(226,124,115)` on `rgb(28,42,36)`). Dark brand is 7.69:1 and dark links are
`rgb(255,248,235)` on the card. Screenshots of dark sign-in idle and sign-up sent show the brand line, the "Tạo tài khoản" link
and the sent-state "Đăng nhập" link as clearly readable. No console errors.

### Attempt 1 issues
- Issue 1 (R9 dark-mode contrast): fixed. `AuthLayout.tsx:18` uses `var(--muted)` and `AuthLayout.tsx:34` uses `var(--text)`, with the underline kept. `src/index.css` is untouched.

### Security-review items applied (orchestrator-directed)
- S1: `copy.ts:94-97` falls back to `unknown` unless `code` is a string and an own key of `AUTH_COPY.errors`. `__proto__`, `constructor` and `bogus` now return the `unknown` copy (`copy.test.ts` › "unknown or prototype codes fall back to unknown copy"). Unknown `reasons` are filtered (`copy.ts:102-104`, test "filters unknown weak_password reasons"). Using `hasOwnProperty.call` instead of `Object.hasOwn` is fine (lib target). Correct.
- S3: `validation.test.ts` › "accepts 32 / 128 chars" passes. Correct.
- S4: `SignUpScreen.test.tsx` › "posts, never GET" passes. Correct.
- S2: doc comments only (`validation.ts:78-82`, `types.ts:65`); no behaviour change. Correct.
- All are in planned files (`copy.ts`, `validation.ts`, `types.ts` and their tests), so no new files and no scope creep. The `whitespace-pre-wrap` on the preview log resolves the attempt-1 nit.

### Acceptance criteria
- [x] All screens and states: unchanged since attempt 1; tests green.
- [x] Running app unchanged (R1): the out-of-slice files are only `auth-preview.html`, `vitest.config.ts` (planned) and `work/ming-todo.md` (orchestrator). `boundary.test.ts` is green, and nothing from auth is in `dist/`.
- [x] Copy in Vietnamese in one place: `copy.ts`; `copy.test.ts` green.
- [x] Component tests cover validation and each state.
- [x] 390px and dark mode (R9): see the browser check above.
- [x] All checks pass.

Ming verification after merge (carry into the PR): open `/auth-preview.html` at 390px in light/dark; read the copy in
`copy.ts` (A11); optionally confirm production `password_min_length = 12` (A1); copy the S2 token rules into T-019.7's
acceptance criteria and decide on the optional "press to verify" state.

### Rules R1–R10
- R1, R3, R6, R7, R8, R9, R10: hold. R2, R4, R5: not applicable.

### Nits (do not block)
- `copy.ts:95`: the own-key guard still accepts the internal keys `weak_too_short` / `weak_too_common` as codes. They return strings, so nothing crashes. An explicit code list would be tighter.
- `copy.ts:102`: `error.reasons` that is not an array (e.g. a string from bad JSON) would throw on `.filter`. T-019.7's response parsing should normalise it, or add `Array.isArray`.
- `SignUpScreen.tsx:27`: carried over from attempt 1, the "tới ." text when `sentTo` is missing.

### Follow-ups (out of scope)
- From attempt 1: plan A15 items and a contrast lint for `var(--green)` used as a text colour.
- T-019.7: S2 token handling; reset or unmount the sign-up form after `sent` (S4 note); optionally extend the boundary scan to `vite.config.ts` / `public/_redirects` (S6).
