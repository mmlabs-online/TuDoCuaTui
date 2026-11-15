## Attempt 1 — 2026-11-15
Verdict: PASS

Reviewed branch `claude/magical-cori-2ssw8l` at 138916d (`git diff origin/main...HEAD`).

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, no errors.
- format:check: "All matched files use the correct format", 236 files.
- test: Test Files 88 passed | 8 skipped (96); Tests 1094 passed | 167 skipped (1261). This matches impl-log exactly. The skipped tests are the `*.db.test.ts` suites, which need a database.
- build: built OK. `dist/index.html` has one module `<script src="/assets/index-BIsPCg6P.js">`, one stylesheet link, the icon link and meta tags. It has no inline script and no `<style>`.

Real-server and browser check (reviewer):
- The real `node server/index.js` served `dist/`, with no `.env*` read and an explicit `env -i`:
  - access mode with auth disabled (`TUDO_ACCESS_DISABLED=1`, dummy owner sub, port 3917);
  - identity mode (`TUDO_AUTH_MODE=identity`, `MM_IDENTITY_ISSUER=http://localhost:9`, port 3918).
- `curl -I /verify-email` returned `Referrer-Policy: no-referrer`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, the exact `SPA_CSP`, and `Cache-Control: no-cache`.
- `curl -I /` returned `Referrer-Policy: strict-origin-when-cross-origin`, plus HSTS and the CSP.
- `curl -I /healthz` returned HSTS and no CSP.
- Playwright Chromium ran at 390x844 in light and dark. Access mode loaded `/` and `/verify-email`. Identity mode loaded `/`, then the sign-up screen.
  - CSP: no `securitypolicyviolation` events and no CSP console errors in any run.
  - Fonts: the Google Fonts CSS and all `fonts.gstatic.com` woff2 files returned 200. `document.fonts` shows Be Vietnam Pro loaded, and the body font is `"Be Vietnam Pro", sans-serif`.
  - Layout: `scrollWidth` was 390 in every run. The dark-mode screenshot rendered correctly.
  - Other console errors: only the expected `/api/items` 503 (`db_unavailable`, no DB).
  - Turnstile: on sign-up the browser *requested* `https://challenges.cloudflare.com/turnstile/v0/api.js`, so the CSP allowed it. The sandbox egress proxy then refused the tunnel (`ERR_TUNNEL_CONNECTION_FAILED`, not a CSP block). The widget's own iframe and inline styles could therefore not be exercised here. That remains Ming verification step 3.

### Acceptance criteria
- [x] CSP header on SPA responses as in A20 — evidence:
  - `server/http.js` defines `CSP_DIRECTIVES` and `SPA_CSP`.
  - `server/static.js` sets the CSP on the 200 and 404 static responses.
  - static.test.ts tests passed: "SPA responses carry the CSP" (`/`, `/index.html`, deep path, asset, missing asset 404, HEAD) and "CSP directives are exact".
  - app.test.ts › "SPA CSP only on static responses" passed.
  - The curl output above matches.
- [x] `Strict-Transport-Security` header — evidence: `SECURITY_HEADERS` in `server/http.js`, plus the static.js headers. static.test.ts › "SPA responses carry HSTS" and app.test.ts › "every response has … HSTS …" (`/`, `/healthz`, `/readyz`, `/api/x`, `/assets/nope.js`) both passed. curl shows it on `/healthz`.
- [x] `/verify-email` and `/reset-password` send `Referrer-Policy: no-referrer`, and `static.test.ts` checks it — evidence:
  - `referrerPolicyFor` in `server/static.js`.
  - static.test.ts tests passed: "`/verify-email` and `/reset-password` -> no-referrer" (with a trailing slash and with a query), "other paths get no Referrer-Policy override", and "referrerPolicyFor".
  - app.test.ts › "`/verify-email` through the app -> `no-referrer`" passed, confirming that the writeHead value overrides setHeader.
  - curl confirms it.
- [x] The CSP allows Turnstile in `script-src` and `frame-src` and keeps it out of `connect-src` — evidence: "CSP directives are exact" and "CSP has no unsafe sources and keeps Turnstile out of connect-src" passed. In the browser, the Turnstile script request was issued with no violation.
- [x] App and fonts still load; `static.test.ts` checks the headers; all checks pass — evidence: the checks above, the Playwright run (fonts 200 and loaded, app rendered, zero violations), and "source index.html has no inline script or style" passed.
- [x] Plan AC6: `/api/photos` keeps its own CSP — evidence: `server/photos.js` is not in the diff, and `/api/x` has no SPA CSP (app.test.ts).
- [x] Plan AC7: local/dev mode is unaffected (R1) — evidence: the diff has no changes under `src/`, in `index.html` or in `vite.config.ts`.

Ming verification after merge (copied from the plan, for the PR):
1. `curl -sI https://tudocuatui.mmlabs.online/` shows the CSP equal to `SPA_CSP` and HSTS. `/verify-email` shows `Referrer-Policy: no-referrer`.
2. In access mode on phone and desktop, check the console for CSP violations on these flows: load, list, edit and save with a photo, the photo grid (blob images), the AI settings modal, and sign-out/in. Fonts should render as Be Vietnam Pro / Fraunces.
3. In identity mode (M-21), check that sign-in, sign-up with the Turnstile widget visible and solvable, the `/verify-email` button, token refresh and photos all work with no CSP violation.
4. Violations from Cloudflare-injected features (Web Analytics, JS detections, email obfuscation, Rocket Loader) are expected.
5. Rollback: revert the T-019.8 merge. HSTS stays cached in browsers, which is harmless.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: server-only change; local mode is untouched.
- R3: only public origins.
- R7: every changed file is in the plan's file list (plus the ticket's own work files).
- R8: `referrerPolicyFor` and the CSP string have unit tests.
- R9: no UI change, and 390px light/dark was verified in the browser.
- R10: `vite.config.ts`, `.figma/` and `AGENTS.md` are untouched.

Code notes:
- `referrerPolicyFor` receives the request path, not `cacheTarget`, so the SPA fallback still gets the override.
- Case-sensitive matching and look-alike prefixes are covered.
- The 404 path also carries the CSP and HSTS.

### Nits (do not block)
- `impl-log.md` "Scope self-check" says "nothing committed", but the work is in commit 138916d. This is probably written before the orchestrator commits. Harmless.
- `static.test.ts` › "SPA responses carry HSTS" hard-codes the HSTS string instead of importing `HSTS`. This is deliberate, since it pins the value, and is fine.

### Follow-ups (out of scope)
- Ming should confirm in a real network that the Turnstile widget renders with no `style-src` violation (plan A2). If it needs inline styles, a follow-up adds `'unsafe-inline'` to `style-src` only.
- Plan A6: in the degraded local fallback served by the Node server, the Unsplash demo images are blocked by `img-src`. This is accepted.
