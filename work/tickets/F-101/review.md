## Attempt 1 — 2026-11-07
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `npx pnpm@10.34.3 typecheck` (`tsc --noEmit`) passed with no errors.
- format:check: "All matched files use the correct format. Finished in 33ms on 22 files." Matches impl-log.
- test: n/a. There is no `test` script yet (F-005 has not landed). The reviewer re-ran the plan's pure-module checks with a separate script outside the repo, `node --experimental-strip-types` (Node 22.16.0), importing `src/features/auth/cooldown.ts` and `src/features/auth/authMessages.ts` by absolute path: **ALL 29 CHECKS PASSED**. The script covers every plan case plus extras: `secondsLeft` 60 / 1 (+59 001) / 1 (+59 999) / 0 (+60 000) / 0 (+120 000) / 0 (null); `isValidEmail` accepts `a@b.co`, `"  ming@mmlabs.online  "`, `tên@miền.vn`, `đ@đ.vn` and rejects `""`, `"   "`, `abc`, `a@b`, `a b@c.d`, `@b.co`, `a@@b.co`; `authErrorMessage` maps 429 / `over_email_send_rate_limit` / `over_request_rate_limit` → `errRateLimit`, `email_address_invalid` → `errInvalidEmail`, and `{status:0,message:"Failed to fetch"}` / `{}` / `null` / `undefined` / an unknown code → `errGeneric`; `COPY.resendIn(42)` = "Gửi lại sau 42s".
- build: `npx pnpm@10.34.3 build` passed ("built in 955ms"; JS 227.20 kB, CSS 42.33 kB). `dist/` is gitignored, so the tree is unchanged.

### Acceptance criteria
- [x] 1 Matches the app style in light and dark mode. Evidence (code reading only, no visual check): `AuthGate.tsx` uses only tokens (`--bg`, `--surface`, `--border`, `--shadow`, `--brown`, `--muted`, `--text`, `--danger`) and existing classes (`.eyebrow`, `.btn`, `.btn-primary`, `.field`). There are no hard-coded colours. Every token has a `.dark` value (`src/index.css:16-27` and `:1343-1355`; `--brown` dark = `#e6ad87`). `.dark .btn-primary` exists (`index.css:1444`). The h1 copies `.intro h1` (Fraunces, `var(--brown)`, `index.css:1495-1499`).
- [x] 2 Works on a 390px viewport. Evidence (code reading): the page is `p-4` (16px) and the card is `w-full max-w-sm p-6` (`AuthGate.tsx` form), so content is 310px at 390px. Both buttons are `w-full`. The email is wrapped with `overflowWrap: "anywhere"`. Nothing has a fixed width. The input is overridden to `fontSize: 16, height: 44`, which avoids iOS focus zoom and gives a 44px touch target. The longest nowrap label ("Gửi link đăng nhập" at 11px plus the ↗ badge) fits easily.
- [x] 3 Resend is disabled for 60 s after each send. Evidence: the script (`secondsLeft` cases above). `AuthGate.tsx:53-55` sets `sentAt` / `now` after every successful `send()`, and both the first submit and "Gửi lại" go through `send()`. The resend button has `disabled={busy || left > 0}`.
- [x] 4 Clear Vietnamese error for invalid email. Evidence: the script. `<form noValidate>`. `AuthGate.tsx:39-42` returns before `signInWithOtp` when `isValidEmail` fails, so no network call is made.
- [x] 5 Clear Vietnamese error for rate limit. Evidence: the script (429 and both codes).
- [x] 6 Other errors are not raw English. Evidence: the script (generic fallback). `error.message` is no longer rendered. `AuthGate.tsx:50` uses `authErrorMessage(error)`. Nothing is logged.
- [x] 7 Saved theme is applied before AuthGate renders. Evidence: `src/main.tsx` calls `applySavedTheme()` at module level before `createRoot(...).render`. `src/lib/theme.ts` reads `tu-do-theme` inside try/catch and only toggles the class; it writes nothing. This is the same key and the same default (light) as `App.tsx:461,481-482`.
- [x] 8 Auth call and session handling unchanged. Evidence: `git diff origin/main...HEAD -- src/features/auth/AuthGate.tsx` shows the session `useEffect` (lines 21-26), both early returns (34-35) and the `signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + window.location.pathname } })` arguments (44-47) as unchanged context lines. There is no `auth.resend()` and no `shouldCreateUser`. `src/lib/supabase.ts` is not in the diff.
- [x] 9 Local mode unchanged (R1). Evidence (code reading): with `supabase === null` the initial `session` is `null`. The new countdown effect returns immediately (`cooling` is false because `sentAt` is null), and `if (!supabase || session) return <>{children}</>` (line 34) is unchanged. The dev server was not run.
- [x] 10 Checks green: see above.

### Specific checks requested
- **Rules of Hooks**: `sentAt` / `now` state, the derived `cooling` and the countdown `useEffect` are all declared above the early returns (`AuthGate.tsx:17-32` vs `34-35`). No hook comes after a return.
- **Cooldown cleanup**: the interval runs only while `cooling`, and the cleanup `clearInterval(id)` runs when `cooling` becomes false and on unmount (`AuthGate.tsx:28-32`). After a sign-in, `AuthGate` keeps rendering the same `children` element, so ticks during the rest of a cooldown do not re-render `App` (same element identity).
- **No double submit while busy**: `setBusy(true)` runs synchronously before the `await` (line 43). The submit button is `disabled={busy}` and resend is `disabled={busy || left > 0}`. React flushes discrete-event updates before the next discrete event, so a second click or Enter hits a disabled button. Acceptable; see the nit about a ref guard.
- **Resend uses identical arguments**: resend calls the same `send()` and therefore the same `signInWithOtp` call.
- **R6**: every Vietnamese string is in `COPY` (`authMessages.ts:1-16`). `AuthGate.tsx` has no Vietnamese literals left.

### Issues
None blocking. None should-fix.

### Rules R1–R10 (CLAUDE.md)
No violations found. Notes per rule:
- R1: local-mode path verified above. `AuthGate` calling `supabase.auth` is pre-existing auth, not data access.
- R2, R4, R5: not touched.
- R3: no new env var and no secret.
- R6: copy is in one place.
- R7: every `src/**` file in the diff is in the plan's file list. The `work/**` changes are orchestrator state (backlog, ming-todo, ticket, plan, impl-log).
- R8: checks are green, and unit tests are deferred to F-005 per plan A1.
- R9: judged from code only; see Ming verification.
- R10: `AGENTS.md`, `.figma/` and `vite.config.ts` are not touched.

### Nits (do not block)
- 💭 `AuthGate.tsx:37-56`: if `signInWithOtp` ever throws instead of returning `{ error }`, `busy` stays `true` and the form locks. This behaviour is pre-existing, and supabase-js normally returns fetch failures as `AuthRetryableFetchError` (status 0). A `try/finally` around the call would make it robust.
- 💭 A `useRef` in-flight guard in `send()` would make double-submit protection independent of React's flush timing.
- 💭 The title lost its `<em>của tôi</em>` emphasis ("Tủ đồ của tôi" is now plain text in `COPY.title`). Consider restoring the italic accent if it is part of the brand look.
- 💭 `.btn:hover` (orange ring and translate) still applies to the disabled "Gửi lại" button during the cooldown. This is cosmetic (`button:disabled` already sets opacity 0.6 and `cursor: not-allowed`).
- 💭 The countdown text changes every second with no `aria-live`. That is fine; just noting that screen readers won't announce when resend becomes available.
- 💭 The cooldown uses `Date.now()`, so moving the system clock backwards lengthens it (for example, −5 s gives 65 s). This is harmless.

### Ming verification after merge (carry into the PR)
- A real magic link on a phone (hosted Supabase, production URL): the email arrives, the link signs in, and the session survives a reload.
- Rate limit: press "Gửi lại" right after the countdown ends a few times, or send from two tabs, until Supabase answers 429. The Vietnamese rate-limit message shows.
- Light and dark on the phone: pick dark in the app, sign out, and check that the login screen is dark. Check the layout at the phone's width. **Neither the implementer nor the reviewer did a visual check.**

### Follow-ups (out of scope)
- F-005: move the check-script cases into `src/features/auth/*.test.ts` (Vitest, fake timers).
- F-004.1: `App.tsx` should import `THEME_KEY` from `src/lib/theme.ts` (the key is currently duplicated).
- Optional: a "use a different email" link in the sent state (plan A5).
