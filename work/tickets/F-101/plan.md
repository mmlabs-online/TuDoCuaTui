Status: READY

# Plan — F-101: Polish the login screen

## Feature summary
`docs/feature-list.md` F-101:
> - Restyle `AuthGate` to the Figma Make design language.
> - Add a resend button with a 60 s cooldown, and clear errors for invalid email or rate limit.
> - **AC:** matches the app style in light and dark mode; works on a 390px viewport.

Ticket adds (scope): "Apply the saved theme before `AuthGate` renders: today the `dark` class is set by an
effect inside `App`, so the login screen is never dark." and AC "Resend is disabled for 60 seconds after each
send." No entry in `work/decisions.md` changes F-101. Out of scope: Google sign-in (F-102).

## Security summary (for Ming's plan approval)
**Changes in the auth flow**
- The form validates the email on the client (Vietnamese message) before calling Supabase. A failed check
  makes no network call.
- The raw `error.message` from Supabase is no longer shown. It is mapped to one of three Vietnamese messages
  (invalid email / rate limit / generic). Nothing is logged: no email, no error body.
- After a successful send, a "Gửi lại" (resend) button appears. It is disabled for 60 s and shows a countdown.
  Resend calls **the same** `signInWithOtp` call as the first send. The cooldown is UI-only (in memory). The
  server-side Supabase rate limit is still what actually protects the endpoint.
- `main.tsx` adds the `dark` class from `localStorage["tu-do-theme"]` before the first render. It reads one
  non-secret string and writes nothing.

**Does NOT change**
- `supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin +
  window.location.pathname } })`: same arguments. No `shouldCreateUser`, no `auth.resend()` (that API is for
  signup confirmation types, not magic-link OTP).
- Session handling: the `getSession()` + `onAuthStateChange` effect, the unsubscribe, the
  `if (!supabase || session) return children` gate and the `session === undefined → null` loading state stay
  exactly as they are.
- `src/lib/supabase.ts` (client options `persistSession`, `autoRefreshToken`, `detectSessionInUrl`): not touched.
- Local mode (R1): with no env vars, `supabase` is `null` and `AuthGate` renders its children directly, as now.
- No new dependency, no new env var, no change to RLS, storage or migrations.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Matches the app style in light and dark mode | Code reading: the screen uses only design tokens (`--bg`, `--surface`, `--border`, `--green`, `--soft`, `--muted`, `--danger`, `--brown`, `--shadow`) and existing classes (`.eyebrow`, `.btn`, `.btn-primary`, `.field`). No hard-coded colours. Optional visual check, if a browser is available: start the dev server with **dummy, non-secret** values (`$env:VITE_SUPABASE_URL="http://127.0.0.1:54321"; $env:VITE_SUPABASE_ANON_KEY="dummy"; npx pnpm@10.34.3 dev`). With no stored session, the login screen renders. Toggle `localStorage["tu-do-theme"]` between `"light"` and `"dark"` and reload. |
| 2 | Works on a 390px viewport | Code reading: the card is `w-full max-w-sm`, page padding ≥ 16px, the button is full width, there is no fixed width > 358px and nothing scrolls sideways. Optional: the same dev server with devtools at 390×844. |
| 3 | Resend is disabled for 60 s after each send | Run the check script (see Tests): `secondsLeft(t0, t0)` = 60, `secondsLeft(t0, t0+59_001)` = 1, `secondsLeft(t0, t0+60_000)` = 0, `secondsLeft(null, any)` = 0. Code reading: the button's `disabled` is `busy \|\| secondsLeft(sentAt, now) > 0`, and `sentAt` is set after **every** successful send (first send and each resend). |
| 4 | Clear Vietnamese error for invalid email | Script: `isValidEmail` cases, and `authErrorMessage({status:400, code:"email_address_invalid"})` → `COPY.errInvalidEmail`. Code reading: the form has `noValidate`, and a failed `isValidEmail` sets the error with no `signInWithOtp` call. Optional with the dummy dev server: type `abc`, submit, the Vietnamese message appears. |
| 5 | Clear Vietnamese error for rate limit | Script: `authErrorMessage({status:429})`, `({code:"over_email_send_rate_limit"})` and `({code:"over_request_rate_limit"})` → `COPY.errRateLimit`. |
| 6 | Other errors are not raw English | Script: `authErrorMessage({status:0, message:"Failed to fetch"})` and `({})` → `COPY.errGeneric`. Optional with the dummy dev server: submit a valid email. The fetch to 127.0.0.1 fails and the generic Vietnamese message shows. |
| 7 | Saved theme applied before AuthGate renders | Code reading: `main.tsx` calls `applySavedTheme()` before `createRoot(...).render`. Optional with the dummy dev server: set `tu-do-theme=dark`, reload, the login card is dark. |
| 8 | Auth call and session handling unchanged | `git diff main -- src/features/auth/AuthGate.tsx`: the `signInWithOtp` arguments and the session `useEffect` are identical. `src/lib/supabase.ts` is not in the diff. |
| 9 | Local mode unchanged (R1) | `npx pnpm@10.34.3 dev` with no env vars: the app opens directly on the wardrobe and there is no login screen. |
| 10 | Checks green | `npx tsc --noEmit` and `npx pnpm@10.34.3 build` pass. |

## Ming verification after merge
- A real magic link on a phone (hosted Supabase, production URL): the email arrives, the link signs in, and
  the session survives a reload. This proves the auth call is unchanged.
- Rate limit: press "Gửi lại" right after the countdown ends a few times, or send from two tabs, until Supabase
  answers 429. The rate-limit message shows in Vietnamese.
- Light and dark on the phone: choose dark in the app, sign out (or clear the session), and the login screen is
  dark. Check the layout at the phone's width.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/AuthGate.tsx` | Restyle the JSX. Add client email check, mapped errors, a "Gửi lại" button with countdown, and a `sentAt`/`now` state with a 1 s interval while the cooldown runs. Session effect and `signInWithOtp` call unchanged. | Scope items 1–3 |
| `src/features/auth/authMessages.ts` (new) | `COPY` (all Vietnamese strings of the login screen), `isValidEmail(s)`, `authErrorMessage(err)`. No imports. | Pure logic + R6 (copy in one place per feature) |
| `src/features/auth/cooldown.ts` (new) | `RESEND_COOLDOWN_MS = 60_000`, `secondsLeft(sentAt: number \| null, now: number): number`. No imports. | Pure, testable cooldown |
| `src/lib/theme.ts` (new) | `THEME_KEY = "tu-do-theme"`, `applySavedTheme()`: reads the key in `try/catch` and toggles `dark` on `document.documentElement`. | Scope item 4 |
| `src/main.tsx` | Call `applySavedTheme()` before `render`. | Scope item 4 |

Not touched: `src/App.tsx` (its theme effect keeps owning writes), `src/lib/supabase.ts`, `src/index.css`,
`index.html`, `vite.config.ts`, `AGENTS.md`, `.figma/` (R10). The ticket mentions `src/components/*`, but that
folder does not exist and the screen does not need it, so nothing is created there.

## Tests to write
No test runner on this branch (F-005 not merged). Chosen approach: see Assumptions A1. The implementer writes a
throwaway check script in the session scratchpad (not committed) and records its output in `impl-log.md`. The
reviewer re-runs it with `node --experimental-strip-types <script>` (Node 22.16; both modules are
import-free and use only erasable TS syntax: no `enum`, no `namespace`, no parameter properties).

| Test (file › name) | Covers |
|---|---|
| check script › `secondsLeft` returns 60 at send time | cooldown start |
| check script › `secondsLeft` returns 1 at +59 001 ms, 0 at +60 000 ms and +120 000 ms | rounding up, end, never negative |
| check script › `secondsLeft(null, now)` = 0 | before the first send |
| check script › `isValidEmail` accepts `a@b.co`, `  ming@mmlabs.online  ` (trimmed), `tên@miền.vn` | valid input, whitespace, Vietnamese diacritics (accepted; the server decides) |
| check script › `isValidEmail` rejects `""`, `"   "`, `abc`, `a@b`, `a b@c.d`, `@b.co` | empty and malformed input |
| check script › `authErrorMessage` 429 / `over_email_send_rate_limit` / `over_request_rate_limit` → `errRateLimit` | rate limit |
| check script › `authErrorMessage` `email_address_invalid` → `errInvalidEmail` | server-side invalid email |
| check script › `authErrorMessage` `{status:0}`, `{}`, `null`, unknown code → `errGeneric` | network error and fallback |

Follow-up for F-005: move these cases into `src/features/auth/*.test.ts` (Vitest, fake timers for the
countdown). The orchestrator adds this to the F-005 follow-ups.

## Approach
1. **`cooldown.ts`**: `secondsLeft = sentAt == null ? 0 : Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 1000))`.
2. **`authMessages.ts`**:
   - `COPY`: eyebrow, title, intro, email label, placeholder, send / sending / resend / "Gửi lại sau {n}s",
     sent text, and three errors. Proposed text:
     - `errInvalidEmail`: "Email chưa đúng định dạng. Kiểm tra lại giúp mình nhé."
     - `errRateLimit`: "Bạn gửi hơi nhanh. Đợi khoảng một phút rồi thử lại nhé."
     - `errGeneric`: "Chưa gửi được link đăng nhập. Kiểm tra kết nối rồi thử lại nhé."
   - `isValidEmail(s)`: trimmed, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. This is deliberately loose. The server is
     the final check.
   - `authErrorMessage(err: { status?: number; code?: string } | null | undefined)`: `status === 429` or
     code in {`over_email_send_rate_limit`, `over_request_rate_limit`} → rate limit; code
     `email_address_invalid` → invalid email; else generic. The structural type matches `AuthError` from
     `@supabase/auth-js` 2.119.0 (`status: number | undefined`, `code: ErrorCode | string | undefined`), so the
     module needs no Supabase import.
3. **`AuthGate.tsx`**:
   - Keep the session `useEffect` and the early returns byte-identical. Declare the new state (`sentAt`, `now`)
     and the countdown effect **above** the early returns (Rules of Hooks). The effect runs a 1 s
     `setInterval` only while `secondsLeft > 0` and clears it on cleanup.
   - `send()`: if `!isValidEmail(email)`, set the error and return. Otherwise run the unchanged
     `signInWithOtp` call. On error, `setError(authErrorMessage(error))`. On success, `setSent(true)`,
     `setSentAt(Date.now())`, `setNow(Date.now())`. The first submit and "Gửi lại" both use `send()`.
   - Layout: full-height page on `var(--bg)`, `p-4`, card `w-full max-w-sm` on `var(--surface)` with border,
     `rounded-3xl` and `var(--shadow)`. `.eyebrow` → h1 in Fraunces with `var(--brown)`, matching `.intro h1`
     at a smaller size via Tailwind utilities. Intro in `var(--muted)`. Email input inside a
     `<label className="field">` (gets the existing focus ring). Full-width `.btn .btn-primary`. Errors in
     `var(--danger)` with `role="alert"`. The sent state shows the email, then a `.btn` "Gửi lại" /
     "Gửi lại sau 42s" button, disabled during the cooldown or while busy.
   - `<form noValidate>`, so the browser's English validation bubble is replaced by our Vietnamese message.
     Keep `type="email"` and `autoComplete="email"` for the mobile keyboard.
4. **`theme.ts` + `main.tsx`**: `applySavedTheme()` runs once at module load, before `render`. `App`'s effect
   still reads and writes the key, so behaviour inside the app does not change. Like `App`, it defaults to
   light when the key is missing; system theme is not considered.
5. Run `npx tsc --noEmit`, `npx pnpm@10.34.3 build`, and `pnpm format` on the changed files. Run the check
   script and paste its output into `impl-log.md`.

Rules: **R1** local mode (step 3: the gate is unchanged, `supabase === null` → children). **R3** no new env and
no secret; the dummy values in the verification table are not secrets and are typed only in the reviewer's
shell. **R6** Vietnamese copy in `COPY`, English code. **R7** only the files above. **R8** checks green; unit
tests deferred to F-005 (A1). **R9** 390px and dark (AC 1, 2, 7). **R10** no Figma Make files.
Expected diff: about 150–200 lines.

## Specialist input used
None. No `consult-*.md` exists. The ticket's Areas include `security`, so the orchestrator may run
`security-ai-generated-code-auditor` on the diff. The "Security summary" above is what it should hold the
diff to.

## Assumptions
- **A1 (tests):** option (a). The logic lives in two import-free pure modules, checked with a throwaway
  `node --experimental-strip-types` script (output in `impl-log.md`, re-run by the reviewer) plus code reading.
  Vitest tests are a follow-up for F-005. R8 asks for unit tests only "once F-005 has landed", so this does not
  break R8.
- **A2:** The cooldown starts only after a **successful** send. It is in memory, so a reload resets it. That is
  acceptable because Supabase enforces its own per-email limit (by default about 60 s, returning 429
  `over_email_send_rate_limit`). A 429 shows the rate-limit message and does not start a cooldown.
- **A3:** The theme key `"tu-do-theme"` is now in two places (`App.tsx` and `src/lib/theme.ts`). `App.tsx` is
  left alone to avoid a hotspot edit. Follow-up: F-004.1 (constants) makes `App` import `THEME_KEY`.
- **A4:** The login screen gets no theme toggle. It shows the theme last chosen on this device, which is what
  the ticket asks. A first visit on a new device is light.
- **A5:** No "use a different email" link in the sent state. It is not in scope, so a reload is the way back.
  Listed as a follow-up candidate, not added (R7).
- **A6:** Hotspots: `src/main.tsx` and `src/App.tsx` are not edited by any other open ticket (every other ticket is
  `BACKLOG`; F-004.x will later edit `App.tsx` but not `main.tsx`). No rebase expected.
- **A7:** The newer Figma Make token block in `src/index.css` (the second `:root` / `.dark`, around lines
  1330–1355, with `--brown`) is the "design language". Using its tokens is enough; `index.css` itself is not
  changed.

## Blocking questions
None.

## Split proposal
None. Estimated 150–200 changed lines, within one cycle.
