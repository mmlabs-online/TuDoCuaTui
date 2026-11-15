# Security review — T-019.8

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor)

Read-only; checks not run by the auditor. **No 🔴.** The CSP matches the plan, has no unsafe sources, and the header override order holds on every static path; no practical bypass of the token-page Referrer-Policy.

### 🟡
- **Y1 — Turnstile residual described as tighter than it is** (`server/http.js:8,13`, plan A5). Keeping `challenges.cloudflare.com` out of `connect-src` blocks fetch/XHR/beacon only; a compromised Turnstile script or any XSS can still reach Cloudflare via `frame-src`/`script-src` URLs, and navigation is not governed by CSP. Real control: vendor trust (D35) + lazy load on sign-up (`turnstile.ts:21`). Fix: docs wording only (README / A5).
- **Y2 — server/client path sets differ** (`server/static.js:58-64` vs `src/lib/boot.ts:3,13`). Server sends `no-referrer` for `/verify-email` and `/verify-email/`; the client takes and strips the hash only on exact `/verify-email`. Not a Referer leak (fragments never go into Referer; server set ⊇ client set). Follow-up: share one path list (also for T-019.12 `/reset-password`).
- **Y3 — Turnstile inline styles unverified** (`server/http.js:9`). No `'unsafe-inline'` in `style-src` is right for the app; whether Turnstile's `api.js` injects inline styles into the parent page needs a real-browser check (Ming check 3). If needed, widen only `style-src(-attr)`, never `script-src`.

### 🟢 Verified
- CSP directives (`server/http.js:6-21`): no `unsafe-*`, `*`, `http:`, `data:` in `script-src`; `connect-src 'self' https://api.mmlabs.online`; `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`.
- No same-origin script gadget: `nosniff` everywhere; photos `image/jpeg` (`photos.js:242`), API JSON, unknown files `application/octet-stream` (`static.js:27`).
- Photo CSP untouched (`photos.js:241-248`, 200 at `:318`, 304 at `:293`); `/api/*` returns at `app.js:89` before `serveStatic`.
- Override order: `writeHead(obj)` replaces earlier `setHeader` values — 200, SPA fallback, both 404s, HEAD (`static.js:87-118`).
- Referrer matching on the raw pathname after query/fragment strip (`app.js:65`, `static.js:61-64`); case/encoding/double-slash variants don't match, and the client doesn't treat them as token pages either.
- HSTS `max-age=31536000; includeSubDomains`, no preload: affects only `*.tudocuatui.mmlabs.online`; ignored on http://localhost.
- JSON error responses without CSP (`app.js:64,105,113`) are acceptable (nosniff, JSON).

### Recommendations
1. Reword A5 / README on Y1 (docs).
2. Follow-up: one shared token-page path list for `takeVerifyHash`, `referrerPolicyFor` and T-019.12.
3. Ming check 3: watch for `style-src` violations while the Turnstile widget renders.
4. Optional later: `connect-src https://api.mmlabs.online/api/v1/`, Trusted Types, `report-to` endpoint (scope decision for Ming).

### Risks
Cloudflare zone features that inject inline scripts would be blocked (A4); HSTS cached for a year; no CSP reporting, so production violations show only in DevTools.
