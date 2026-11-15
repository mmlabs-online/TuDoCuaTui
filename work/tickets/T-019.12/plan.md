Status: READY

# Plan: T-019.12, Forgot password and /reset-password page

Gate: `plan-approval` (High tier, path `src/features/auth/**`). The orchestrator stops after this plan until Ming
writes "Plan approved".

## Feature summary
This ticket is not in `docs/feature-list.md`. It is a slice of T-019 (D31, D35).

- Ticket goal: "A TuDo user who forgot their password can request a reset link and set a new password on TuDo's own
  `/reset-password` page."
- Ticket scope: "'Quên mật khẩu?' from the sign-in screen: email (+ Turnstile) → `POST /api/v1/auth/password/forgot`
  (always 202, same message)"; "`/reset-password`: parse and clear `#token` at once (`history.replaceState`),
  `Referrer-Policy: no-referrer`, new password (+ confirm) with the same rules as sign-up, submit only on button press
  (D36 pattern), `POST /api/v1/auth/password/reset`; states success (→ sign in), token invalid/expired (→ request a new
  link), weak password, rate-limited."
- D35: "TuDo has its own sign-up (with Turnstile) and `/verify-email` page …". D36: "clears `#token` from the URL at
  once, then … calls … only when the user presses it." D31: "Local mode unchanged (R1)."
- T-019.8 security review Y2: "server/client path sets differ … Follow-up: share one path list (also for T-019.12
  `/reset-password`)."

Upstream contract, quoted from `/home/user/org-admin-api/docs/consumers.md` "Password reset" (nothing invented):

| Item | consumers.md / org-admin-api source | Client |
|---|---|---|
| Forgot request | "`POST /api/v1/auth/password/forgot` `{email, turnstile_token}` **requires** `X-MM-App` and a browser `Origin` … Call it from the browser with `credentials: "include"` … A Turnstile token is always required." `schemas.py` `ForgotPasswordRequest`: `email: EmailStr`, `turnstile_token` 1–2048, `extra="forbid"` | Cookie class (`post(..., true)`): credentials include + `X-MM-App` |
| Forgot answers | "202 for every email, registered or not … the page must always say 'if an account exists for this address, we sent a link'". 403 `app_header_required` / `origin_not_allowed` "Bug"; 403 `turnstile_failed` "Re-run the Turnstile challenge"; 422 `validation_error`; 429 `rate_limited` "Per-IP limit; back off for `Retry-After`" | 202 → one fixed "sent" screen; bug codes → `unknown` (not in `SERVER_AUTH_ERROR_CODES`) |
| Link | "`{origin}/reset-password#token=<43 chars>` … works once and expires after **30 minutes**; a newer link replaces older ones" | Copy says 30 phút |
| Page steps | "1. reads `location.hash`, then removes it at once (`history.replaceState(null, "", "/reset-password")`); 2. is served with `Referrer-Policy: no-referrer`; 3. asks for the new password and calls … `body: JSON.stringify({ token, new_password })` (public endpoint: no cookie or `X-MM-App` needed; never send the token in a query string); 4. on 204 shows 'password changed, sign in with your new password'. Reset signs nobody in and sets no cookie." | `post(..., false)`: credentials omit, no `X-MM-App` |
| Reset token / password | `schemas.py` `ResetPasswordRequest`: `token` matches `EMAIL_TOKEN_RE = ^[A-Za-z0-9_-]{32,128}$`; `new_password` `max_length=PASSWORD_MAX_LENGTH` (128) | Same parser as verify; same password rules as sign-up |
| Reset answers | 204 "Done: send the user to sign in"; 422 `weak_password` "Show `details.reasons` (`too_short`, `too_common`); the link still works, let the user retry"; 422 `token_invalid` "unknown, expired (30 min), already used or replaced: offer 'forgot password' again"; 422 `validation_error` "Bug or truncated link"; 429 `rate_limited` | States below |
| Effects | "A reset ends **every signed-in session of the account** on every device (other accounts signed in on the same device stay); the next `/token` for it answers 401 `session_invalid`" | Success copy says the user is signed out everywhere; the gate already handles `session_invalid` |

All needed error codes (`turnstile_failed`, `rate_limited`, `weak_password` + reasons, `validation_error`,
`token_invalid`) already exist in `src/features/auth/types.ts` / `errors.ts`. No change to `errors.ts`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "Forgot-password request shows the same confirmation whatever the email (no account enumeration)." | `AuthGate.test.tsx` › "forgot: two different emails both 202 → identical sent screen text, no email echoed". `ForgotPasswordScreen.test.tsx` › "sent state has fixed copy, no form". Reviewer reads `copy.forgot.sentBody`: one static string, no interpolation. The client never branches on anything but the status code. |
| 2 | "`/reset-password` handles the token per `consumers.md` (cleared before any network call, POST body only, never logged or rendered)." | `boot.test.ts` › "takeTokenHash: /reset-password strips the hash with replaceState(null, '', '/reset-password')" and › "replaceState runs before the /healthz fetch (reset)". `identityClient.test.ts` › "resetPassword: POST /auth/password/reset, body {token,new_password}, credentials omit, no X-MM-App, no query string". `ResetPasswordPage.test.tsx` › "no request until the button is pressed" and › "the token never appears in the DOM" (`container.innerHTML` does not contain the token in any state) and › "no console call" (spies on `console.*`). `boundary.test.ts` (unchanged) still forbids `console.` anywhere in the slice and allows `history.` only in `AuthRoot.tsx`. `server/static.test.ts` (existing) proves `Referrer-Policy: no-referrer` on `/reset-password` and `/reset-password/`; new `server/tokenPages.parity.test.ts` proves the server list equals the client list. |
| 3 | "All states with Vietnamese copy; 390px and dark mode; local mode unchanged." | Screen tests render every state (see *Tests to write*) and assert `AUTH_COPY` text. All strings live in `src/features/auth/copy.ts` (grep: no Vietnamese literals in new `.tsx`). `boundary.test.ts` › "auth UI uses theme variables, no fixed wide widths" covers the new `.tsx` files automatically. Local mode: `boot.test.ts` › `needsAuth` truth table with a reset link in local mode → `false`; `App.test.tsx` / `mode.test.ts` unchanged and green; `boundary.test.ts` › "only src/main.tsx mentions features/auth, and only through a dynamic import()" stays green. Ming checks 390px light/dark in `/auth-preview.html` (below). |
| 4 | "All checks pass." | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |
| 5 | Y2 follow-up (orchestrator): one shared token-page path list; consistent trailing slash. | `src/shared/tokenPages.test.ts` › "no other file in src/ spells '/verify-email' or '/reset-password' as a page path" and `server/tokenPages.parity.test.ts` › "server NO_REFERRER_PATHS equals TOKEN_PAGES" + "referrerPolicyFor and tokenPageOf agree on a fixture table" (exact path and one trailing `/` match; `//`, look-alikes and other case do not). |
| 6 | `/reset-password` works in access and identity mode, like `/verify-email`. | `AuthRoot.test.tsx` › "reset hash + identity → reset page; success → replaceState('/') → sign-in with the password_reset notice", › "reset hash + access → reset page, then renderApp() with no props", › "reset token_invalid + identity → 'Gửi link mới' → forgot screen". `boot.test.ts` › `needsAuth` truth table (api + access + reset link → true). |

## Ming verification after merge
- `pnpm dev`, open `/auth-preview.html` in a 390px viewport (or a phone on the LAN): screens "Quên mật khẩu" (idle,
  submitting, sent, each error) and "Đặt lại mật khẩu" (ready, submitting, done, invalid, each error) in light and dark
  mode.
- Read the new Vietnamese strings in `src/features/auth/copy.ts` (`forgot`, `reset`, `signIn.forgot`,
  `signIn.passwordReset`, `fields.newPassword`).
- After the next release, in identity mode on `tudocuatui` production: sign-in → "Quên mật khẩu?" → email + Turnstile →
  mail arrives with a `https://<tudo origin>/reset-password#token=…` link → open it: the address bar shows
  `/reset-password` with no fragment; DevTools → Network: the document response has `Referrer-Policy: no-referrer`, no
  request is made until "Đổi mật khẩu" is pressed, and the POST goes to `/api/v1/auth/password/reset` with the token in
  the body only → sign in with the new password works; a second device signed in to the same account is signed out at
  its next token refresh. Opening the same link again shows the "link không hợp lệ" state.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/shared/tokenPages.ts` | new, pure, no DOM types: `TOKEN_PAGES = { verify: "/verify-email", reset: "/reset-password" } as const`, `type TokenPage`, `tokenPageOf(pathname): TokenPage \| null` (exact path or exactly one trailing `/`; case-sensitive) | Y2: one client list; mirrored by the server (parity test, D30 pattern) |
| `src/shared/tokenPages.test.ts` | new | AC5 |
| `server/static.js` | `export` the existing `NO_REFERRER_PATHS` (no behaviour change); comment pointing at `src/shared/tokenPages.ts` + parity test | Parity test needs it; the server image ships only `server/` (Dockerfile), so it cannot import from `src/` at runtime |
| `server/tokenPages.parity.test.ts` | new (`@vitest-environment node`), imports `../src/shared/tokenPages.ts` and `./static.js` | AC5 (same shape as `server/ai/parity.test.ts`) |
| `src/lib/boot.ts` | replace `VERIFY_PATH` / `takeVerifyHash` with `takeTokenHash(loc, hist): TokenLink \| null` (`{ page, hash }`), using `tokenPageOf` and `TOKEN_PAGES[page]` as the `replaceState` target; `needsAuth(rt, link)` takes the link | Reset hash taken exactly like the verify hash, before `/healthz` |
| `src/lib/boot.test.ts` | update to the new names; add reset and trailing-slash cases | AC2, AC5, AC6 |
| `src/main.tsx` | `const link = takeTokenHash();` (same place, before `detectRuntime`); `needsAuth(rt, link)`; pass `verifyHash={link?.page === "verify" ? link.hash : null}` and `resetHash={link?.page === "reset" ? link.hash : null}` to `AuthRoot`; dynamic import unchanged | Wiring; keeps the `boundary.test.ts` rule |
| `src/features/auth/identityClient.ts` | add `forgotPassword({ email, turnstileToken }): Promise<void>` → `post("/auth/password/forgot", { email, turnstile_token }, true)`; `resetPassword({ token, newPassword }): Promise<void>` → `post("/auth/password/reset", { token, new_password }, false)` | Contract above |
| `src/features/auth/identityClient.test.ts` | add tests for both calls | AC2 |
| `src/features/auth/types.ts` | `ForgotPasswordScreenProps`, `ResetState`, `ResetPasswordScreenProps` (below); `SignInScreenProps.notice` adds `"password_reset"`; `SignInScreenProps.onGoForgot?` | Screen contract |
| `src/features/auth/validation.ts` | `validateNewPassword({ password, confirm })` (reuses `passwordError` + `confirmError`, same as sign-up); `parseResetToken = parseVerifyToken` with a comment citing `ResetPasswordRequest.token` = `EMAIL_TOKEN_RE` | "same rules as sign-up"; R8 |
| `src/features/auth/validation.test.ts` | add `validateNewPassword` and `parseResetToken` cases | R8 |
| `src/features/auth/copy.ts` | add `signIn.forgot`, `signIn.passwordReset`, `forgot.*`, `reset.*`, `fields.newPassword`, `preview.forgot`, `preview.reset` (draft below) | R6 |
| `src/features/auth/ForgotPasswordScreen.tsx` | new, presentational (T-019.11 pattern) | Scope |
| `src/features/auth/ForgotPasswordScreen.test.tsx` | new | AC1, AC3 |
| `src/features/auth/ResetPasswordScreen.tsx` | new, presentational; the form is an inner component rendered only in `ready` / `submitting`, so `done` / `invalid` unmount it and drop the typed passwords | Scope |
| `src/features/auth/ResetPasswordScreen.test.tsx` | new | AC3 |
| `src/features/auth/ResetPasswordPage.tsx` | new, wiring like `VerifyEmailPage`: token in local state only, POST only on submit, token dropped after `done` / `invalid` | AC2 |
| `src/features/auth/ResetPasswordPage.test.tsx` | new | AC2 |
| `src/features/auth/SignInScreen.tsx` | render `LinkButton` "Quên mật khẩu?" after the submit button, before the sign-up link, only when `onGoForgot` is given; `notice="password_reset"` copy | Scope; existing tests (no `onGoForgot`) stay unchanged |
| `src/features/auth/SignInScreen.test.tsx` | add forgot-link and `password_reset` notice cases | AC3 |
| `src/features/auth/AuthGate.tsx` | `screen` gains `"forgot"`; `forgot(email)` handler (Turnstile always); `forgotSent` state; props `notice?: "verified" \| "password_reset" \| null`, `initialScreen?: "signIn" \| "forgot"`; `turnstile_failed` shown on forgot like sign-up | Scope |
| `src/features/auth/AuthGate.test.tsx` | add a `describe("forgot password")` block | AC1 |
| `src/features/auth/AuthRoot.tsx` | new optional prop `resetHash?: string \| null`; view `"reset"`; leaving the reset page does `history.replaceState(null, "", "/")` (the only `history.` call, as today) | AC6 |
| `src/features/auth/AuthRoot.test.tsx` | add reset cases (existing cases unchanged) | AC6 |
| `src/features/auth/preview/AuthPreview.tsx` | add screens `forgot` (idle, submitting, sent) and `reset` (ready, submitting, done, invalid); log prints password length only | Ming's 390px / dark check |

Not touched: `src/features/auth/errors.ts`, `VerifyEmailPage.tsx`, `TurnstileWidget.tsx`, `turnstile.ts`, `config.ts`,
`boundary.test.ts` (its rules already cover the new files; no allowlist change is needed), `src/App.tsx`,
`src/data/**`, `server/http.js` (CSP already allows `api.mmlabs.online` and Turnstile), `vite.config.ts` (R10),
`index.html`, `package.json`, `docs/**`.

### Contract (`types.ts`)
```ts
export type ForgotPasswordScreenProps = {
  status: SubmitStatus | "sent";
  error?: AuthError | null;
  initialEmail?: string;
  /** Trimmed email. */
  onSubmit: (email: string) => void;
  onGoSignIn: () => void;
  /** Always rendered above submit (Turnstile is always required). */
  turnstileSlot?: ReactNode;
  /** Default true; false disables submit. */
  turnstileReady?: boolean;
};

export type ResetState = "ready" | "submitting" | "done" | "invalid";
export type ResetPasswordScreenProps = {
  state: ResetState;
  /** "ready": weak_password (reasons), rate_limited, network, unknown. */
  error?: AuthError | null;
  /** Called only from the form submit (button press or Enter); the confirm value is never passed out. */
  onReset: (newPassword: string) => void;
  /** "done", and "invalid" when onRequestNew is absent. */
  onContinue: () => void;
  /** "invalid": "Gửi link mới" shown only when provided (identity mode). */
  onRequestNew?: () => void;
};
```

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/shared/tokenPages.test.ts` › `tokenPageOf`: `/verify-email` → verify, `/reset-password` → reset, each with one trailing `/` → same; `""`, `/`, `/reset-password//`, `/reset-passwordx`, `/reset-password/x`, `/RESET-PASSWORD` → null | AC5 |
| `src/shared/tokenPages.test.ts` › "no other file in src/ spells '/verify-email' or '/reset-password' as a page path": scan non-test files under `src/` for the quoted literals `"/verify-email"` and `"/reset-password"`; only `src/shared/tokenPages.ts` may contain them (API paths `"/auth/verify-email"` and `"/auth/password/reset"` do not match the quoted literal) | AC5 |
| `server/tokenPages.parity.test.ts` › "server NO_REFERRER_PATHS equals TOKEN_PAGES": `[...NO_REFERRER_PATHS].sort()` = `Object.values(TOKEN_PAGES).sort()` | AC5 |
| `server/tokenPages.parity.test.ts` › "referrerPolicyFor and tokenPageOf agree on a fixture table": for each path in the table above, `referrerPolicyFor(p) === "no-referrer"` iff `tokenPageOf(p) !== null` | AC5 |
| `boot.test.ts` › takeTokenHash: verify link → `{ page: "verify", hash }`, `replaceState(null, "", "/verify-email")`; reset link → `{ page: "reset", hash }`, `replaceState(null, "", "/reset-password")`; `/reset-password/` → replaced with `/reset-password`; other paths or empty hash → null, no `replaceState` | AC2, AC5 |
| `boot.test.ts` › "replaceState runs before the /healthz fetch" for the reset link | AC2 |
| `boot.test.ts` › needsAuth truth table with `TokenLink`: local + reset link → false; api + access + reset link → true; api + null auth + reset link → true; api + access + no link → false; api + identity → true | AC3, AC6 |
| `identityClient.test.ts` › forgotPassword: URL `${BASE}/auth/password/forgot`, method POST, `credentials: "include"`, header `X-MM-App: tudocuatui`, body exactly `{email, turnstile_token}`; 202 with an empty body resolves; 403 `turnstile_failed` → `{code:"turnstile_failed"}`; 403 `origin_not_allowed` → `unknown`; 429 with `Retry-After: 60` → `rate_limited`, 60 | AC1 |
| `identityClient.test.ts` › resetPassword: URL `${BASE}/auth/password/reset` with no `?`, `credentials: "omit"`, no `X-MM-App`, body exactly `{token, new_password}`; 204 resolves; 422 `weak_password` with reasons → reasons kept; 422 `token_invalid` → `token_invalid` | AC2 |
| `validation.test.ts` › validateNewPassword: empty → required/required; 11 chars → tooShort; 12 → ok; NFKC cases as sign-up; mismatch → mismatch; 129 → tooLong | "same rules as sign-up" |
| `validation.test.ts` › parseResetToken: 43-char `#token=` → token; malformed hashes → null (same table as verify) | AC2 |
| `ForgotPasswordScreen.test.tsx` › empty / bad email shows the field error, focuses email, no `onSubmit` | AC3 |
| `ForgotPasswordScreen.test.tsx` › valid submit calls `onSubmit(trimmed email)` once; `submitting` disables submit and a second click does nothing; `turnstileReady={false}` disables submit; the slot renders before submit | AC3 |
| `ForgotPasswordScreen.test.tsx` › `test.each` `turnstile_failed`, `validation_error`, `rate_limited` (120 → "2 phút"), `network`, `unknown` → `authErrorMessage` in `role="alert"` | AC3 |
| `ForgotPasswordScreen.test.tsx` › `sent`: heading `forgot.sentTitle`, body `forgot.sentBody` + `forgot.sentNote`, no form, sign-in link calls `onGoSignIn`; email input `type="email"` `autocomplete="email"`; form `method="post"` `noValidate` | AC1, AC3 |
| `ResetPasswordScreen.test.tsx` › ready: new password + confirm, both `type="password"` `autocomplete="new-password"`; 11-char / mismatch errors focus the first invalid field and do not call `onReset`; valid submit calls `onReset(password as typed)` once, without the confirm value | AC3 |
| `ResetPasswordScreen.test.tsx` › `submitting` disables the button with the busy label; `error` weak_password (too_common), `rate_limited` (45 → "45 giây"), `network`, `unknown` shown in `role="alert"` above the form | AC3 |
| `ResetPasswordScreen.test.tsx` › `done`: `reset.done` in `role="status"`, no password inputs, "Tiếp tục" calls `onContinue`; `invalid`: `reset.invalid`, with `onRequestNew` → "Gửi link mới" calls it, without → "Tiếp tục" calls `onContinue`; no password inputs | AC3 |
| `ResetPasswordPage.test.tsx` › a bad hash → `invalid` with no request | AC2 |
| `ResetPasswordPage.test.tsx` › no request on mount; submit → one `resetPassword({ token, newPassword })`; double submit while pending sends one | AC2 (D36 pattern) |
| `ResetPasswordPage.test.tsx` › 204 → done; `weak_password` → ready with reasons, a retry sends the same token again; `token_invalid` / `validation_error` → invalid; `rate_limited` / `network` / `unknown` → ready with the error | ticket states |
| `ResetPasswordPage.test.tsx` › "the token never appears in the DOM" (every state) and "no console call" (`vi.spyOn(console, …)` for log/info/warn/error/debug) | AC2 |
| `SignInScreen.test.tsx` › "Quên mật khẩu?" only with `onGoForgot`; click calls it; `notice="password_reset"` shows `signIn.passwordReset` in `role="status"` | AC3 |
| `AuthGate.test.tsx` › forgot: "Quên mật khẩu?" → forgot screen with the last sign-in email prefilled and the Turnstile slot | Scope |
| `AuthGate.test.tsx` › forgot: without a Turnstile token no request is made (`turnstile_required` copy) | Turnstile always |
| `AuthGate.test.tsx` › forgot: two different emails, both 202 → identical sent screen text, the email is not echoed; one request each with `turnstile_token`; the Turnstile token is spent (widget `reset`) | AC1 |
| `AuthGate.test.tsx` › forgot: 403 `turnstile_failed` → copy shown, widget reset, form kept; 429 → rate-limit copy; back to sign-in clears error and sent state | Upstream table |
| `AuthGate.test.tsx` › `initialScreen="forgot"` with no stored id → forgot screen; `notice="password_reset"` with no stored id → sign-in with the notice | AC6 |
| `AuthRoot.test.tsx` › reset hash + identity → reset page, no request until submit; 204 → "Tiếp tục" → `replaceState(null, "", "/")` → sign-in with `signIn.passwordReset`; exactly one fetch, to `…/auth/password/reset`, `credentials: "omit"` | AC2, AC6 |
| `AuthRoot.test.tsx` › reset hash + access → reset page, then `renderApp()` with no props | AC6 |
| `AuthRoot.test.tsx` › reset `token_invalid` + identity → "Gửi link mới" → forgot screen | ticket "→ request a new link" |

## Approach
1. **Shared path list (Y2).** Add `src/shared/tokenPages.ts`. Trailing-slash rule, the same on both sides: a page
   path matches exactly or with exactly one trailing `/`, case-sensitive (this is what `server/static.js`
   `referrerPolicyFor` already does). Export `NO_REFERRER_PATHS` from `server/static.js` without changing behaviour,
   and add the parity test. The server keeps its own copy because the runtime image has no `src/` (D30 pattern,
   `server/ai/parity.test.ts`).
2. **Boot.** `takeTokenHash` replaces `takeVerifyHash`: if `tokenPageOf(location.pathname)` is set and there is a hash,
   copy the hash, call `history.replaceState(null, "", TOKEN_PAGES[page])` (the canonical path, as consumers.md shows),
   and return `{ page, hash }`. It runs synchronously in `main.tsx` before `detectRuntime()` (the `/healthz` fetch), as
   today. `needsAuth` loads the auth chunk in api mode for identity auth or for any token link (access mode too). In
   local mode, the hash is stripped (as `/verify-email` already is) and the app renders as before; the auth chunk never
   loads.
3. **Client.** Add `forgotPassword` (cookie class: `credentials: "include"`, `X-MM-App`) and `resetPassword` (public:
   `credentials: "omit"`, no app header) to `identityClient.ts`, reusing `post()`. Error mapping is the existing
   `toAuthError` (bug codes → `unknown`, no server text echoed).
4. **Validation and copy.** `validateNewPassword` reuses `passwordError` and `confirmError` (same as sign-up: 12–128
   code points after NFKC, no trimming). `parseResetToken` reuses the verify parser (same `EMAIL_TOKEN_RE`). Draft
   copy (Ming may change any string):
   - `signIn.forgot`: "Quên mật khẩu?"
   - `signIn.passwordReset`: "Mật khẩu đã được đổi. Hãy đăng nhập bằng mật khẩu mới."
   - `forgot.title`: "Quên mật khẩu"; `forgot.intro`: "Nhập email của bạn. Chúng tôi sẽ gửi link để đặt lại mật
     khẩu."; `forgot.submit`: "Gửi link đặt lại mật khẩu"; `forgot.submitting`: "Đang gửi…"; `forgot.sentTitle`:
     "Kiểm tra email của bạn"; `forgot.sentBody`: "Nếu email này đã có tài khoản, chúng tôi đã gửi link đặt lại mật
     khẩu tới đó."; `forgot.sentNote`: "Link có hiệu lực 30 phút và chỉ dùng được một lần."; `forgot.toSignIn`: "Quay
     lại đăng nhập"
   - `reset.title`: "Đặt lại mật khẩu"; `reset.intro`: "Nhập mật khẩu mới cho tài khoản của bạn."; `reset.submit`: "Đổi
     mật khẩu"; `reset.submitting`: "Đang đổi mật khẩu…"; `reset.done`: "Mật khẩu đã được đổi. Tài khoản đã được đăng
     xuất trên mọi thiết bị, hãy đăng nhập lại bằng mật khẩu mới."; `reset.continue`: "Tiếp tục"; `reset.invalid`:
     "Link đặt lại mật khẩu không hợp lệ, đã được dùng hoặc đã hết hạn (link có hiệu lực 30 phút)."; `reset.requestNew`:
     "Gửi link mới"
   - `fields.newPassword`: "Mật khẩu mới" (confirm reuses `fields.confirm`); the password hint reuses
     `signUp.passwordHint`.
   - `preview.forgot`: "Quên mật khẩu"; `preview.reset`: "Đặt lại mật khẩu".
   `token_invalid` in `errors` stays verify-specific (24 h); the reset page shows `reset.invalid` instead.
5. **Screens** (T-019.11 pattern: `AuthLayout`, `AuthField`, `AuthNotice`, `Btn`, `LinkButton`; `var(--…)` colours
   only; `noValidate`, `method="post"`, validation on submit, focus on the first invalid field).
   - `ForgotPasswordScreen`: email, Turnstile slot (`min-h-[65px]`, always), submit, "Quay lại đăng nhập". `sent`
     shows one fixed message (no email echoed, so the text is identical for every address).
   - `ResetPasswordScreen`: `ready` / `submitting` render an inner `ResetForm` (new password with hint, confirm,
     submit); `done` and `invalid` render only notices and buttons, so the form and its password state unmount.
6. **`ResetPasswordPage`** (like `VerifyEmailPage`): `const [token, setToken] = useState(() => parseResetToken(hash))`;
   no token → `invalid` with no request. On submit (only from the form, D36 spirit: no request on mount): guard
   against a second call while `submitting`; `resetPassword({ token, newPassword })`. 204 → `done` and
   `setToken(null)`. `weak_password` → `ready` with the error (the link still works). `token_invalid` /
   `validation_error` → `invalid` and `setToken(null)`. Anything else (`rate_limited`, `network`, `unknown`) → `ready`
   with the error. Never logs, never renders the token.
7. **`AuthGate`.** Add `"forgot"` to `screen`. `goto("forgot")` clears the Turnstile token, error, sent state.
   `forgot(email)`: no Turnstile token → `turnstile_required` error, no request (as `signUp`). Otherwise `submitting`,
   call `client.forgotPassword`, then always `spendTurnstile()` (single-use); success → `forgotSent = true`; failure →
   error on the screen. The forgot screen gets `initialEmail={email}`, `turnstileSlot={slot}`,
   `turnstileReady={!tsFailed}`, and the `tsFailed` → `turnstile_failed` rule now covers `forgot` too. `SignInScreen`
   gets `onGoForgot={() => goto("forgot")}`. New props `initialScreen` (initial `screen` state) and the
   `"password_reset"` notice (shown on the initial signed-out view, like `"verified"`).
8. **`AuthRoot`.** View `"verify" | "reset" | "app"`; `resetHash` → `ResetPasswordPage`. Leaving it calls
   `history.replaceState(null, "", "/")`, then: identity mode → the gate with `notice="password_reset"` after
   success, or `initialScreen="forgot"` after "Gửi link mới"; access mode → `renderApp()` (no `onRequestNew`, because
   access mode has no sign-in or forgot screen). `verifyHash` handling is unchanged.
9. **Preview + checks.** Add the two screens to `AuthPreview.tsx`; run all checks.

Rules: R1 (no repo or data change; the auth chunk still loads only through the dynamic import in api mode; local mode
renders the same app), R3 (no secret; only the public endpoints and the existing public site key), R6 (copy in
`copy.ts`), R7 (only the files above; `errors.ts`, `VerifyEmailPage`, CSP untouched), R8 (tests for client,
validation, boot, path list and screens), R9 (theme variables, `max-w-[400px]` layout, Turnstile `size: "flexible"`
already), R10 (no Figma Make file). R2, R4, R5 do not apply.

Size estimate: about 430 product lines (screens ~190, AuthGate/AuthRoot/page ~120, client/boot/shared/validation ~60,
copy/types ~60) plus about 450 test lines. Slightly above the guide, but one feature, no migration, and the code
follows the existing T-019.7/T-019.11 pattern line for line.

## Specialist input used
None. There is no `consult-*.md` for T-019.12. Inputs used: `consumers.md` "Password reset" (quoted above);
org-admin-api `app/modules/auth/schemas.py` (`ForgotPasswordRequest`, `ResetPasswordRequest`, `EMAIL_TOKEN_RE`);
T-019.8 `security-review.md` Y2 (adopted: one list + parity test + one trailing-slash rule); T-019.7 plan R4
(adopted: synchronous hash taking before `/healthz`; page in access and identity mode).

## Assumptions
- **A1. One list, two copies.** `src/shared/tokenPages.ts` is the single client list; `server/static.js` keeps
  `NO_REFERRER_PATHS` because the Docker runtime image copies only `server/`, and a parity test pins them equal (D30
  pattern). Alternative not chosen: the client importing `server/static.js` (pulls `node:fs` into the browser build).
- **A2. Trailing slash.** The client now also accepts `/verify-email/` and `/reset-password/` (one slash) and rewrites
  to the canonical path, matching the server. Real links never have the slash; this only removes the Y2 mismatch.
- **A3. Local mode.** A token link opened in local mode (dev / Figma Make) has its fragment stripped, exactly as
  `/verify-email` already does; nothing else changes and no auth code loads.
- **A4. No email in the "sent" message.** The confirmation never echoes the address, so it is byte-identical for
  every email (AC1). The email field is prefilled from the last sign-in attempt, so typos stay visible before
  sending.
- **A5. After a successful reset, the gate starts as usual.** If this device holds another account's id, it restores
  that account silently (consumers.md: "other accounts signed in on the same device stay"). If it holds the reset
  account's id, restore gets 401 `session_invalid` and the existing sign-in error shows instead of the
  `password_reset` notice. Same for `initialScreen="forgot"`: it applies only when the device has no stored account.
- **A6. Access mode.** The reset page works (its POST is public), and the invalid state offers only "Tiếp tục",
  because access mode has no sign-in or forgot screen. T-019.9 removes access mode later.
- **A7. Enter key.** Pressing Enter in the password fields submits the form; that is a user action and satisfies the
  "submit only on button press" intent (no request on page load, so link scanners cannot spend the token; D36).
- **A8. No hidden username field** for password managers: the reset response carries no email. Follow-up if wanted.
- **A9. Hotspots.** `AuthGate.tsx`, `types.ts`, `copy.ts`, `AuthPreview.tsx` are also edited by T-019.10 (state
  DONE, PR not yet merged at planning time); whichever merges second rebases. `src/lib/boot.ts` / `src/main.tsx` are
  not touched by any open ticket. `server/static.js` gets only an `export`.
- **A10. No ADR / decision entry.** The shared path list is an implementation detail covered by tests; D35/D36 already
  cover the page model.

## Blocking questions
None.

## Split proposal
None. Fallback if Ming or the orchestrator wants it smaller: T-019.12a = shared path list, boot, `resetPassword`,
`/reset-password` page (the part org-admin-api USR-04b requires); T-019.12b = forgot screen and AuthGate wiring.
