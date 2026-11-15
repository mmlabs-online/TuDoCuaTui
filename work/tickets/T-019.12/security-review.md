# Security review — T-019.12

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor)

Read the working tree (no git/checks run); client matches org-admin-api `consumers.md` §"Password reset". **No 🔴, no 🟡.**

### 🟢 Low
1. The raw `#token=…` outlives the page: `link` in `src/main.tsx:14`, the closure at `:33`, `resetHash` prop `src/features/auth/AuthRoot.tsx:17` (page copy dropped at `ResetPasswordPage.tsx:33,38`). Never stored, rendered or logged.
2. Leaving the page in a retryable state keeps a live token in memory (no persistence, no third-party script). Acceptable.
3. Double-submit guard reads render-time state (`ResetPasswordPage.tsx:28`, `ResetPasswordScreen.tsx:29`); a `useRef` in-flight flag like `AuthGate.tsx:68` would be timing-independent. Same pattern on forgot (`AuthGate.tsx:246`), harmless (single-use Turnstile).
4. `src/lib/boot.test.ts:44-58` sets the order itself; the real guarantee is `src/main.tsx:14-16` (verified: no network before `takeTokenHash`, no third-party script in `index.html`). A source-order test would pin it.
5. One-path-list scan (`src/shared/tokenPages.test.ts:39`) misses template strings; parity test `server/tokenPages.parity.test.ts:7-28` is meaningful.
6. UX: a `network` error after the reset was applied leads to `token_invalid` on retry; a password `validation_error` is treated as a bad link.
7. `/reset-password` no-referrer tested only at `serveStatic` level (`server/static.test.ts:237-250`), not through the app (`server/app.test.ts:153-161` covers `/verify-email`).

### Verified
- `takeTokenHash` (`src/lib/boot.ts:11-20`) copies then `replaceState` to the canonical path synchronously before any network call; `parseResetToken` anchored `^#token=([A-Za-z0-9_-]{32,128})$` (`validation.ts:11,96`); malformed → `invalid` with no request.
- No request on mount (D36); token only in the POST body (`identityClient.ts:158-160`); never in the DOM; no `console.` (`boundary.test.ts:30-40`).
- Reset is public (`credentials: "omit"`, no `X-MM-App`, `identityClient.ts:58-59`); forgot is cookie class (`:155-157`); `cache: "no-store"`; empty 202 parses safely (`:68-74`).
- No enumeration: static sent copy, no email echo (`copy.ts:24-25`, `ForgotPasswordScreen.tsx:19-27`); bug codes → `unknown`.
- Turnstile: never sends without a token (`AuthGate.tsx:247-250`), spent on success and failure (`:256,260`), cleared on screen change (`:186`); no third-party script on the reset page.
- Passwords dropped after success (`ResetPasswordScreen.tsx:11-24,81-89`); preview logs only the length (`AuthPreview.tsx:128`).
- Error lookup safe (`errors.ts:45-48`, `copy.ts:142`).
- Path lists agree (`src/shared/tokenPages.ts:9-15` vs `server/static.js:61-67`); `NO_REFERRER_PATHS` only gained `export`.
- Boundary allowlist holds; stored `mm_account_id` after a reset → `session_invalid` clears it (`tokenStore.ts:72-76`); local mode unaffected (`boot.ts:23-26`).

### Recommendations
R-a clear the copied hash after use (optional); R-b `useRef` in-flight guard in `ResetPasswordPage.reset`; R-c source-order test on `main.tsx` and an `app.test.ts` case for `/reset-password`; R-d catch template strings in the one-list scan.

### Risks / open questions
Access tokens survive a reset up to 15 min (upstream design). `no-referrer` depends on the Node server (`server/static.js`); CLAUDE.md still names Cloudflare Pages (D5, superseded by T-007/T-015 self-hosting) — confirm no other host serves the token pages. On a possibly-applied `network` error, offer "Tiếp tục" too?
