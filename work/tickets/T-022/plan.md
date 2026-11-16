Status: READY

# Plan — T-022: Hotfix — CSP blocks photo upload (connect-src data:/blob:)

## Feature summary
Not a feature-list item: production regression from T-019.8. Ticket, *Feature reference*: "the T-019.8 CSP
`connect-src 'self' https://api.mmlabs.online` blocks `fetch(data:…)` / `fetch(blob:…)` in `urlToBlob`
(`src/data/photos.ts:31-35`), called from `src/data/repo.http.ts:82-83` before the upload."
Ticket scope: "Add `blob:` and `data:` to `connect-src` in the SPA CSP (`server/http.js`), keeping everything else
(no `unsafe-*`, Turnstile still not in `connect-src`)."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `connect-src` is exactly `'self' https://api.mmlabs.online blob: data:`; no other directive changes; tests assert it. | `server/static.test.ts` › "CSP directives are exact" expects `"connect-src": ["'self'", "https://api.mmlabs.online", "blob:", "data:"]` and every other directive unchanged; "CSP has no unsafe sources and keeps Turnstile out of connect-src" still passes. `git diff server/http.js` touches only line 12. `server/app.test.ts` compares to `SPA_CSP` by import, so it needs no edit and must still pass. |
| 2 | In a browser served with the real CSP, saving an item with a picked photo sends `PUT /api/items/<id>/photo` and shows no CSP violation. | Browser regression check below. |
| 3 | All checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` green. |

### Browser regression check (reviewer, Playwright/Chromium)
1. `pnpm build`.
2. Start the real server in access mode, auth off, no DB:
   `env -i PATH="$PATH" NODE_ENV=development TUDO_ACCESS_DISABLED=1 TUDO_OWNER_SUB=00000000-0000-4000-8000-000000000001 PORT=3999 node server/index.js`
   (expects "auth: access (dev, off)", "drive not configured", "database not configured"). `/healthz` answers
   `{status:"ok", auth:"access"}`, so the SPA picks api mode at runtime (`src/data/mode.ts`).
3. In Playwright (default `bypassCSP: false`), do **not** route the document or `/assets/*`: they must come from the
   real server so the real `SPA_CSP` header applies. Without a DB `PUT /api/items/:id` answers 503 and the photo upload
   would never start, so mock only `/api/**` with `page.route`: `GET /api/items` → `{items: []}`, `GET /api/locations`
   → `{locations: []}`, `PUT /api/items/<id>` → `{item: <ItemRow>}` (copy the row fixture shape from
   `src/data/repo.http.test.ts`, with the requested id and `primary_photo_id: null`), `PUT /api/items/<id>/photo` →
   record the request (method, URL, `content-type`, body size) and fulfil `{item: {...row, primary_photo_id: <uuid>}}`.
4. Before navigation, `addInitScript` that pushes every `securitypolicyviolation` event
   (`violatedDirective`, `blockedURI`) into `window.__csp`; also collect console messages containing
   "Content Security Policy".
5. Open `/`, assert the response `content-security-policy` header contains `connect-src 'self' https://api.mmlabs.online blob: data:`.
   Open the editor (add item), enter a name, `setInputFiles` a small JPEG on the photo input, save.
6. Pass: exactly one `PUT /api/items/<id>/photo` was recorded, `content-type: image/jpeg`, non-empty body;
   `window.__csp` is empty and no CSP console error; no "chưa lưu được ảnh" error toast.
7. Negative control (recommended, one run): repeat on the pre-fix code (`git stash` the `server/http.js` change, or
   checkout `main`, restart the server; no rebuild needed since the CSP is server-side) → no photo PUT, and a
   `connect-src` violation with `blockedURI` `data` or `blob`. This proves the check detects the bug.
8. Stop the server.

## Ming verification after merge
After deploy, on production: add or edit an item with a photo from the phone → photo shows after save; Network tab
shows `PUT /api/items/<id>/photo` 200; `curl -sI https://tudocuatui.mmlabs.online/` shows the new `connect-src`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/http.js` | Line 12: `["connect-src", "'self'", "https://api.mmlabs.online", "blob:", "data:"]`. Nothing else. | AC1, AC2 (the fix) |
| `server/static.test.ts` | "CSP directives are exact": `connect-src` expectation gets `"blob:", "data:"`. Add to "CSP has no unsafe sources…": `expect(csp["script-src"]).not.toContain("data:")` and `not.toContain("blob:")` (guards that the widening stays in `connect-src`/`img-src`). | AC1 |
| `server/README.md` | Line 67 (Response headers paragraph): add one sentence: "`connect-src` also allows `blob:` and `data:` because the upload path reads the picked photo with `fetch()` before resizing (T-022)." The README does not quote the full CSP, so nothing else changes. | docs |

`server/app.test.ts` asserts `toBe(SPA_CSP)` by import; it is not modified (it must still pass).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/static.test.ts` › "CSP directives are exact" (updated) | AC1: new `connect-src`, other directives unchanged |
| `server/static.test.ts` › "CSP has no unsafe sources and keeps Turnstile out of connect-src" (extended) | AC1: no `unsafe-*`; Turnstile not in `connect-src`; `data:`/`blob:` not in `script-src` |

## Approach
1. Edit `server/http.js` line 12. 2. Update the two tests. 3. One README sentence. 4. Run Checks.
Rules: R3 unaffected (no secrets). R7: only these three files. R8: CSP is asserted by unit tests. R10: no Figma
Make files. Security note: `blob:`/`data:` in `connect-src` lets script fetch local in-memory URLs only; it opens no
network egress, so the T-019.7/T-019.8 constraint (Turnstile and other origins kept out of `connect-src`) holds.
`script-src` stays `'self' https://challenges.cloudflare.com`.

## Specialist input used
None (no consult files). T-019.8 `security-review.md` constraint "`connect-src 'self'` + `api.mmlabs.online`"
was about network origins; `blob:`/`data:` are not origins, so it still holds.

## Assumptions
- The upload path stays `fetch(data:|blob:)` → resize; changing `urlToBlob` to avoid `fetch` is out of scope.
- Chromium in Playwright enforces `connect-src` for `fetch(data:)`/`fetch(blob:)` like the production browsers.

## Blocking questions
None

## Split proposal
None
