Status: READY

# Plan — T-006: Replace magic-link login with email + password

Branch: `claude/loving-fermi-t90upb` (cloud session branch, from latest `main`). Gate: plan-approval (High tier:
`src/features/auth/**`). Implementation starts only after Ming writes "Plan approved" in ticket.md.

## Feature summary
No feature in `docs/feature-list.md` covers this. The ticket changes lines of the feature list that **stay
unedited** by this ticket (conflict flagged, see Assumptions A1):
> Backend | Supabase: Postgres + Auth (magic link) + Storage …  (stack table, line 20)
> - `AuthGate` provides magic-link login and a sign-out button.  (line 27)
> - Add a resend button with a 60 s cooldown, and clear errors for invalid email or rate limit.  (F-101, line 118)
> - Supabase OAuth with Google, shown next to the magic link.  (F-102, line 122)
> - **AC:** the prod URL works with magic-link login on a phone.  (F-007, line 107)

Scope authority: ticket "Notes / answers from Ming" — 2026-11-09: *"có và bỏ hẳn magic link" — email + password
with the stoktok account, magic link removed … No "forgot password" requested.*

`work/decisions.md`:
> D17 … Auth: Site URL stays stoktok's, sign-ups stay disabled, the TuDo origin is added to Redirect URLs.
> D18 … TuDo uses stoktok's Auth exactly as it is: no TuDo-specific sign-up setting or user setup … any stoktok
> account can sign in to TuDo, and RLS keeps each user's wardrobe separate.

## Security summary (for Ming's plan approval)
**Changes in the auth flow**
- `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` is replaced by
  `supabase.auth.signInWithPassword({ email: email.trim(), password })`. The password is sent as typed (not
  trimmed) over HTTPS to stoktok's Supabase Auth `/token?grant_type=password`. No other auth API is called.
- The password lives only in React state of the login form. It is never logged, never written to
  localStorage/sessionStorage, never put in a URL (the form keeps `noValidate` + `preventDefault`, no
  `action`/`method`), and never shown in an error. The form unmounts on sign-in, which drops it.
- Errors are still mapped to fixed Vietnamese strings; raw `error.message` is never shown. `invalid_credentials`
  is the same answer for "unknown email" and "wrong password", so no account enumeration. `email_not_confirmed`
  (would reveal that the email exists) maps to the generic message, not a specific one.
- The 60 s resend cooldown (UI-only, F-101) is removed. Brute-force protection is Supabase's server-side rate
  limit on the token endpoint (429 / `over_request_rate_limit` → Vietnamese rate-limit message). No client-side
  lockout is added (it would not be a real control).
- `emailRedirectTo` disappears, so TuDo login no longer depends on the Redirect URLs allowlist (F-101 security
  review open question 1 goes away for login). See A4 for the doc change this implies.
- `busy` is reset in `finally`, and an unexpected throw shows the generic message (adopts F-101 security review
  recommendation 2).

**Does NOT change**
- Session handling: the `getSession()` + `onAuthStateChange` effect, the unsubscribe, `if (!supabase || session)
  return children`, and `session === undefined → null` stay byte-identical. A successful `signInWithPassword`
  saves the session and fires `SIGNED_IN` (auth-js 2.119.0 `GoTrueClient.signInWithPassword`), which the existing
  listener picks up.
- Sign-out: `useWardrobe().signOut` → `supabase.auth.signOut()` in `src/data/useWardrobe.ts`, not touched.
- `src/lib/supabase.ts` (anon key only, `persistSession`, `autoRefreshToken`, `detectSessionInUrl: true`): not
  touched. `detectSessionInUrl` stays because F-102 (Google OAuth) will need it.
- Local mode (R1): no env → `supabase === null` → children rendered, no login screen.
- No new dependency, env var, migration, RLS, storage or Supabase Auth setting (D18). No sign-up and no password
  reset in TuDo.

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "The login screen has email + password fields and signs in with `signInWithPassword`; a valid stoktok account reaches the app." | `AuthGate.test.tsx` › "renders email and password fields when signed out" and › "submits trimmed email and the raw password to signInWithPassword" and › "renders children once a session arrives" (fake `onAuthStateChange` fires a session → children shown). Real stoktok account: Ming, after merge. |
| 2 | "No `signInWithOtp`, magic-link copy, resend button or cooldown remains in `src/`." | `rg -n -i "signInWithOtp\|emailRedirectTo\|cooldown\|secondsLeft\|RESEND\|Gửi lại\|link đăng nhập\|magic" src` returns nothing. `src/features/auth/cooldown.ts` no longer exists. `AuthGate.test.tsx` › "never shows a resend button" (after a successful submit no "Gửi lại" text). |
| 3 | "Wrong credentials, empty fields, invalid email and rate limit each show a clear Vietnamese message; the button is disabled while the request runs." | `authMessages.test.ts` (validation + mapping cases below). `AuthGate.test.tsx` › "invalid email shows errInvalidEmail and makes no call", › "empty password shows errEmptyPassword and makes no call", › "invalid_credentials shows errWrongCredentials", › "429 shows errRateLimit", › "button is disabled and shows the busy label while the request is pending" (deferred promise), › "a thrown error shows errGeneric and re-enables the button". |
| 4 | "The password field uses `type="password"` with `autocomplete="current-password"` (email: `autocomplete="email"`)" | `AuthGate.test.tsx` › "inputs have password-manager attributes": email input `type="email"`, `autocomplete="email"`, `name="email"`; password input `type="password"`, `autocomplete="current-password"`, `name="password"`. |
| 5 | "Matches the app style in light and dark mode at 390px (F-101 AC kept)." | Code reading: the card markup, tokens (`--bg`, `--surface`, `--border`, `--shadow`, `--brown`, `--muted`, `--danger`) and classes (`.eyebrow`, `.field`, `.btn`, `.btn-primary`) are unchanged from F-101; the password field reuses the same `<label className="field">` and `style={{ fontSize: 16, height: 44 }}` as email (16px avoids iOS zoom); no fixed widths. Optional visual check with dummy, non-secret env (`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=dummy pnpm dev`), devtools 390×844, toggle `localStorage["tu-do-theme"]` light/dark. Real phone: Ming. |
| 6 | "Unit tests for the new validation and error mapping; build, typecheck and tests pass." | `pnpm typecheck && pnpm format:check && pnpm test && pnpm build` all green. |
| 7 | Technical note: "Local mode (no `VITE_SUPABASE_*`) must keep skipping the login screen (R1)." | `AuthGate.test.tsx` › "local mode renders children without a login form" (mocked `supabase` = `null`). `git diff main -- src/features/auth/AuthGate.tsx`: the session `useEffect` and the two early returns are unchanged. |

## Ming verification after merge
(Needs M-1 done, or a local stack with a password user — see the smoke-test change.)
- On a phone, at the dev or production URL in Supabase mode: sign in with the stoktok email + password → the app
  opens; reload → still signed in; sign out → the login screen returns.
- The phone's password manager offers to save / fill the password (iOS Keychain, Google Password Manager).
- Wrong password → "Email hoặc mật khẩu chưa đúng…" in Vietnamese.
- Light and dark mode on the phone at its width (choose dark in the app, sign out, the login card is dark).
- Approve or change the proposed Vietnamese copy (Approach step 1) if wording should differ.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/AuthGate.tsx` | Replace OTP send / sent state / resend / cooldown with an email + password form calling `signInWithPassword`; `try/finally` for `busy`. Session effect and early returns unchanged. | Scope 1–2 |
| `src/features/auth/authMessages.ts` | New `COPY` for password login (OTP copy removed), `isValidEmail` kept, new `validateLogin(email, password)`, `authErrorMessage` updated (`invalid_credentials`, rate limit, fallback). | Scope 3, R6 |
| `src/features/auth/authMessages.test.ts` (new) | Unit tests for validation and error mapping. | AC 6, R8 |
| `src/features/auth/AuthGate.test.tsx` (new) | Component tests with an inline fake auth client via `vi.mock("@/lib/supabase")` (same getter pattern as `src/data/useWardrobe.test.tsx`). | AC 1–4, 7 |
| `src/features/auth/cooldown.ts` | **Delete.** Only `AuthGate.tsx` imports it (grep). There is no `cooldown.test.ts` / `authMessages.test.ts` on `main` today (F-101 landed before F-005; the ticket's "+ test" files do not exist). | Scope 2 |
| `vitest.config.ts` | Add `src/features/auth/authMessages.ts` to `coverage.include` and `coverage.thresholds` (same 80/80/80/75 as the other pure modules). Do **not** touch anything else in this file. | R8 (pure logic covered like its peers) |
| `README.md` | Line 14 "log in with a magic link" → email + password of the stoktok account; "Set up Supabase" step 3 rewritten (A4); Deploy step 8 (Redirect URL) and step 9 (phone check) updated (A4); code map line 116 "Magic-link login" → "Email + password login". | Scope 4 |
| `docs/qa/smoke-test.md` | Step 1 → enter email + password, press "Đăng nhập"; Run A: create a password user first in local Studio (Authentication → Add user → Create new user, email + password, auto-confirm); ports table "Mail (Mailpit/Inbucket, magic links)" → "Mail (Mailpit/Inbucket)"; Run B prerequisites drop the Redirect URL requirement; "Differences between runs" row "Magic link" → "Login user": Run A = user created in local Studio, Run B = existing stoktok account. | Scope 4 |

Not touched: `src/lib/supabase.ts`, `src/data/**`, `src/main.tsx`, `src/App.tsx`, `src/test/fakeSupabase.ts`
(the auth fake stays inline in the new test, so the shared helper is not changed), `supabase/**`,
`docs/feature-list.md` (A1), `work/ming-todo.md` and `work/backlog.md` (D16; see A4/A5 follow-ups),
`AGENTS.md`, `.figma/`, Figma plugins in `vite.config.ts` (R10).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `authMessages.test.ts` › `isValidEmail` accepts `a@b.co`, `"  ming@mmlabs.online  "`, `tên@miền.vn` | valid, whitespace trim, Vietnamese diacritics (server decides) |
| `authMessages.test.ts` › `isValidEmail` rejects `""`, `"   "`, `abc`, `a@b`, `a b@c.d`, `@b.co` | empty and malformed |
| `authMessages.test.ts` › `validateLogin("", "")` → `errInvalidEmail` | email checked first |
| `authMessages.test.ts` › `validateLogin("abc", "x")` → `errInvalidEmail` | invalid email |
| `authMessages.test.ts` › `validateLogin("a@b.co", "")` → `errEmptyPassword` | empty password |
| `authMessages.test.ts` › `validateLogin("a@b.co", "   ")` → `null` | whitespace password is not "empty" and is not trimmed (server decides) |
| `authMessages.test.ts` › `validateLogin(" a@b.co ", "mật khẩu")` → `null` | valid, diacritics in password |
| `authMessages.test.ts` › `authErrorMessage({status:400, code:"invalid_credentials"})` → `errWrongCredentials` | wrong email or password |
| `authMessages.test.ts` › `{status:429}`, `{code:"over_request_rate_limit"}`, `{status:429, code:"over_email_send_rate_limit"}` → `errRateLimit` | rate limit (status wins) |
| `authMessages.test.ts` › `{code:"email_address_invalid"}` → `errInvalidEmail` | server-side invalid email |
| `authMessages.test.ts` › `{status:0}` (fetch failure), `{}`, `null`, `undefined`, `{code:"email_not_confirmed"}`, `{code:"something_new"}` → `errGeneric` | network, fallback, no enumeration signal |
| `authMessages.test.ts` › every `COPY` value is a non-empty string and none contains "link" / "Gửi lại" | no OTP copy left |
| `AuthGate.test.tsx` › local mode renders children without a login form | R1 |
| `AuthGate.test.tsx` › renders nothing while the session is loading, children once `getSession` returns a session | session handling unchanged |
| `AuthGate.test.tsx` › renders email and password fields when signed out | AC 1 |
| `AuthGate.test.tsx` › inputs have password-manager attributes | AC 4 |
| `AuthGate.test.tsx` › submits trimmed email and the raw password to `signInWithPassword` (exactly one call, args `{ email: "a@b.co", password: " pw " }`) | AC 1, no trim of password |
| `AuthGate.test.tsx` › invalid email shows `errInvalidEmail` and makes no call | AC 3 |
| `AuthGate.test.tsx` › empty password shows `errEmptyPassword` and makes no call | AC 3 |
| `AuthGate.test.tsx` › `invalid_credentials` shows `errWrongCredentials` in `role="alert"`; button re-enabled | AC 3 |
| `AuthGate.test.tsx` › 429 shows `errRateLimit` | AC 3 |
| `AuthGate.test.tsx` › button is disabled and shows `COPY.signingIn` while the request is pending | AC 3 (deferred promise) |
| `AuthGate.test.tsx` › a thrown error shows `errGeneric` and re-enables the button | `try/finally` |
| `AuthGate.test.tsx` › renders children once `onAuthStateChange` delivers a session | AC 1 (sign-in reaches the app) |
| `AuthGate.test.tsx` › never shows a resend button (no "Gửi lại" after a successful submit) | AC 2 |

Fake for `AuthGate.test.tsx` (inline, per test): `auth.getSession` → `{ data: { session } }`,
`auth.onAuthStateChange(cb)` → stores `cb`, returns `{ data: { subscription: { unsubscribe: vi.fn() } } }`,
`auth.signInWithPassword` → `vi.fn` with scripted result. No `signInWithOtp` on the fake.

## Approach
1. **`authMessages.ts`** (no imports, pure):
   - `COPY` (proposed text, Ming may change wording):
     - `eyebrow` "TỦ ĐỒ CÁ NHÂN", `title` "Tủ đồ của tôi" (kept)
     - `intro` "Đăng nhập bằng email và mật khẩu của bạn."
     - `emailLabel` "Email", `emailPlaceholder` "ban@email.com" (kept)
     - `passwordLabel` "Mật khẩu"
     - `submit` "Đăng nhập", `signingIn` "Đang đăng nhập…"
     - `errInvalidEmail` "Email chưa đúng định dạng. Kiểm tra lại giúp mình nhé." (kept)
     - `errEmptyPassword` "Bạn chưa nhập mật khẩu."
     - `errWrongCredentials` "Email hoặc mật khẩu chưa đúng. Kiểm tra lại giúp mình nhé."
     - `errRateLimit` "Bạn thử hơi nhiều lần. Đợi một lúc rồi thử lại nhé."
     - `errGeneric` "Chưa đăng nhập được. Kiểm tra kết nối rồi thử lại nhé."
     - Removed: `send`, `sending`, `resend`, `resendIn`, `sentTo`, `sentHint`.
   - `isValidEmail` unchanged.
   - `validateLogin(email: string, password: string): string | null` — `!isValidEmail(email)` →
     `errInvalidEmail`; `password === ""` → `errEmptyPassword`; else `null`.
   - `authErrorMessage(err: { status?: number; code?: string } | null | undefined)`: `status === 429` or code in
     `RATE_LIMIT_CODES` (`over_request_rate_limit`, `over_email_send_rate_limit`) → `errRateLimit`;
     `invalid_credentials` → `errWrongCredentials`; `email_address_invalid` → `errInvalidEmail`; else
     `errGeneric`. Structural type, no Supabase import (as in F-101).
2. **`AuthGate.tsx`**:
   - State: `session`, `email`, `password`, `busy`, `error`. Remove `sent`, `sentAt`, `now`, the countdown effect
     and the `cooldown` import. All hooks stay above the early returns (Rules of Hooks).
   - `submit(e)`: `preventDefault`; `setError(null)`; `const invalid = validateLogin(email, password)`; if set,
     show it and return (no network call). Else `setBusy(true)`; `try { const { error } = await
     supabase!.auth.signInWithPassword({ email: email.trim(), password }); if (error)
     setError(authErrorMessage(error)); } catch { setError(COPY.errGeneric); } finally { setBusy(false); }`.
     On success do nothing else: the existing listener sets `session`, the gate renders children.
   - JSX: same page and card as today; `.eyebrow`, h1, intro; email `<label className="field">` (`type="email"`,
     `name="email"`, `autoComplete="email"`, `autoFocus`, `inputMode` not needed); password
     `<label className="field">` (`type="password"`, `name="password"`, `autoComplete="current-password"`,
     same inline style); full-width `.btn .btn-primary` `type="submit"`, `disabled={busy}`, label
     `busy ? COPY.signingIn : COPY.submit`; error `<p role="alert">` in `var(--danger)`. Form keeps `noValidate`.
     React attribute is `autoComplete` (renders as `autocomplete`).
3. **Delete `cooldown.ts`**; run the AC 2 `rg` to confirm nothing references it.
4. **Tests** as listed; mock `@/lib/supabase` with a getter over `vi.hoisted` state, like `useWardrobe.test.tsx`,
   so one file can test both `null` (local) and a fake client.
5. **`vitest.config.ts`**: add `authMessages.ts` to coverage include + thresholds.
6. **Docs**: README and smoke-test edits in the file table. Keep English text, Vietnamese only for exact UI labels.
7. Run `pnpm format`, then Checks: `pnpm typecheck && pnpm format:check && pnpm test && pnpm build`.

Rules: **R1** gate unchanged, tested with `supabase = null`. **R3** no new env/secret; password never persisted
or logged. **R6** all copy in `COPY`. **R7** only the files above. **R8** unit + component tests, checks green.
**R9** same responsive card, 16px inputs, dark tokens. **R10** untouched. Expected diff ≈ 250–330 lines (≈ 90 code,
≈ 200 tests, ≈ 30 docs) — one cycle.

## Specialist input used
No `consult-*.md` for T-006. Adopted from `work/tickets/F-101/security-review.md`: recommendation 2
(`try/finally` around the auth call). Recommendation 1 (cooldown comment) is moot — the file is deleted. Open
question 1 (Redirect URLs allowlist) no longer applies to login (A4). Areas include `security`, so the
orchestrator runs `security-ai-generated-code-auditor` at REVIEW against the Security summary above.

## Assumptions
Ming please confirm A1–A5 when approving (each has a default the plan already uses):
- **A1 — Feature-list conflict (changes vs ticket: none; flagged only).** `docs/feature-list.md` still says
  "Auth (magic link)", F-101 "resend button with a 60 s cooldown", F-102 "shown next to the magic link", F-007 AC
  "magic-link login on a phone". The ticket says the feature list is not edited here, and no decision in
  `work/decisions.md` records the switch. Default: the orchestrator adds a decision (D19: "Login is email +
  password via `signInWithPassword`; magic link removed; Ming 2026-11-09") and updates the feature list on `main`
  as a follow-up.
- **A2 — `email_not_confirmed` and other unknown codes → generic message** (not a specific one). Ticket lists only
  the five messages; a specific "not confirmed" message would reveal that the account exists. stoktok accounts are
  confirmed. Default: generic.
- **A3 — No client-side password rules** beyond "not empty". No min length, no trimming: accounts are stoktok's and
  the server decides. No show-password toggle, no "forgot password" link (out of scope; follow-up candidates).
- **A4 — Redirect URLs (change vs ticket, which only says "may need a follow-up").** Password login does not use
  Redirect URLs. Default in README: "Set up Supabase" step 3 becomes "Auth: no changes for TuDo login (D18). Do not
  change the Site URL or sign-up settings." (the check that sign-ups / anonymous sign-ins are OFF is kept as a
  read-only check); Deploy step 8 (add prod URL to Redirect URLs) is **removed**, with a one-line note that F-102
  (Google sign-in) will need it; step 9 becomes "sign in with the stoktok email + password". `work/ming-todo.md`
  M-1 step 3 and M-4 ("add the production URL to the Supabase Redirect URLs … log in on a phone with a magic link")
  are **not** edited on this branch (D16); the orchestrator updates them on `main`. If Ming prefers to keep adding
  the Redirect URLs anyway (ready for F-102), say so and README keeps steps 3/8 with "for F-102 later" wording.
- **A5 — Copy mentions no "stoktok".** Intro says "your email and password", not "your stoktok account", because
  the UI is TuDo's. Ming may want it explicit.
- **A6 — Rate-limit code list.** `over_email_send_rate_limit` is kept in the rate-limit list (harmless, one string)
  although password login should only return `over_request_rate_limit` / 429. It is not an OTP export, so AC 2
  holds.
- **A7 — Tests.** The ticket's "(+ test)" for `authMessages.ts` / `cooldown.ts` refers to files that do not exist on
  `main`; this plan creates `authMessages.test.ts` and `AuthGate.test.tsx` new. Adding a component test is beyond
  "unit tests for validation and error mapping" but is the only automated proof of AC 1, 3 (busy state), 4 and 7.
- **A8 — Hotspots.** `src/App.tsx` is not edited. `README.md` is also targeted by T-005.1 (`BLOCKED`, README
  "explains setup … reconnect"); a small rebase on README is possible later. No other open ticket edits
  `src/features/auth/**`, `vitest.config.ts` or `docs/qa/smoke-test.md`. Board rows: T-006 only.
- **A9 — Other docs.** `docs/plan-M1.md` and old ticket folders mention magic link historically; they are records,
  not instructions, and are left alone.

## Blocking questions
None.

## Split proposal
None. Estimated ≈ 250–330 changed lines (most of it tests), within one implement/review cycle.
