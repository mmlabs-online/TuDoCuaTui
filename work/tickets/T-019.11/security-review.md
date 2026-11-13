# Security review — T-019.11

## Attempt 1 — 2026-11-13 (security-ai-generated-code-auditor)

I found no blocking (🔴) issues in T-019.11 attempt 1. There are two 🟡 hardening items: a crash risk in error-message lookup (S1) and a missing rule for when the verify page sends its request (S2). Neither leaks anything today, because the slice makes no calls. Both are cheap to fix now, and S1's fix belongs in this slice.

This was a read-only review; I did not run the checks or `pnpm build`.

### Findings

**🟡 S1: error lookup trusts the error code at runtime.** `src/features/auth/copy.ts:104-105` falls through to `return e[code]`, and `AuthNotice` renders the result as a React child (`AuthNotice.tsx:24`). TypeScript limits `code` at compile time only. T-019.7 will build `AuthError` from server JSON, and a cast like `{ code: body.error as AuthErrorCode }` lets any string through:
- An unknown code returns `undefined`, so the user sees an empty `role="alert"` box.
- `"__proto__"` returns an object, and React throws when rendering it, which crashes the sign-in screen (denial of service from a response body).
- `"constructor"` returns a function, so nothing renders and React warns.
- `"weak_too_short"` / `"weak_too_common"` are internal keys that would also be accepted.

This is not XSS, since React escapes everything. Fix in `authErrorMessage`: return `e.unknown` unless `Object.hasOwn(e, code)` and the value is a string (or check the code against an `AUTH_ERROR_CODES` list). Add a test for `"__proto__"` and `"bogus"` returning the `unknown` copy. Related, minor: `copy.ts:99-101` shows any unrecognised `reasons` entry as `too_common`; filter to the two known values.

**🟡 S2: the verify contract implies sending on page load, and says nothing about clearing the token.** `VerifyEmailScreenProps` (`types.ts:64-73`) has `verifying` but no "press to verify" state. So T-019.7 will most likely parse `location.hash` and POST as soon as the page loads. Plan A12 defers clearing the fragment to T-019.7, but nothing in the code records it. Two consequences:
- **Clearing:** the token stays in the address bar and browser history, and can reach analytics or error-reporting breadcrumbs, unless T-019.7 clears it before the request.
- **Mail scanners:** scanners that run JavaScript (e.g. Safe Links) can use up the single-use token. The user then lands on `invalid`. That costs usability, not account security.

Recommendation: add a doc comment on `parseVerifyToken` / `VerifyEmailScreenProps` stating the T-019.7 rules:
- call `history.replaceState` to remove the hash before any network call;
- send the token only in the POST body, never in a URL or query;
- never log or render it;
- send `Referrer-Policy: no-referrer` (T-019.8).

Copy these into T-019.7's acceptance criteria. Optionally decide now whether a `ready` state ("Xác minh email" button) is wanted, so the screens don't change later.

**🟢 S3: verify-token parser is correct.** `validation.ts:11` `/^#token=([A-Za-z0-9_-]{32,128})$/`:
- Anchored, no `m` flag (so a trailing `\n` is rejected), and the character class is the URL-safe base64 set. No backtracking risk.
- It rejects everything that isn't exactly the token: query form, extra params, `+`, `=`, and percent-encoding.
- Gap: the tests at `validation.test.ts:119-131` don't cover the accepted 32 and 128 lengths. Add both.
- The token is never passed into or shown by the screen, which is good.

**🟢 S4: password handling is clean.**
- No `name` attribute on any input (`AuthField.tsx:19-24`), so even a native submit would send no fields. Combined with `method="post"` (`SignInScreen.tsx:59`, `SignUpScreen.tsx:72`), the password can't end up in a URL.
- `autocomplete` is `email`, `current-password` and `new-password`, as planned. The confirm value is never passed to callbacks (`SignUpScreen.tsx:55`).
- No storage, no console, no network in the slice. `boundary.test.ts:20-40` enforces that by text search.
- Gap: `SignUpScreen.test.tsx` doesn't assert `method="post"` the way `SignInScreen.test.tsx:145` does. Add it.
- Note for T-019.7: the password stays in `SignUpScreen` state during the `sent` state (`SignUpScreen.tsx:14,25`, the component stays mounted). Unmount the form or reset it after success.

**🟢 S5: no XSS route.** No `dangerouslySetInnerHTML` and no `innerHTML`. Server messages are never rendered, only codes mapped to copy. `sentTo` and `initialEmail` render as escaped text and input values.

**🟢 S6: the dev-only preview stays out of production.**
- `auth-preview.html` is not a build input: `vite.config.ts` has no `rollupOptions.input`, so only `index.html` is built.
- The runtime image copies only `dist` (`Dockerfile:38`), and `server/static.js` serves only `dist/`.
- `preview/main.tsx:7` also skips rendering when `import.meta.env.PROD` is true.
- `AuthPreview.tsx:92,103` logs only the email and password length, on screen. The theme toggle (`:76`) changes the CSS class only and doesn't save anything.
- Minor: the dev server binds `0.0.0.0` (existing config), so the page is reachable on the LAN during `pnpm dev`; no secrets, acceptable. `boundary.test.ts:42-49` doesn't scan `vite.config.ts`; adding `vite.config.ts` and `public/_redirects` (looking for `auth-preview`) would catch it being added as a build input later. Optional.

**🟢 S7: `vitest.config.ts:29-30,49-50`** only adds the two files to coverage and thresholds.

**🟢 S8: secrets rule R3 holds.** No `VITE_*` variable, no Turnstile site key and no script load; the Turnstile slot is a placeholder only.

### Recommendations
1. S1: guard `authErrorMessage` with `Object.hasOwn` and fall back to `unknown`; add tests. Fix in this ticket.
2. S3/S4: add the 32/128-character accept tests and the sign-up `method="post"` test.
3. S2: add the token-handling doc comment now, and write the matching criteria into T-019.7.
4. S6: optionally extend the boundary scan to `vite.config.ts` and `public/_redirects`.

### Risks
- The `boundary.test.ts` checks match text in the slice's own files only; imported modules aren't checked.
- S2: if T-019.7 skips clearing the fragment, the token will sit in browser history and could reach error-reporting or analytics.

### Open questions
- Should the verify screen wait for a click instead of verifying automatically, to protect tokens from mail scanners? Ming's call; cheaper to add the state now than in T-019.7.
