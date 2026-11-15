# Security review — T-019.7

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor, read-only; no checks run)

**No 🔴.** Three 🟡 to fix in the rework; the rest 🟢 hardening/notes.

### Findings
**🟡 S1. A stalled sign-out leaves `mm_account_id` on the device → reload signs the user back in.** `tokenStore.ts:108-121` clears `id` in memory, awaits `client.logout(gone)`, removes the stored id only in `finally`; `identityClient.ts:43` fetch has no timeout; `AuthGate.tsx:97-101` stays `checking` until `signOut()` settles. A hanging `/auth/logout` → UI stuck, `mm_account_id` and the `mm_device` session still valid → reload restores silently (`AuthGate.tsx:73-84`). Fix: `storage.clear()` before the `await` (id already in `gone`); `AbortSignal.timeout(~5 s)` on logout; move the gate to `signed_out` without waiting. Changes the plan's order ("logout → id cleared", AC2) — clearing first is strictly safer; update the AC2 test.

**🟡 S2. An unmounted App can use the next account's token and end the next session.** `AuthGate.tsx:110` hands every App generation one shared `appProps` (`store.getToken`, `onSignOut`, `onAuthLost`), not tied to a generation. `authFetch.ts:42-46` retry and multi-step saves (`repo.http.ts:76-84`: item PUT, resize, photo PUT) ask for a token again → after A signs out and B signs in, A's body goes with B's bearer. `photos.clear()` doesn't cover repo/AI calls; an old App's double 401 can call `onAuthLost` (`AuthGate.tsx:104-108`) and sign B out. Low likelihood. Fix: per-generation props (`useMemo(() => {...}, [view.generation])`) — `getToken: (r) => gen === generation.current ? store.getToken(r) : Promise.resolve(null)`; `onAuthLost`/`onSignOut` no-op when `gen` is not current (stable within one App instance, T-019.6 obligations 2–3). Test: old-generation `getToken` → `null` after sign-out → sign-in.

**🟡 S3. Turnstile is first-party script for the whole session (residual).** `turnstile.ts:23-39` appends `challenges.cloudflare.com/.../api.js` (no SRI possible); `TurnstileWidget` `remove()` (`TurnstileWidget.tsx:60`) removes the widget, not the script; it shares the JS realm with the token and could wrap `window.fetch` (`authFetch` resolves `fetch` at call time, `photoUrls.ts:46`, `repo.http.ts:14`). Accepted vendor trust; T-019.8 CSP must not put `challenges.cloudflare.com` in `connect-src` (only `script-src`/`frame-src`). Optional: full reload into the restore path after a Turnstile sign-in drops the script.

**🟢 Hardening/notes**
- `authFetch.ts:13` `isSameOriginPath` accepts `/\host` (normalised to `//host`) — not exploitable (`base` is constant `"/api"`); safer `new URL(url, location.origin).origin === location.origin` + `/api/` prefix.
- `authFetch.ts:28` spreading `init.headers` drops entries for a `Headers` instance → `new Headers(init.headers)` + `.set`.
- `AuthGate.tsx:146,256` previous user's email stays pre-filled after sign-out / `no_access` → reset `email` in `onSignOut`/`onAuthLost`.
- `AuthGate.tsx:104-108` (no `/logout` on `no_access`) and A8 (switch doesn't log out the previous account) leave the previous Identity session in `mm_device` — as designed (A6, A8); Ming should know for shared devices.
- `main.tsx:27` auth chunk load failure → unhandled rejection, blank page (fails closed); a small error message would help.
- `boot.ts:13` pathname must equal `/verify-email` exactly (link format fixed by consumers.md).
- `boundary.test.ts:21-40` scans only `src/features/auth`; optionally include `src/data/authFetch.ts`.

**🟢 Checked and OK**
- Token only in the `tokenStore.ts:43` closure; only storage write `writeAccountId` (`accountId.ts:17-23`) with a UUID checked at `identityClient.ts:75`; `readAccountId` drops non-UUIDs (`accountId.ts:9-10`); no `console`/`history`/DOM sink (boundary test); verify token in `useState` (`VerifyEmailPage.tsx:25`), never rendered.
- Errors are `{code}` objects (`errors.ts:38-65`, `identityClient.ts:25,50-51`); `getToken` rejection → `ApiError(0,"network")` (`authFetch.ts:34-36`).
- Bearer only in `authFetch` for same-origin paths; `identityClient` never adds `Authorization`; without `getToken` requests pass unchanged (`authFetch.ts:24`).
- `identityClient.ts:40-48`: login/token/logout/signup/resend `credentials:"include"` + `X-MM-App`; verify-email `credentials:"omit"`, no app header, `{token}` only in body; `cache:"no-store"`; `/token` validated (`Bearer`, audience, `expires_in` 1–86400, `:87-99`).
- `takeVerifyHash` before `detectRuntime` (`main.tsx:14-16`); POST only on button press with re-entry guard (`VerifyEmailPage.tsx:31-33`); only 422 → `invalid`.
- Allowlisted codes (`__proto__`, `constructor`, `no_access` → `unknown`); `reasons` array filtered; `Retry-After` `^\d{1,9}$` clamped 1…86400 (`errors.ts:24-33,42-59`); `apiErrorMessage` prototype keys fall back (`apiErrors.ts:43-44`).
- Single-flight refresh (`tokenStore.ts:52`); `getToken(rejected)` compare-and-refresh; generation bump drops late results (`:59,65`).
- 401 retry bounded (≤ 2 sends, then `onAuthLost` once + `ApiError(401)`; `null` token throws without fetch, `authFetch.ts:37,42-49`); `opaqueredirect` → 401 without `onAuthLost`.
- Sign-out: `flushSync` unmount (`AuthGate.tsx:97`) → `photos.clear()` (`useWardrobe.ts:41`, `photoUrls.ts:154-165`) → logout → id removed (see S1); `key={generation}` remount; late blobs dropped (`photoUrls.ts:79`).
- Turnstile: only `turnstile.ts` injects, `render=explicit`, once, retryable; fails closed (empty key / load error → `turnstile_failed`; sign-up without token sends nothing, `AuthGate.tsx:168-171`); reset after each submit.
- Lazy loading: `main.tsx` uses only `import()` (boundary test `:59-73`); `src/data` never imports `features/auth`.
- `config.ts` public values only; no `VITE_`, no secret (R3).

### What T-019.8's CSP must allow
- `connect-src 'self' https://api.mmlabs.online` (not `challenges.cloudflare.com`).
- `script-src 'self' https://challenges.cloudflare.com`; `frame-src https://challenges.cloudflare.com`.
- `img-src 'self' blob: data:`.
- `Referrer-Policy: no-referrer` on `/verify-email` (and `/reset-password`); consider site-wide.
- `frame-ancestors 'none'`, HSTS.

### Recommendations
1. S1 (AC1/AC2, AC3).
2. S2 (AC16, T-019.6 obligation 1).
3. S3: record the residual in T-019.8; keep `connect-src` to `'self'` + `api.mmlabs.online`.
4. Optional 🟢 items above.

### Risks
- Turnstile as first-party script while the token is in memory (CSP is the only mitigation).
- Access tokens valid up to 15 min after logout (A15), which makes S2 more plausible.

### Open questions
- Show or offer to log out a `no_access` / not-member account's leftover Identity session?
- Is the AC2 test strict about "logout before id cleared"? Fixing S1 changes it.
