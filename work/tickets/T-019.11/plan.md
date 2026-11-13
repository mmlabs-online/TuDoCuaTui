Status: READY

# Plan: T-019.11, Auth screens UI: sign-in, sign-up, verify email (not wired)

Gate: `plan-approval` (High tier, path `src/features/auth/**`). The orchestrator stops after this plan until Ming
writes "Plan approved".

## Feature summary
This ticket is not in `docs/feature-list.md`. It is a slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`).

- Ticket goal: "Build the TuDo sign-in, sign-up and email-verification screens now, as presentational UI with no calls
  to the Identity API, so that T-019.7 only has to wire them once org-admin-api is ready."
- `work/decisions.md` D35 (amends T-019 plan A8): "TuDo has its own sign-up (with Turnstile) and `/verify-email` page,
  because org-admin-api USR-04c requires sign-up from a registered app origin and sends the verification link back to
  that origin. Screens are built first without the API (T-019.11) and wired later (T-019.7)."
- D31: "Local mode unchanged (R1)."
- Umbrella plan, target design: "the Figma Make preview never loads the auth module", and "R6: copy in
  `src/features/auth/copy.ts`; R9: 390px + dark".
- T-019.7 AC: "Reuses the T-019.11 screens". That ticket owns the network, the tokens, routing and the AuthGate.

The rules below are copied from org-admin-api. Nothing is invented here.

| Rule | Source in org-admin-api | What the client does |
|---|---|---|
| Password minimum 12 characters, counted after NFKC normalisation with no trimming | `app/core/config.py` `password_min_length = 12` (setting, `ge=8`); `app/modules/auth/passwords.py` `normalize_password` = NFKC, "no trimming"; `PasswordPolicy.check` returns `too_short` | Sign-up: count `[...pw.normalize("NFKC")]`. Code points, like Python `len` |
| Password maximum 128 | `app/modules/auth/schemas.py` `PASSWORD_MAX_LENGTH = 128` on both signup and login | Sign-up and sign-in: raw code points > 128 means too long |
| Common-password list | `passwords.py` `too_common` (a bundled SecLists file) | Checked by the server only. The client shows `weak_password` with `details.reasons` |
| Email | `EmailStr`; `normalize_email` = `strip().lower()` | A practical format check on the trimmed value. The server has the final say |
| Login turnstile after 3 failures, block from 5 failures (1 to 15 min) | `throttle.py` `TURNSTILE_AFTER = 3`, `backoff_minutes`; `service.py` raises `RateLimitedError(retry_after)` | Sign-in shows the Turnstile slot when `turnstile_required` / `turnstile_failed` |
| Sign-up needs a Turnstile token | `SignupRequest.turnstile_token` min_length 1 | Sign-up submit is enabled only when `turnstileReady` |
| Error codes | `auth/errors.py`: `email_taken` (409), `weak_password` (422), `turnstile_failed` / `turnstile_required` (403), `invalid_credentials` (401), `token_invalid` (422), `email_already_verified` (409); `core/errors.py` `rate_limited` (429, `details.retry_after` + `Retry-After`); `consumers.md`: `session_invalid`, `not_member`, `email_unverified` | One union type `AuthErrorCode` (A5) |
| Verify link | `consumers.md` "Link format": `{origin}/verify-email#token=<43 chars>`; `schemas.py` `EMAIL_TOKEN_RE = ^[A-Za-z0-9_-]{32,128}$`; "422 `token_invalid` … expired (24 h) …: offer resend" | Pure `parseVerifyToken(hash)`. The screen has an "invalid" state with resend |
| Resend | `consumers.md` "Resend (cookie class)": body `{account_id}`; 202 / 401 `session_invalid` / 409 `email_already_verified` / 429 "1 per minute and 5 per day … show `Retry-After`" | Resend shows only when the wiring passes `onResend` (A6) |

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "Sign-in, sign-up and verify-email screens with every state above" | `SignInScreen.test.tsx`, `SignUpScreen.test.tsx` and `VerifyEmailScreen.test.tsx` render each state and each error code listed in *Tests to write*, and assert the matching `AUTH_COPY` text. |
| 2 | "no `fetch` / Identity call anywhere in the slice" | `src/features/auth/boundary.test.ts` › "auth sources make no network or storage call". It scans every non-test file under `src/features/auth/` for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `document.cookie`, `api.mmlabs`, `console.`. Reviewer also runs `git diff main --stat`: only files from the list below. |
| 3 | "The running app is unchanged: local mode, API mode and the Figma Make preview show no auth screen (R1)" | `boundary.test.ts` › "no app module imports features/auth" (scans `src/**` outside `src/features/auth/`, plus `index.html`, for `features/auth` / `auth-preview`). `src/App.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts` are not in the diff. `App.test.tsx` and `mode.test.ts` stay green unchanged. After `pnpm build`: `grep -rl "Tạo tài khoản" dist/` finds nothing, and `ls dist/` has no `auth-preview.html`. |
| 4 | "Copy in Vietnamese in one place" | All user-visible strings come from `src/features/auth/copy.ts` (`AUTH_COPY`). `copy.test.ts` › "every AuthErrorCode has a message" (exhaustive through `Record<AuthErrorCode, …>`). Reviewer greps the `.tsx` files for JSX text literals and finds none outside `copy.ts`. |
| 5 | "component tests cover validation and each state" | See *Tests to write*: `validation.test.ts`, `copy.test.ts`, the three screen tests. |
| 6 | "Works at 390px and in dark mode (R9)" | Layout uses `w-full max-w-[400px]` plus padding, and has no fixed width over 390px. Colours come only from the CSS variables in `src/index.css` (`var(--surface)`, `var(--text)`, …), which `.dark` already switches. Test `boundary.test.ts` › "auth UI uses theme variables, no fixed wide widths": no hex colours or `w-[NNNpx]` > 390 in `src/features/auth/*.tsx`. Ming checks the result visually (see below). |
| 7 | "accessible labels and focus order" | Screen tests: `getByLabelText` for every input; `aria-invalid` + `aria-describedby` on fields with errors; error notice `role="alert"`, info notice `role="status"`; after a failed submit, focus is on the first invalid field; DOM/tab order is email → password → (confirm) → Turnstile slot → submit → secondary link; one `h1` per screen. |
| 8 | "All checks pass" | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
- Open `http://localhost:<port>/auth-preview.html` with `pnpm dev`, on a phone on the LAN or in a devtools 390px
  viewport. Use the harness's theme toggle to check every state in light and dark mode. This covers the ticket's manual
  test plan "390px light/dark in the preview harness".
- Read through the Vietnamese copy in `src/features/auth/copy.ts` (A11).
- Optional: confirm that production org-admin-api still uses `password_min_length = 12` (A1).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/types.ts` | new: `AuthErrorCode`, `AuthError`, `SubmitStatus`, `VerifyState`, `ResendState`, the props types for the three screens (contract below) | Contract that T-019.7 wires |
| `src/features/auth/copy.ts` | new: `AUTH_COPY` (all Vietnamese strings, including preview-harness labels), `formatWait(seconds)`, `authErrorMessage(error)` | R6, AC4 |
| `src/features/auth/validation.ts` | new, pure: `PASSWORD_MIN`, `PASSWORD_MAX`, `EMAIL_MAX`, `emailError`, `passwordError` (sign-up policy), `signInPasswordError`, `confirmError`, `validateSignIn`, `validateSignUp`, `parseVerifyToken` | Mirrors org-admin-api rules; R8 |
| `src/features/auth/AuthLayout.tsx` | new: centred card (brand line, `h1`, children, footer link slot), `min-h-screen` on `var(--bg)`, `w-full max-w-[400px]` | Shared shell, R9 |
| `src/features/auth/AuthField.tsx` | new: label + input with explicit `id`/`htmlFor`, `aria-invalid`, `aria-describedby`, error text. Reuses the `.field` CSS class | The existing `Field` wraps the error inside `<label>`, so the error text becomes part of the accessible name, and it has no `aria-describedby`. `src/components/Field.tsx` stays as it is (R7) |
| `src/features/auth/AuthNotice.tsx` | new: error (`role="alert"`) or info (`role="status"`) box; optional action button (resend / go to sign-in) | Shared error/notice area |
| `src/features/auth/SignInScreen.tsx` | new | Scope |
| `src/features/auth/SignUpScreen.tsx` | new (form state + "sent" state) | Scope |
| `src/features/auth/VerifyEmailScreen.tsx` | new | Scope |
| `src/features/auth/preview/AuthPreview.tsx` | new, dev only: state picker (screen × state × error code), light/dark toggle (toggles `html.dark` only, never storage), 390px frame toggle, a dashed "Turnstile" placeholder, and a callback log that records email and password length only, never the password | Preview without the API (A4) |
| `src/features/auth/preview/main.tsx` | new, dev only: imports `@/index.css`, calls `applySavedTheme()`, renders `AuthPreview` into `#root`. Renders nothing if `import.meta.env.PROD` | A4 |
| `auth-preview.html` | new at the repo root: minimal HTML shell (`lang="vi"`, viewport meta, `#root`, `<script type="module" src="/src/features/auth/preview/main.tsx">`). Not an input of `vite build`, so it never reaches `dist/` | A4 |
| `src/features/auth/validation.test.ts` | new | R8 |
| `src/features/auth/copy.test.ts` | new | R8, AC4 |
| `src/features/auth/SignInScreen.test.tsx` | new | AC1, AC5, AC7 |
| `src/features/auth/SignUpScreen.test.tsx` | new | AC1, AC5, AC7 |
| `src/features/auth/VerifyEmailScreen.test.tsx` | new | AC1, AC5, AC7 |
| `src/features/auth/boundary.test.ts` | new (`@vitest-environment node`, same pattern as `src/shared/ai/boundary.test.ts`) | AC2, AC3, AC6 |
| `vitest.config.ts` | add `src/features/auth/validation.ts` and `src/features/auth/copy.ts` to `coverage.include` and `thresholds`, the same way as `src/features/items/validate.ts` | R8, existing coverage pattern |

Not touched: `src/App.tsx`, `src/main.tsx`, `index.html`, `src/index.css`, `src/components/*`, `vite.config.ts` (R10),
`.figma/`, `server/**`, `package.json` (no new dependency).

### Props / callback contract (`types.ts`)
```ts
export type AuthErrorCode =
  | "invalid_credentials" | "email_unverified" | "not_member" | "session_invalid"
  | "turnstile_required" | "turnstile_failed" | "rate_limited" | "network"
  | "email_taken" | "weak_password" | "validation_error"
  | "token_invalid" | "email_already_verified" | "unknown";

export type AuthError = {
  code: AuthErrorCode;
  retryAfterSeconds?: number;                    // rate_limited (Retry-After / details.retry_after)
  reasons?: ("too_short" | "too_common")[];      // weak_password (details.reasons)
};

export type Credentials = { email: string; password: string }; // email trimmed; password exactly as typed
export type SubmitStatus = "idle" | "submitting";
export type ResendState = { status: "idle" | "sending" | "sent"; error?: AuthError | null };

export type SignInScreenProps = {
  status: SubmitStatus;
  error?: AuthError | null;
  notice?: "verified" | "signed_out" | null;     // info banner (e.g. after /verify-email)
  initialEmail?: string;
  onSignIn: (values: Credentials) => void;
  onGoSignUp: () => void;
  onResend?: () => void;                         // offered with email_unverified only when provided (A6)
  resend?: ResendState;
  turnstileSlot?: React.ReactNode;               // rendered only for turnstile_required / turnstile_failed (A7)
};

export type SignUpScreenProps = {
  status: SubmitStatus | "sent";
  sentTo?: string;                               // email shown in the "check your email" state
  error?: AuthError | null;
  onSignUp: (values: Credentials) => void;       // confirm is never passed out
  onGoSignIn: () => void;
  turnstileSlot?: React.ReactNode;               // always rendered above submit
  turnstileReady?: boolean;                      // default true; false disables submit
  onResend?: () => void;                         // optional, in the "sent" state (A6)
  resend?: ResendState;
};

export type VerifyState = "verifying" | "verified" | "invalid" | "rate_limited";
export type VerifyEmailScreenProps = {
  state: VerifyState;
  retryAfterSeconds?: number;
  onContinue: () => void;                        // "verified" → sign-in / app (T-019.7 decides)
  onGoSignIn: () => void;
  onResend?: () => void;                         // "invalid": shown only when provided, else "sign in to resend"
  resend?: ResendState;
};
```
Each screen keeps its own field values (`useState`). T-019.7 controls only `status`, `error`, `notice` and `resend`.
Callbacks are not called again while `status === "submitting"`. Mapping HTTP responses to `AuthError` is T-019.7
(`errors.ts` in the umbrella plan). App-config problems such as `app_header_required` and `origin_not_allowed` map to
`unknown`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `validation.test.ts` › emailError: empty → `required`; `"  an@vi.vn  "` valid (trimmed); `"an.vi.vn"`, `"an@vi"`, `"a n@vi.vn"`, `"a@@vi.vn"`, `"an@.vn"` → `invalid`; local part 65 chars → `invalid`; total > 254 → `invalid`; `"người.dùng@ví-dụ.vn"` valid (Unicode / IDN not rejected) | email mirror (A3) |
| `validation.test.ts` › passwordError (sign-up): empty → `required`; 11 chars → `tooShort`; 12 → ok; leading/trailing spaces counted, not trimmed; 6 × `"é"` (12 code points, NFKC → 6) → `tooShort`; decomposed Vietnamese `"mật khẩu12"` measured after NFKC; 12 full-width characters `"ｍａｔｋｈａｕ１２３４５６"` → ok; 129 code points → `tooLong`; 128 emoji (256 UTF-16 units) → ok | NFKC, code points, 128 max |
| `validation.test.ts` › signInPasswordError: empty → `required`; 3 chars → ok (no policy at sign-in); 129 → `tooLong` | login mirror |
| `validation.test.ts` › confirmError: mismatch → `mismatch`; composed `"Mật khẩu…"` vs its NFD form → ok (server hashes NFKC) | confirm |
| `validation.test.ts` › validateSignIn / validateSignUp return field maps; `hasErrors` | form validation |
| `validation.test.ts` › parseVerifyToken: `"#token=" + 43 × [A-Za-z0-9_-]` → token; `""`, `"#"`, `"#token="`, 31 chars, 129 chars, `"+"` or `"="` in token, `"#token=…&x=1"`, `"?token=…"` → `null` | `EMAIL_TOKEN_RE` mirror |
| `copy.test.ts` › formatWait: 1 → "1 giây", 59 → "59 giây", 60 → "1 phút", 61 → "2 phút", 900 → "15 phút", 3600 → "1 giờ", 3601 → "2 giờ", 0 / negative / NaN → "ít phút" fallback | rate-limit text |
| `copy.test.ts` › authErrorMessage: non-empty for every `AuthErrorCode`; `rate_limited` with and without `retryAfterSeconds`; `weak_password` with `too_short`, `too_common`, both, none | AC4 |
| `SignInScreen.test.tsx` › empty submit shows email + password errors, focuses email, does not call `onSignIn` | validation, focus |
| `SignInScreen.test.tsx` › valid submit calls `onSignIn({ email: trimmed, password: unchanged incl. spaces })` once | contract |
| `SignInScreen.test.tsx` › `status="submitting"` disables the submit button, shows the busy label, and a second click does not call again | state |
| `SignInScreen.test.tsx` › `test.each` over `invalid_credentials`, `email_unverified`, `not_member`, `session_invalid`, `turnstile_required`, `turnstile_failed`, `rate_limited` (120 s → "2 phút"), `network`, `unknown` renders `authErrorMessage` in `role="alert"` | every state |
| `SignInScreen.test.tsx` › `email_unverified` shows the resend button only when `onResend` is given; click calls it; `resend.status="sent"` shows the sent notice | resend |
| `SignInScreen.test.tsx` › `turnstileSlot` renders only with `turnstile_required` / `turnstile_failed` | A7 |
| `SignInScreen.test.tsx` › `notice="verified"` shows `role="status"`; sign-up link calls `onGoSignUp` | notices, nav |
| `SignInScreen.test.tsx` › form has `method="post"`, `noValidate`; email `type="email"` `autocomplete="email"`; password `type="password"` `autocomplete="current-password"`; tab order email → password → submit → sign-up link | a11y, defence (A10) |
| `SignUpScreen.test.tsx` › bad email / 11-char password / mismatch confirm each show the field error, focus the first invalid field, and do not call `onSignUp` | validation |
| `SignUpScreen.test.tsx` › valid submit calls `onSignUp({ email, password })` without the confirm value | contract |
| `SignUpScreen.test.tsx` › `turnstileReady={false}` disables submit; slot content is rendered before submit | Turnstile slot |
| `SignUpScreen.test.tsx` › `email_taken` shows the message with a sign-in action calling `onGoSignIn`; `weak_password` with `too_common`; `turnstile_failed`; `rate_limited`; `network`; `validation_error` | error states |
| `SignUpScreen.test.tsx` › `status="sent"` shows the "check your email" heading, `sentTo`, the 24 h note and a sign-in link, and no form; resend button only with `onResend` | success state |
| `SignUpScreen.test.tsx` › password inputs use `autocomplete="new-password"` | a11y / password managers |
| `VerifyEmailScreen.test.tsx` › `verifying`: `role="status"` + `aria-busy="true"`, no buttons | state |
| `VerifyEmailScreen.test.tsx` › `verified`: success copy, "continue" calls `onContinue` | state |
| `VerifyEmailScreen.test.tsx` › `invalid`: token_invalid copy; with `onResend` → resend button (sending disables it, sent shows notice, `rate_limited` / `session_invalid` / `email_already_verified` resend errors show their copy); without → sign-in button calls `onGoSignIn` | state, A6 |
| `VerifyEmailScreen.test.tsx` › `rate_limited` with `retryAfterSeconds=45` shows "45 giây" | state |
| `boundary.test.ts` › auth sources make no network or storage call (list in AC2) | AC2 |
| `boundary.test.ts` › no file in `src/` outside `src/features/auth/`, and not `index.html`, references `features/auth` or `auth-preview` | AC3, R1 |
| `boundary.test.ts` › auth UI uses theme variables: no `#[0-9a-f]{3,8}` colour and no `w-[NNNpx]` / `min-w-[NNNpx]` with NNN > 390 in `src/features/auth/**/*.tsx` | AC6, R9 |

## Approach
1. **Contract and copy first.** Write `types.ts` and `copy.ts`. Draft Vietnamese copy defaults (A11):
   - Headings: "Đăng nhập", "Tạo tài khoản", "Kiểm tra email của bạn", "Xác minh email".
   - Error codes:
     - `invalid_credentials`: "Email hoặc mật khẩu không đúng."
     - `email_unverified`: "Email của bạn chưa được xác minh. Mở link trong email chúng tôi đã gửi."
     - `not_member`: "Tài khoản này chưa có quyền dùng Tủ đồ của tôi."
     - `session_invalid`: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
     - `turnstile_required`: "Vui lòng hoàn tất bước xác minh bên dưới rồi thử lại."
     - `turnstile_failed`: "Xác minh không thành công, vui lòng thử lại."
     - `rate_limited`: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau {formatWait}."
     - `network`: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
     - `email_taken`: "Email này đã có tài khoản."
     - `weak_password`: too_short "Mật khẩu cần ít nhất 12 ký tự." / too_common "Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác."
     - `validation_error`: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại."
     - `token_invalid`: "Link xác minh không hợp lệ hoặc đã hết hạn (link có hiệu lực 24 giờ)."
     - `email_already_verified`: "Email đã được xác minh. Bạn có thể đăng nhập."
     - `unknown`: "Đã có lỗi xảy ra. Vui lòng thử lại sau."

   Field-level messages (`required`, `invalid`, `tooShort`, `tooLong`, `mismatch`) live in the same file.
2. **Pure validation** (`validation.ts`) with the rules in the table above. Each constant has a comment naming the
   org-admin-api file it mirrors. Write the tests next to it.
3. **Shared pieces.**
   - `AuthLayout`: Tailwind utilities with `var(--…)` colours only, so the existing `.dark` variables apply. `w-full
     max-w-[400px] mx-auto px-5`. No index.css edit.
   - `AuthField`: reuses `.field` styling.
   - `AuthNotice`.
   - Buttons use the existing `Btn` (`kind="primary"`).
4. **Screens.**
   - Forms use `noValidate`, `method="post"` and an `onSubmit` with `preventDefault`.
   - Validation runs on submit. A field's error clears when that field changes.
   - Focus goes to the first invalid field.
   - The Turnstile slot sits inside the form, before submit, in a `min-h-[65px]` box (the widget is 300 × 65, so it
     fits 390 − 2 × 20 px).
   - No password show/hide toggle (not in scope, A15).
5. **Preview harness** (`auth-preview.html` + `preview/`).
   - Dev only. Vite serves any root HTML file in `pnpm dev`, but `vite build` builds only `index.html`, so production
     and the Figma Make deploy never contain it. `main.tsx` also bails out when `import.meta.env.PROD` is true.
   - The callback log never prints the password (it prints the length only).
6. **Boundary and coverage.** Add `boundary.test.ts` and the coverage entries. Run the checks.

Rules:
- R1: no import from the app, and the auth code is not reachable from `index.html`.
- R3: no secret, no `VITE_*` variable, and no Turnstile site key: the slot is a placeholder, and loading the script
  is T-019.7.
- R6: Vietnamese copy in one file, English code.
- R7: `Field.tsx` is left alone; the follow-ups go to the list.
- R8: tests for the pure logic.
- R9: 390px and dark, through the theme variables.
- R10: `vite.config.ts` and `.figma/` are untouched.
- R2, R4 and R5 do not apply.

Size estimate: about 650 product lines (screens about 330, shared and copy and validation about 220, preview about
100) plus about 500 test lines. See *Split proposal*.

## Specialist input used
None. There is no `consult-*.md` for T-019.11. The org-admin-api sources are cited in *Feature summary*, and the
security-relevant choices (no storage, no logging of the password, `method="post"`, the token is never rendered) are
covered by `boundary.test.ts` and the screen tests.

## Assumptions
- **A1. Password minimum = 12.** This is the org-admin-api default (`password_min_length = 12`). It is a setting
  (`ge=8`), so production could differ. It lives in one constant, `PASSWORD_MIN`, and the server's `weak_password`
  `too_short` is still shown if the server is stricter. If the server is looser, users get a stricter client message;
  Ming can confirm (optional item above).
- **A2. "Too common" is checked by the server only.** The SecLists file is not shipped to the browser. The client shows
  the server's `weak_password` `too_common` reason.
- **A3. The email check is a practical subset of `email-validator`:** trimmed; ≤ 254 characters; one `@`; local part
  1–64 characters; domain with a dot and no empty label; no whitespace; Unicode allowed. The server is the authority:
  422 `validation_error` → `validation_error` copy.
- **A4. Preview = dev-only root page `/auth-preview.html`.** It is not imported by the app and is not a build input.
  The Figma Make preview (`/`), local mode and API mode are unchanged. Two alternatives were not chosen:
  - A `*.stories.tsx` file for the Figma Make kit plugin already in `vite.config.ts`. Its story format is not
    documented in this repo, so it could be a follow-up.
  - Tests only, with no visual preview.
- **A5. More error codes than the ticket lists.** `turnstile_failed`, `email_taken`, `weak_password`,
  `validation_error`, `token_invalid`, `email_already_verified` and `unknown` are added because org-admin-api returns
  them on these exact endpoints (`auth/errors.py`, `consumers.md`). `app_header_required`, `origin_not_allowed` and
  `audience_mismatch` are configuration bugs and map to `unknown`.
- **A6. Resend is optional in every screen.** `/verify-email/resend` is cookie class and needs `{account_id}`. After
  sign-up the user has no `account_id` (signup does not sign in), and a user opening the link on another device has no
  cookie either. So the resend button shows only when T-019.7 passes `onResend`. Otherwise the screen offers "Đăng
  nhập để gửi lại email". It is up to T-019.7 whether it signs in automatically after sign-up.
- **A7. Turnstile can show at sign-in.** org-admin-api requires it after 3 failed logins (`TURNSTILE_AFTER = 3`). The
  sign-in screen renders `turnstileSlot` only for `turnstile_required` / `turnstile_failed`. Loading the widget and
  owning the token is T-019.7, and this ticket adds no script and no site key.
- **A8. `not_member` shows a message only.** The "Tiếp tục với <email>" join action is T-019.10.
- **A9. `rate_limited` shows static wait text** from `retryAfterSeconds` (`formatWait`), with no live countdown and
  without disabling submit.
- **A10. Field values belong to the screen; status and error belong to the wiring.** Values are kept after an error.
  `method="post"` is a defence, so a password can never end up in a URL query.
- **A11. The copy in *Approach* is a draft.** Ming can change any string at plan approval or later in `copy.ts` alone.
- **A12. Routing, headers and fragment handling are not here.** Serving `/verify-email`, `Referrer-Policy:
  no-referrer`, `history.replaceState` and calling `parseVerifyToken(location.hash)` all belong to T-019.7 and
  T-019.8. This ticket provides only the pure parser and the screen.
- **A13. Hotspots.** `vitest.config.ts` (coverage lists) is also edited by later T-019 slices (for example T-019.9
  removes `server/access.js`); whichever merges second rebases. No open ticket touches `src/features/auth/`
  (T-019.7 is BACKLOG and builds on this one). `src/App.tsx` is not edited.
- **A14. Branding.** The card shows "Tủ đồ của tôi" from `AUTH_COPY` and reuses the theme variables. The fonts
  already load through `index.css`.
- **A15. Follow-ups, not in this diff:**
  - a password show/hide toggle;
  - `aria-describedby` support in the shared `src/components/Field.tsx`;
  - Figma Make kit stories for the auth screens.

## Blocking questions
None. Each open choice has a default above (A1 to A15).

## Split proposal
None. At about 650 product lines plus tests, this is over the ~400-line guide. It is still one review cycle, because
the code is presentational, uniform, has no I/O and has no hotspots. If the orchestrator or Ming wants it smaller, the
fallback split is:
- T-019.11: shared pieces, sign-in, sign-up, preview harness.
- T-019.12: `VerifyEmailScreen` + `parseVerifyToken` + its tests. T-019.7 would then depend on both.
