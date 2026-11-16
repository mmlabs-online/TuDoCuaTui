## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed: commit 5e5d413 (fix) against d899067 (plan). HEAD is now 5bcf4f9, which only adds `security-review.md`.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: exit 0, "All matched files use the correct format." (255 files)
- test: exit 0, Tests 1247 passed | 205 skipped (1452). Matches impl-log.
- build: exit 0, "built in 353ms" (`dist/assets/index-CzSIUIRz.js` 265.32 kB)

### Acceptance criteria
- [x] `connect-src` is exactly `'self' https://api.mmlabs.online blob: data:`; no other directive changes; tests assert it.
  Evidence: `server/http.js:12` is the only line changed in `server/http.js` (`git diff d899067 5e5d413`). `server/static.test.ts:203` "CSP directives are exact" pins the full directive set with the new `connect-src`. `server/static.test.ts:219` "CSP has no unsafe sources…" now also checks `script-src` has no `data:`/`blob:` (lines 225-226). `server/app.test.ts:144` compares the header to the imported `SPA_CSP`. All of these pass. Directives containing `blob:`/`data:` in `SPA_CSP` are only `img-src 'self' blob: data:` and `connect-src 'self' https://api.mmlabs.online blob: data:`. `script-src` is `'self' https://challenges.cloudflare.com`, `default-src` is `'self'`, and there is no `worker-src`/`child-src`.
- [x] In a browser served with the real CSP, saving an item with a picked photo sends `PUT /api/items/<id>/photo` and shows no CSP violation.
  Evidence: Playwright 1.63 with Chrome (`bypassCSP` false), viewport 390x844, dark color scheme. Ran on the real `dist/` served by `env -i PATH=… NODE_ENV=development TUDO_ACCESS_DISABLED=1 TUDO_OWNER_SUB=… PORT=3999 node server/index.js`. The server logged "auth: access (dev, off)", "drive not configured", "ai not configured", "database not configured". `/healthz` returned `{"status":"ok","auth":"access"}`. Only `**/api/**` was routed; the document, `/assets/*` and `/healthz` came from the real server. The response `content-security-policy` contained `connect-src 'self' https://api.mmlabs.online blob: data:`. Steps: Thêm món đồ → name → `setInputFiles` on a real 779-byte JPEG (generated with canvas) → Lưu món đồ.
  - Fixed (5e5d413): API calls were `GET /api/items`, `GET /api/locations`, `PUT /api/items/<id>`, `PUT /api/items/<id>/photo`, then `GET /api/photos/<photo id>`. There was exactly one photo PUT: `content-type: image/jpeg`, body 779 bytes. `securitypolicyviolation` events: []. CSP console messages: []. No "chưa lưu được ảnh" text. `scrollWidth` was 390 (no horizontal overflow).
  - Negative control (`server/http.js` from d899067, server restarted, same `dist/`): the header had `connect-src 'self' https://api.mmlabs.online`. The API calls stopped after `PUT /api/items/<id>`, with no photo PUT. Violations: `[{violatedDirective: "connect-src", blockedURI: "data"}]`. The console showed "Fetch API cannot load data:image/jpeg… Refused to connect because it violates the document's Content Security Policy." This reproduces Ming's bug, so the check does detect it. Afterwards `server/http.js` was restored and `git status` was clean except for this file.
- [x] All checks pass. See Checks above.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R3: no secrets, and the CSP is widened only for local `blob:`/`data:` URLs, which adds no network origin. R7: the diff is limited to the three planned files plus the ticket's work files. R8: the CSP is pinned by unit tests and the checks are green. R10: no Figma Make files touched.

### Nits (do not block)
- In the negative-control run, no "chưa lưu được ảnh" toast was visible 3 s after save. It was probably already dismissed, or it is shown as a transient toast. This does not affect the verdict: the missing PUT and the CSP violation are the bug's signature.

### Follow-ups (out of scope)
- From security-review.md: pass the picked `File` straight to `resize` instead of round-tripping through `fetch(data:|blob:)` in `urlToBlob` (`src/data/photos.ts:31-35`). That would let `blob:`/`data:` leave `connect-src` again.
- An automated browser smoke test of photo upload under the real CSP would catch future CSP regressions. None exists today.
