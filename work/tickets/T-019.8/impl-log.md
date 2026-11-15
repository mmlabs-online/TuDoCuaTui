## Attempt 1 — 2026-11-15

### Files touched
| File | Required because |
|---|---|
| server/http.js | Export `SPA_CSP` (built from a directive array) and `HSTS`; HSTS added to `SECURITY_HEADERS` (AC1, AC2, AC4) |
| server/static.js | `referrerPolicyFor`; CSP + HSTS on 200 and 404 static responses; `no-referrer` override on `/verify-email`, `/reset-password` (AC1-AC4) |
| server/static.test.ts | New "security headers" tests (AC1-AC5, R8) |
| server/app.test.ts | HSTS in the every-response test; CSP-scope test; `/verify-email` override test (AC1-AC3, AC6) |
| server/README.md | One paragraph on response security headers |

### Tests added / changed
- server/static.test.ts › SPA responses carry the CSP; CSP directives are exact; CSP has no unsafe sources and keeps Turnstile out of connect-src; SPA responses carry HSTS; `/verify-email` and `/reset-password` -> no-referrer; other paths get no Referrer-Policy override; referrerPolicyFor; source index.html has no inline script or style
- server/app.test.ts › every response has ... HSTS (extended); SPA CSP only on static responses; `/verify-email` through the app -> no-referrer, `/` unchanged

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean, no errors
- format:check: "All matched files use the correct format" (236 files)
- test: Test Files 88 passed | 8 skipped (96); Tests 1094 passed | 167 skipped (1261)
- build: built in 607ms. `dist/index.html` has one `<script type="module" crossorigin src="/assets/index-BIsPCg6P.js">`, one stylesheet link, icon link and meta tags; no inline script body and no `<style>`. `dist/assets/*.css` keeps the `@import https://fonts.googleapis.com/css2?...` (covered by `style-src`).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Skipped tests (167) include DB tests (api.db.test.ts), so the unchanged photo CSP assertion was not run locally; CI covers it.
- Real-browser CSP check is Ming verification (plan).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +167 / -3 lines in tracked files (impl-log excluded); nothing committed.
