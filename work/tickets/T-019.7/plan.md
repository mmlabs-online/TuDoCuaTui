Status: READY

# Plan — T-019.7: SPA sign-in and sign-out with the Identity token

Gate `plan-approval` (High tier: `src/features/auth/**`). Re-planned 2026-11-15 with Ming's answers (sub via another
app; one ticket, no split; `/verify-email` in access and identity mode; M-25 done, site key `0x4AAAAAAF_LLtCloZlzY0MY`).

## Feature summary
Not in `docs/feature-list.md` (T- ticket, slice of umbrella T-019). Sources quoted:

- Ticket goal: "In API + identity mode the app shows a sign-in screen, keeps the token in memory only and sends it to `/api`."
- Umbrella plan, *Split proposal* T-019.7: "ticket AC1 and AC3; error copy for `not_member`, `email_unverified`,
  `session_invalid`, `turnstile_required`, `rate_limited`, `network`; reload restores the session silently via
  `mm_account_id`; 390px + dark; auth code not in the local-mode path (lazy import)."
- Umbrella T-019 AC1: "In API mode the app shows a sign-in screen until a valid `tudocuatui` token is obtained; sign-out
  revokes the account session (`POST /api/v1/auth/logout`) and returns to sign-in. Local mode is unchanged (no login)."
- Umbrella T-019 AC3: "The access token never reaches localStorage, sessionStorage, URLs or logs (test + boundary check)."
- Umbrella target design: "token in a module closure only, single-flight `getToken()`, refresh at `expires_in − 60 s`
  measured from receipt; only `mm_account_id` in localStorage. `createHttpRepo({ getToken })` adds `Authorization:
  Bearer` to same-origin `/api` only, retries once after a 401." "An auth failure never falls back to local mode."
- D35: "TuDo has its own sign-up (with Turnstile) and `/verify-email` page … Screens are built first without the API
  (T-019.11) and wired later (T-019.7)."
- D36: "The `/verify-email` page clears `#token` from the URL at once, then shows a "Xác minh email" button and calls
  `POST /api/v1/auth/verify-email` only when the user presses it."
- D34: "the SPA fetches photos with the bearer and renders `blob:` URLs".
- D31: "Local mode unchanged (R1)."
- org-admin-api `docs/consumers.md`: every cookie-class call `credentials: "include"`, `X-MM-App`; token "in memory
  only"; verify page "reads `location.hash`, then removes it at once (`history.replaceState(null, "", "/verify-email")`)",
  "is served with `Referrer-Policy: no-referrer`", POST `{token}` "public endpoint: no cookie or `X-MM-App` needed";
  resend "`{account_id}`, `credentials: "include"` and `X-MM-App`"; error tables for `/token`, verify, resend.
- Ticket notes (Ming 2026-11-15): "Keep one ticket (no 7a/7b split)"; "`/verify-email` works in both access and
  identity mode (consult R4)"; "M-25 done. Turnstile public site key: `0x4AAAAAAF_LLtCloZlzY0MY` (public by design;
  goes into `src/features/auth/config.ts` as a constant per consult R8)".
- Ticket notes (T-019.6 security review — must keep), T-019.11 security review S1/S2/S4: quoted in the ACs below.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | API + identity mode (`/healthz` `auth: "identity"`): sign-in screen until `/token` returns a valid `tudocuatui` token; App mounts only in `ready` (ticket AC1). | `AuthGate.test.tsx` › "signed out shows SignInScreen, App not rendered"; "login → token → App rendered with getToken"; `mode.test.ts` › `detectRuntime` cases. |
| 2 | Sign-out: App unmounts first (photo blob URLs revoked), then `POST /auth/logout {account_id}` (best effort), token dropped, `mm_account_id` removed, sign-in shows "Bạn đã đăng xuất." (ticket AC1, T-019.6 obligation 1). | `AuthGate.test.tsx` › "sign-out order: unmount → logout → id cleared" (spy order); "logout network failure still signs out"; `tokenStore.test.ts` › "signOut discards a late refresh". |
| 3 | Token never in localStorage, sessionStorage, URLs or logs; only `mm_account_id` is written (ticket AC1/AC3). | `tokenStore.test.ts` › spies on `Storage.prototype.setItem`, `history.pushState/replaceState`, `console.*` (only `setItem("mm_account_id", <uuid>)`); `identityClient.test.ts` › "error objects never contain the token"; `boundary.test.ts` per-file rules (A12). |
| 4 | Bearer only in `Authorization`, only to same-origin `/api` (base starts with `/`, not `//`), `credentials:"same-origin"`, `redirect:"manual"`; on 401 one retry with `getToken(staleToken)`; second 401 → `onAuthLost` once, `ApiError(401)`; never loops; no header without `getToken` (local/access mode unchanged). Photo loader the same (T-019.6 obligations). | `authFetch.test.ts` (all listed cases); `repo.http.test.ts` › "bearer + one retry", "no header without getToken"; `aiSettings.test.ts` same; `photoUrls.test.ts` › "401 → one retry with fresh token", "second 401 → onAuthLost, no loop". |
| 5 | A fresh token that still gets 401 (e.g. no role) → sign-in screen with a distinct "no access" notice; the local account id is forgotten (no restore loop), no logout call (A6). | `AuthGate.test.tsx` › "onAuthLost → signed_out with no_access, mm_account_id removed, logout not called". |
| 6 | Vietnamese copy for `not_member`, `email_unverified`, `session_invalid`, `turnstile_required`, `rate_limited`, `network` (+ new `no_access`, verify `ready`/`submit`, retry, sign-out label) in `src/features/auth/copy.ts` / `LAYOUT_COPY` (ticket AC2, R6). | `copy.test.ts` (extended code list); grep: no Vietnamese literals in new `.ts/.tsx` except copy files. |
| 7 | Reload restores silently via `mm_account_id`: id present → `checking` → `/token` → `ready` with no sign-in form; `session_invalid` → sign-in, id removed; `network`/`rate_limited` → retry screen, id kept; `not_member`/`email_unverified` → sign-in with that error, id kept; no id → sign-in with no network call (ticket AC3). | `AuthGate.test.tsx` › one test per restore outcome; `accountId.test.ts` › non-UUID value dropped. |
| 8 | Auth code is lazy-loaded only in API mode with `auth === "identity"` or a `/verify-email#…` visit; local mode and access mode (outside `/verify-email`) never load it; never falls back to local on auth failure (ticket AC4, R1). | `boundary.test.ts` › "only src/main.tsx mentions features/auth, via dynamic import()"; `boot.test.ts` › `needsAuth` truth table; `pnpm build` then `grep -l "api.mmlabs.online" dist/assets/*.js` lists only the lazy chunk(s), not the `index-*.js` entry; `pnpm dev` (local) shows demo items, no sign-in. |
| 9 | Sign-up: `POST /auth/signup {email,password,turnstile_token}` with `credentials:"include"` + `X-MM-App`; Turnstile widget from the public site key constant; token reset after every submit; empty/failed script → submit disabled + `turnstile_failed` copy; on 201 the form unmounts (password dropped, S4) and "sent" shows the email (ticket AC5). | `identityClient.test.ts` › signup request shape; `turnstile.test.ts` › script injected once, `reset` after submit, `remove` on unmount, load failure → not ready; `AuthGate.test.tsx` › "sign-up sent unmounts the form" (password input gone, remount after "Đăng nhập" has empty fields). |
| 10 | Sign-in also gets Turnstile after 403 `turnstile_required` (ADR-0004 §8): widget slot shown, next login sends `turnstile_token`; no login call while no Turnstile token. | `AuthGate.test.tsx` › "turnstile_required shows slot; next login includes turnstile_token". |
| 11 | Verify-email token rules (S2): `history.replaceState(null,"","/verify-email")` runs synchronously in `main.tsx` before `/healthz` or any fetch; token only in the POST body (`credentials:"omit"`, no `X-MM-App`, no query string); never logged or rendered; `Referrer-Policy: no-referrer` is delivered by T-019.8 (A5). | `boot.test.ts` › "replaceState before any fetch" (call order of `history.replaceState` and a `fetch` spy); `identityClient.test.ts` › verifyEmail request shape; `VerifyEmailPage.test.tsx` › "token not in DOM" (`container.innerHTML` does not contain it), console spies silent. |
| 12 | Server error bodies are normalised before the screens: code only from an explicit server-code list (client-only codes such as `no_access`, copy keys, `__proto__` → `unknown`); `reasons` must be an array filtered to `too_short`/`too_common`; `Retry-After` parsed and clamped; `TypeError` → `network`; `app_header_required`/`origin_not_allowed`/`audience_mismatch` → `unknown` (S1, ticket AC6). | `errors.test.ts` › table of inputs (`"__proto__"`, `"no_access"`, `"weak_too_short"`, `reasons: "too_short"`, missing/garbage/huge `Retry-After`, non-JSON body, 500). |
| 13 | Verify waits for a button press (D36): page parses the copied hash, shows `ready` with "Xác minh email"; POST only on click; `parseVerifyToken` null → `invalid` with no network; 204 → `verified`; 422 → `invalid`; 429/network → back to `ready` with the error (token kept, retry possible) (ticket AC7). | `VerifyEmailScreen.test.tsx` › `ready` state renders button, calls `onVerify`; `VerifyEmailPage.test.tsx` › "no POST before click", "one POST per click", each status mapping. |
| 14 | `/verify-email` works in API mode with `auth` `"identity"` and `"access"` (Ming 2026-11-15); after `verified`, "Tiếp tục" goes to `/` and: identity → gate (silent restore if `mm_account_id`, else sign-in with notice `verified`); access → App. Resend on `invalid` only when `mm_account_id` exists, else the existing "Đăng nhập để gửi lại email" button. | `AuthRoot.test.tsx` › verify then continue, both modes; `VerifyEmailPage.test.tsx` › resend shown only with an account id; resend 202/409/429/401 mapping. |
| 15 | Resend from sign-in after `email_unverified` (`POST /auth/verify-email/resend {account_id}`, cookie class). | `AuthGate.test.tsx` › "email_unverified → resend → sent"; `identityClient.test.ts` › resend shape. |
| 16 | `getToken` is one stable function passed on App's first render; App remounts (`key={generation}`) on every new sign-in; `item.photo` never holds a `blob:` URL; photo cache headers untouched (T-019.6 obligations 2–3). | `AuthGate.test.tsx` › "same getToken across renders", "new sign-in remounts App"; `useWardrobe.test.tsx` › loader created with the getter on first render; `git diff --stat server/` empty. |
| 17 | Sign-out button in the Header only when `onSignOut` is set (identity mode); hidden in local and access mode. | `Header` render in `AuthGate.test.tsx` (button present, label from `LAYOUT_COPY`) and `useWardrobe`/App smoke in local mode (absent). |
| 18 | Reuses the T-019.11 screens (no new sign-in/sign-up form); all checks green; 390px and dark mode (ticket AC8, R8, R9). | typecheck, `pnpm format:check`, `pnpm test`, `pnpm build`; `boundary.test.ts` › theme variables / no width > 390px also covers new `.tsx`; new screens use `AuthLayout`. |

## Ming verification after merge

### Release notes (for the release PR and M-21)
- **Ship together with T-019.8** (CSP + HSTS + `Referrer-Policy: no-referrer` on `/verify-email`). Do not cut a release
  that contains T-019.7 without T-019.8: the token now lives in JS memory, and the CSP must allow
  `connect-src https://api.mmlabs.online` and `script-src`/`frame-src https://challenges.cloudflare.com` (Turnstile).
- While production stays `TUDO_AUTH_MODE: access`, the only visible change is the `/verify-email` page (works under
  Access). The app itself is unchanged until M-21.
- Prerequisites for M-21: M-19 (app `tudocuatui` registered, origin `https://tudocuatui.mmlabs.online`), M-20 (your
  account verified and a member), M-25 (done), T-019.5–T-019.8 in the release.

### M-21 checks (production, Access still on)
1. `curl -s https://tudocuatui.mmlabs.online/healthz` (through Access, in the browser) shows `"auth":"identity"`.
2. Desktop incognito: Access login, then TuDo's **sign-in** screen. Sign in → wardrobe loads, photos show (DevTools:
   `<img src="blob:…">`).
3. Reload → app opens without the sign-in form (silent restore). DevTools → Application → Local Storage: only
   `mm_account_id` (a UUID) is new; no token anywhere; Session Storage empty.
4. DevTools → Network: `Authorization: Bearer` appears only on `tudocuatui.mmlabs.online/api/…` requests; calls to
   `api.mmlabs.online` carry no bearer.
5. Settings (AI) still opens and saves (bearer on `/api/ai-settings`).
6. Sign out (header icon) → "Bạn đã đăng xuất."; `mm_account_id` gone; reload → sign-in screen.
7. Type a wrong password 3 times → the Turnstile widget appears; solving it lets you sign in.
8. Sign up with a second test email → "Kiểm tra email"; open the link → `/verify-email` shows "Xác minh email" and the
   address bar has no `#token`; press the button → "Email đã được xác minh."; "Tiếp tục" → sign-in.
9. Sign in with that unjoined test account → "Tài khoản này chưa có quyền dùng Tủ đồ của tôi." (`not_member`; join comes
   with T-019.10). Isolation with a joined second account per A16 (empty wardrobe, cannot see your items).
10. Phone (390px) + dark mode: sign-in, sign-up with the Turnstile widget, verify page, sign-out.
11. Known: if the Access session expired, `/healthz` can look like `auth: null` → App without the gate, API 401;
    reload fixes it (goes away with M-22).
- Rollback: `TUDO_AUTH_MODE: access` in compose (the gate then no longer loads; `/verify-email` keeps working).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/config.ts` | new: `IDENTITY_BASE = "https://api.mmlabs.online/api/v1"`, `APP_KEY = "tudocuatui"`, `TURNSTILE_SITE_KEY = "0x4AAAAAAF_LLtCloZlzY0MY"` | AC9, consult R1/R8, Ming M-25 note |
| `src/features/auth/errors.ts` | new: `SERVER_AUTH_ERROR_CODES` list, `toAuthError(status, headers, json)`, `networkError()` | AC12 (S1) |
| `src/features/auth/identityClient.ts` | new: `createIdentityClient({ baseUrl, app, fetchFn? })` with `login`, `token`, `logout`, `signup`, `verifyEmail`, `resendVerification`; response-shape validation | AC1, 9, 11, 15; A10 |
| `src/features/auth/accountId.ts` | new: `readAccountId`, `writeAccountId`, `clearAccountId` (key `mm_account_id`, UUID-shaped or dropped; storage errors swallowed) | AC3, AC7 |
| `src/features/auth/tokenStore.ts` | new: `createTokenStore({ client, storage?, now? })`: `getToken(rejected?)`, `signIn`, `restore`, `signOut`, `forget`, `subscribe`, `accountId()` | AC3, 4, 7, 16 |
| `src/features/auth/turnstile.ts` | new: only script injector (`…/turnstile/v0/api.js?render=explicit`, once), `loadTurnstile()`, typed `render/reset/remove` | AC9, 10 |
| `src/features/auth/TurnstileWidget.tsx` | new: mounts the widget with the site key, `size:"flexible"`, theme from the `dark` class; `onToken`, `onExpire`, `onError`; `reset` handle; `remove` on unmount | AC9, 10 |
| `src/features/auth/AuthGate.tsx` | new: identity-mode state machine (R5 states), wires `SignInScreen`/`SignUpScreen`, error/retry screen, renders `renderApp({ getToken, onSignOut, onAuthLost })` under `key={generation}` | AC1, 2, 5, 7, 10, 15–17 |
| `src/features/auth/VerifyEmailPage.tsx` | new: holds the token in local state, drives `VerifyEmailScreen` (`ready` → `verifying` → …), resend when an account id exists | AC11, 13, 14 |
| `src/features/auth/AuthRoot.tsx` | new: lazy entry; `verifyHash` → `VerifyEmailPage`; else identity → `AuthGate`; access → `renderApp()`; "Tiếp tục" does `history.replaceState(null,"","/")` and switches view | AC8, 14 |
| `src/features/auth/types.ts` | `VerifyState` + `"ready"`; `VerifyEmailScreenProps.onVerify?`, `error?`; `AuthErrorCode` + client-only `"no_access"`; `SignInScreenProps.turnstileSlot` unchanged | AC5, 13 |
| `src/features/auth/copy.ts` | `verify.ready`, `verify.submit` ("Xác minh email"), `errors.no_access`, `actions.retry` ("Thử lại"), `Array.isArray(reasons)` guard in `authErrorMessage` (T-019.11 review note) | AC6, 12, 13 |
| `src/features/auth/VerifyEmailScreen.tsx` | render `ready` (text + primary button `onVerify`, optional error notice) | AC13 |
| `src/features/auth/preview/AuthPreview.tsx` | add `"ready"` to the verify state list (dev preview stays complete) | AC13; keeps preview in sync |
| `src/features/auth/boundary.test.ts` | rewrite as per-file allowlist (A12), keep theme/width rule | AC3, 8 |
| `src/lib/boot.ts` | new (non-auth, tiny): `takeVerifyHash(loc, hist)`; `needsAuth({mode, auth}, verifyHash)` | AC8, 11 |
| `src/data/mode.ts` | `probeOnce` returns parsed body; new `detectRuntime()` → `{ mode, auth: "identity" \| "access" \| null }`; `detectMode()` becomes a wrapper | AC1, 8 |
| `src/data/authFetch.ts` | new: `createAuthedFetch({ fetchFn, getToken?, onAuthLost? })` (bearer for same-origin paths, one retry, second 401 → `onAuthLost`) | AC4 |
| `src/data/repo.http.ts` | optional trailing `auth?: { getToken?, onAuthLost? }` param; `call` goes through `createAuthedFetch` | AC4 |
| `src/data/aiSettings.ts` | same optional `auth?` param; remove `httpAiSettings` singleton | AC4 (consult F6) |
| `src/data/photoUrls.ts` | `getToken(rejected?)`; on 401 one retry with `getToken(stale)`; second 401 → `onAuthLost?.()` | AC4, T-019.6 obligations |
| `src/data/useWardrobe.ts` | options `{ getToken?, onAuthLost? }` passed to `createHttpRepo` and `createPhotoLoader` on first render | AC4, 16 |
| `src/App.tsx` | props `onSignOut?`, `onAuthLost?`; widened `getToken` type; AI client `useMemo(() => createHttpAiSettings(undefined, undefined, { getToken, onAuthLost }), [])`; pass `onSignOut` to `Header` | AC4, 16, 17 |
| `src/features/layout/Header.tsx` | optional `onSignOut` → `icon-btn` with `Icon name="logout"` | AC17 |
| `src/features/layout/copy.ts` | `signOut: "Đăng xuất"` | AC6, R6 |
| `src/main.tsx` | boot: `takeVerifyHash()` sync first, `detectRuntime()`, dynamic `import("./features/auth/AuthRoot")` only when `needsAuth` | AC8, 11 |
| tests | see *Tests to write* (new files plus `copy.test.ts`, `VerifyEmailScreen.test.tsx`, `mode.test.ts`, `repo.http.test.ts`, `aiSettings.test.ts`, `photoUrls.test.ts`, `useWardrobe.test.tsx`) | R8 |

No change to `server/**`, `vite.config.ts`, `index.html`, `public/`, `Dockerfile`, CI or deploy files.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/auth/errors.test.ts` › code from server list only (`__proto__`, `constructor`, `no_access`, `weak_too_short`, number → `unknown`); `app_header_required`/`origin_not_allowed`/`audience_mismatch` → `unknown`; `reasons` string/object/mixed → filtered array or absent; `Retry-After` `"120"` → 120, `"abc"`/missing → undefined, `"99999999"` → clamped 86400, `"0"`/negative → undefined; non-JSON / 500 → `unknown`; `TypeError` → `network` | AC12 |
| `src/features/auth/identityClient.test.ts` › login/token/logout/resend/signup: URL, method, `credentials:"include"`, `X-MM-App: tudocuatui`, `Content-Type`, exact body (`turnstile_token` only when given; `audience: "tudocuatui"`); verifyEmail: `credentials:"omit"`, no `X-MM-App`, body `{token}` only, URL has no query; response validation (non-UUID `account_id`, `token_type` ≠ `Bearer`, missing/0/NaN `expires_in`, wrong `audience`, empty `access_token` → `unknown`); thrown errors and `String(err)` never contain the token or password | AC1, 3, 9, 11, 12, 15 |
| `src/features/auth/accountId.test.ts` › UUID kept, garbage/`""`/oversized dropped and removed; storage that throws → `null`, no throw; key is exactly `mm_account_id` | AC3, 7 |
| `src/features/auth/tokenStore.test.ts` › only `setItem("mm_account_id", uuid)` ever (spy on `Storage.prototype.setItem`), no `history.*`, no `console.*`; single-flight (10 parallel `getToken()` → 1 `/token`); cache until `receivedAt + (expires_in − 60) s` (fake timers: 1 ms before → cached, at threshold → refresh); `getToken(stale)` refreshes only when `stale` equals the current token (10 concurrent 401s → one refresh); `session_invalid` clears token + id and notifies; `not_member`/`email_unverified` notify, keep id; `network`/`rate_limited` reject, keep all; `signOut` bumps generation, late refresh discarded, `logout` called with id, id always removed even if logout rejects; `forget` clears without logout; `getToken` identity stable | AC2–5, 7, 16 |
| `src/features/auth/turnstile.test.ts` › script tag injected once with `render=explicit` (two loads → one tag); load error → rejects, later call can retry; `TurnstileWidget` calls `render` with the site key, `remove` on unmount, `reset` via handle; empty site key → not rendered, `onError` | AC9, 10 |
| `src/features/auth/AuthGate.test.tsx` (fake client, fake Turnstile) › no id → sign-in, zero network; restore each outcome (ready / session_invalid / network retry / rate_limited / not_member / email_unverified); login → ready, App rendered with stable `getToken`; `invalid_credentials` error shown; `turnstile_required` → slot, next login has `turnstile_token`, widget reset after submit; email_unverified resend → sent; sign-up 201 → sent, form unmounted, back to sign-in has empty fields; sign-up without Turnstile token → no request; sign-out order (App unmount spy → `logout` → id cleared) and notice; logout rejects → still signed out; `onAuthLost` → `no_access` error, id removed, no logout, repeated calls idempotent; second sign-in → App remounted (new `key`) | AC1, 2, 5, 7, 9, 10, 15–17 |
| `src/features/auth/VerifyEmailPage.test.tsx` › bad hash → `invalid`, no fetch; good hash → `ready`, no fetch until click; click → one POST, 204 → `verified`; 422 `token_invalid`/`validation_error` → `invalid`; 429 → `ready` + wait text; `TypeError` → `ready` + network copy; token string never in `container.innerHTML`; resend offered only with an account id; resend 202 sent / 409 → verified text / 429 / 401 `session_invalid` → sign-in fallback | AC11, 13, 14 |
| `src/features/auth/AuthRoot.test.tsx` › verifyHash + identity → verify page, "Tiếp tục" → `replaceState(…, "/")` then gate; verifyHash + access → verify page, then `renderApp()` with no props; no hash + identity → gate | AC8, 14 |
| `src/features/auth/VerifyEmailScreen.test.tsx` › `ready`: primary "Xác minh email" button calls `onVerify`; error notice shown when given; existing tests unchanged | AC13 |
| `src/features/auth/copy.test.ts` › code list includes `no_access`; `reasons` that is not an array → `weak_password` copy | AC6, 12 |
| `src/features/auth/boundary.test.ts` › per-file allowlist (A12); main.tsx only dynamic import; theme/width rule over all auth `.tsx` | AC3, 8, 18 |
| `src/lib/boot.test.ts` › `/verify-email#token=x` → returns `"#token=x"`, `replaceState(null,"","/verify-email")` called before a `fetch` spy (when followed by `detectRuntime`); other path → `null`, no `replaceState`; `/verify-email` without hash → `null`; `needsAuth` table: local × any → false; api+identity → true; api+access/null + hash → true; api+access/null no hash → false | AC8, 11 |
| `src/data/mode.test.ts` › existing tests unchanged; `detectRuntime`: `{status:"ok",auth:"identity"}` → identity; `auth:"access"` → access; missing/unknown `auth` → null; `opaqueredirect` → api + null; dev → local + null | AC1, 8 |
| `src/data/authFetch.test.ts` › no `getToken` → request identical to today (no header); with it → `Authorization: Bearer t` on `/api/x`; absolute `https://…` and `//host` bases → no header; 401 → retry once with `getToken("t")`, new token used; second 401 → `onAuthLost` once + `ApiError(401)`; `getToken` → `null` → `ApiError(401)` without fetch and without `onAuthLost`; `getToken` rejects → `ApiError(0,"network")`, message without token; Blob body re-sent on retry; `credentials:"same-origin"`, `redirect:"manual"` kept | AC4 |
| `src/data/repo.http.test.ts` › existing tests unchanged (no auth param); new "bearer + one retry", "second 401 → onAuthLost" | AC4 |
| `src/data/aiSettings.test.ts` › same two cases; `httpAiSettings` export gone | AC4 |
| `src/data/photoUrls.test.ts` › existing green; 401 → one retry with `getToken(stale)`; second 401 → `onAuthLost`, entry rejected, no third fetch | AC4 |
| `src/data/useWardrobe.test.tsx` › API mode with `getToken`: repo and loader both get it on the first render; `onAuthLost` forwarded | AC4, 16 |

## Approach
1. **Pure logic first.** `errors.ts` → `identityClient.ts` → `accountId.ts` → `tokenStore.ts`, each with its tests
   (R8). Token lives only in the `tokenStore` closure; React state never holds it.
2. **Data layer.** `authFetch.ts`, then `repo.http.ts`, `aiSettings.ts`, `photoUrls.ts`, `useWardrobe.ts`. `src/data`
   never imports `features/auth`; `getToken` is injected (umbrella row). Without `getToken` every request is byte-for-byte
   today's (R1; access and local mode unchanged).
3. **Mode + boot.** `detectRuntime` in `mode.ts`; `src/lib/boot.ts`; `main.tsx`:
   `const verifyHash = takeVerifyHash(); const rt = await detectRuntime(); needsAuth(rt, verifyHash) ?
   import("./features/auth/AuthRoot") … : render(<App mode={rt.mode} />)`. Hash is stripped synchronously before
   `/healthz`. In local mode the hash is stripped and the app renders (no network). `clearLegacyAuthKeys` is unchanged
   (it only matches `sb-*`).
4. **Screens.** `VerifyEmailScreen` `ready` state; `TurnstileWidget`; `AuthGate`, `VerifyEmailPage`, `AuthRoot`. Reuse
   `SignInScreen`/`SignUpScreen`/`AuthLayout`/`AuthNotice`; `SignUpScreen` gets `key` so `sent` unmounts the form
   (S4). The `blocked` cases reuse `SignInScreen` with the error (A8).
5. **App wiring.** `App` gets `getToken` (stable, first render), `onAuthLost`, `onSignOut`; per-App AI client; Header
   sign-out icon. AuthGate renders App under `key={generation}`; sign-out sets `signed_out` first (unmount →
   `photos.clear()`), then `store.signOut()`.
6. **Boundary test** rewrite last, then all checks.

Rules: R1 (repo + local mode untouched, lazy chunk), R3 (only a public site key and public URLs; no `VITE_` var),
R4/D34 (blob photos, bearer only in header), R5 n/a, R6 (copy in `copy.ts` / `LAYOUT_COPY`), R7 (Referrer-Policy and
CSP stay in T-019.8; no server change), R8 (tests above), R9 (`AuthLayout`, 390px, dark; widget `size:"flexible"`),
R10 (`vite.config.ts`, `AGENTS.md`, `.figma/` untouched).

### Key contracts (for the implementer)
- `toAuthError(status: number, headers: Headers | null, json: unknown): AuthError` — never throws.
- `IdentityClient`: `login({email,password,turnstileToken?}) → {accountId,email}`; `token(accountId) →
  {accessToken,expiresIn}`; `logout(accountId) → void`; `signup({email,password,turnstileToken}) → {email}`;
  `verifyEmail(token) → void`; `resendVerification(accountId) → void`. Rejections are `AuthError` objects.
- `TokenStore.getToken(rejected?: string): Promise<string | null>` (`null` when signed out). Type in `src/data`:
  `type GetToken = (rejected?: string) => Promise<string | null>` (compatible with T-019.6's `() => …`).
- `AuthRoot` props: `{ renderApp: (p?: { getToken; onSignOut; onAuthLost }) => ReactNode; verifyHash: string | null;
  identity: boolean }`.

## Specialist input used
`consult-software-architect.md`:
- Adopted: F1/R10 (boundary per-file allowlist, A12), F2 (resend only with `mm_account_id`), F3 (Turnstile on sign-in),
  F5/R3 (`detectRuntime`, `detectMode` wrapper), F6/R6 (`authFetch`, per-App AI client, singleton removed, one retry in
  photo loader), R1 (client shape, `errors.ts`, constants), R2 (token store), R4 (sync `takeVerifyHash` before
  `/healthz`; verify in access + identity mode per Ming), R7 (Header), R8 (site key constant, `turnstile.ts` sole script
  injector, fail closed), R9 (`ready` state, sign-up `key` reset), R11 (tests), R12 (join boundary), R13 (out of scope).
- Changed: R5 `blocked` uses `SignInScreen` with the error instead of a separate screen with a sign-out button (A8);
  `createHttpRepo` keeps positional args and gets an optional trailing `auth` object instead of an options object
  (smaller diff, existing tests unchanged; A11); `turnstile` `action` field omitted (org-admin-api `turnstile.py`
  checks only `hostname`).
- Rejected: R14 split (Ming 2026-11-15: keep one ticket). F8 resolved by Ming (sub via another app, M-17).
- Open questions Q1–Q5: answered by Ming (Q1–Q3) or defaulted as A5 (Q4) and A6 (Q5).

## Assumptions
- **A1 — Ticket notes contain an unresolved git conflict** (`<<<<<<< HEAD` … `>>>>>>> main` in *Notes / answers from
  Ming*). Both sides are read as valid; the `main` side (M-25 done, site key) supersedes "wait for the site key". The
  orchestrator should clean the markers on `main`; this plan does not edit `ticket.md`.
- **A2 — Identity only in production-like runs.** `detectMode` returns `local` in `DEV`, so `pnpm dev` cannot exercise
  identity mode; the reviewer verifies through tests and the `dist/` grep; real checks are M-21.
- **A3 — Gate trigger.** Only `mode === "api" && auth === "identity"` shows the gate; `auth` missing/unknown/`access`
  → App as today (fails closed via 401 if the server is in identity mode). Never fall back to local.
- **A4 — `/verify-email` without a fragment** (e.g. reload after the hash was stripped) is a normal boot (no verify
  page); a fragment that fails `parseVerifyToken` → `invalid` with no network call.
- **A5 — Referrer-Policy stays in T-019.8** (`server/http.js`/`static.js` are T-019.8's files). The header part of
  ticket AC6 is met by T-019.8. **Orchestrator: add to T-019.8's ACs:** "`/verify-email` (and `/reset-password`) are
  served with `Referrer-Policy: no-referrer`; `static.test.ts` checks it." Residual risk until then is low: fragments
  never go into `Referer`, and the hash is stripped before any request.
- **A6 — Fresh token still 401 → distinct "no access" notice** (trivial, adopted): `authFetch` calls `onAuthLost` only
  after a retry with a freshly fetched token also got 401 (a refresh that fails with `session_invalid` goes through the
  store instead → `session_invalid` copy). Gate → `signed_out { error: { code: "no_access" } }` and `store.forget()`
  (token + `mm_account_id` dropped, **no** `/logout`, so other mmlabs apps on the device stay signed in and reload does not
  loop). `no_access` is a client-only `AuthErrorCode`, never accepted from a server body. Copy (proposal):
  "Tài khoản này chưa được cấp quyền dùng Tủ đồ của tôi. Hãy đăng nhập bằng tài khoản khác hoặc thử lại sau."
- **A7 — Verify retryable errors.** 429 and network/unknown return to `ready` with the error notice (the single-use
  token is still valid, so the user can press again); 422 → `invalid`. The T-019.11 `rate_limited` state stays in the
  type but the wiring does not use it.
- **A8 — `blocked` reuses `SignInScreen`.** `not_member` and `email_unverified` (after login or on restore) show
  `SignInScreen` with that error; `email_unverified` gets resend; the account id is kept (T-019.10 needs it for join).
  Signing in with another account replaces `mm_account_id`; the previous account session is not logged out.
- **A9 — Sign-up does not sign in.** After 201 the "sent" screen offers resend only if an `mm_account_id` already exists
  (usually not) and "Đăng nhập"; verifying then signing in is the path (consumers.md: no cookie from sign-up).
- **A10 — Turnstile theme** follows the app's `dark` class at mount (no live switch); `size: "flexible"` for 390px.
  Script failure or empty key → sign-up submit disabled with `turnstile_failed` copy; sign-in without Turnstile still
  works until `turnstile_required`.
- **A11 — Signatures.** `createHttpRepo(fetchFn, base, resize, auth?)` and `createHttpAiSettings(fetchFn, base, auth?)`
  keep positional args (existing tests untouched); `httpAiSettings` is removed (only `App.tsx` used it).
- **A12 — Boundary allowlist** (`boundary.test.ts`): in `src/features/auth` non-test files — `fetch(` only in
  `identityClient.ts`; `api.mmlabs` only in `config.ts`; `localStorage` and the string `mm_account_id` only in
  `accountId.ts`; `createElement("script")` and `challenges.cloudflare.com` only in `turnstile.ts`; `history.` only in
  `AuthRoot.tsx`; `console.`, `sessionStorage`, `document.cookie`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
  `EventSource`, `dangerouslySetInnerHTML`, `innerHTML` nowhere. Outside it: only `src/main.tsx` mentions
  `features/auth`, and only as `import("./features/auth/` (regex rejects `from "…features/auth`); `index.html` none.
- **A13 — Token cache timing:** valid while `now < receivedAt + max(0, expires_in − 60) × 1000`; lazy refresh in
  `getToken` (no timers). `expires_in` must be a finite number in 1…86400, else `unknown`.
- **A14 — Out of scope** (consult R13 + umbrella): cross-tab sign-out, account switcher / `/accounts`, join
  (T-019.10), `/reset-password` (T-019.12), CSP/HSTS/Referrer-Policy (T-019.8), any `server/**` change, abuse limits
  (T-019.13). 15-minute revocation lag accepted (umbrella A15).
- **A15 — Hotspots.** `src/main.tsx`, `src/App.tsx`, `src/data/repo.http.ts`, `src/features/auth/*`. No other ticket is
  `IN_PROGRESS`/`REVIEW`/`DONE`; T-019.10 and T-019.12 (BACKLOG) will edit `src/features/auth/` after this merges and
  rebase on it. `work/backlog.md` is changed only on `main` (D16).
- **A16 — Size.** About 700 product + 900 test lines across ~25 files, over the ~400-line guide; Ming chose one ticket.
  Implementer commits in the *Approach* order so the reviewer can read it in steps.

## Blocking questions
None.

## Split proposal
None. Ming 2026-11-15: "Keep one ticket (no 7a/7b split)". Size note in A16.
