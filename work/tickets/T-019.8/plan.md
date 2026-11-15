Status: READY

# Plan — T-019.8: CSP and HSTS for the SPA

## Feature summary
T-019.8 is not in `docs/feature-list.md` (T- ticket). It is a slice of the approved umbrella plan `work/tickets/T-019/plan.md`.

- Umbrella *Files* row: "`server/http.js` / `server/static.js` (+ `static.test.ts`) | CSP and HSTS on SPA responses (A20) | AC3 defence".
- Umbrella A20: "**CSP + HSTS (T-019.8) is included,** because the token now lives in JS memory; it must be enforced before
  M-21 (`connect-src 'self' https://api.mmlabs.online`, `img-src 'self' blob: data:`, fonts.googleapis/gstatic)."
- Umbrella split: "**T-019.8 — CSP/HSTS.** ACs: CSP header on SPA responses (A20), HSTS; app and fonts load; `static.test.ts`
  checks the header."
- Decision D35: "TuDo has its own sign-up (with Turnstile) and `/verify-email` page". This amends umbrella A8, so the
  CSP has to allow Turnstile.
- T-019.7 plan A5: "`/verify-email` (and `/reset-password`) are served with `Referrer-Policy: no-referrer`;
  `static.test.ts` checks it."
- T-019.7 security review, *What T-019.8's CSP must allow*: "`connect-src 'self' https://api.mmlabs.online` (not
  `challenges.cloudflare.com`)"; "`script-src 'self' https://challenges.cloudflare.com`; `frame-src
  https://challenges.cloudflare.com`"; "`img-src 'self' blob: data:`"; "`frame-ancestors 'none'`, HSTS". S3: "T-019.8 CSP
  must not put `challenges.cloudflare.com` in `connect-src` (only `script-src`/`frame-src`)", and "record the residual in
  T-019.8".

### Target headers (exact values)
`SPA_CSP` (one line, directives in this order, separated by `; `):
```
default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self' https://api.mmlabs.online;
frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```
`HSTS`: `max-age=31536000; includeSubDomains` (no `preload`).
`Referrer-Policy`: `no-referrer` on `/verify-email` and `/reset-password` (with or without one trailing `/`). Every other
path keeps `strict-origin-when-cross-origin`.

Why these sources (checked in the code):
- Scripts: the built shell loads only `/assets/*.js` (`index.html:13`, a module `src`). `.figma/make/site.json` has no
  `analytics` or `customScripts`, and `addBypassLinks` is false, so `figmaSiteConfiguration` (`vite.config.ts:184-238`)
  injects no inline `<script>` or `<style>`. The other Figma plugins are `apply: "serve"` (dev only). Turnstile is
  appended as `https://challenges.cloudflare.com/turnstile/v0/api.js` (`src/features/auth/turnstile.ts:16`).
- Styles: Tailwind is bundled into `/assets/*.css`. `src/index.css:1` `@import`s `https://fonts.googleapis.com/css2…`,
  which loads font files from `fonts.gstatic.com`. React `style={…}` props are set through the CSSOM (DOM properties),
  which `style-src` does not govern. There are no `<style>` tags, `setAttribute("style")`, `innerHTML`, `eval` or
  `new Function` in `src/`. So no `'unsafe-inline'` and no `'unsafe-eval'`.
- Connect: same-origin `/api`, `/healthz`; Identity `https://api.mmlabs.online` (`src/features/auth/config.ts:2`).
- Images: `/api/photos/<id>` fetched into `blob:` (D34), `data:` for Vite-inlined small assets, `'self'` for the favicon.
- Frames: Turnstile iframe only. `frame-ancestors 'none'` matches the existing `X-Frame-Options: DENY`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | CSP header on SPA responses as in plan A20 (`connect-src 'self' https://api.mmlabs.online`, `img-src 'self' blob: data:`, Google Fonts). | `server/static.test.ts` › "SPA responses carry the CSP" (`/`, `/index.html`, fallback `/some/deep/path`, `/assets/x.js`, HEAD `/`, and the `/assets/missing.js` 404). › "CSP directives are exact" parses `SPA_CSP` into a directive map and checks every source list. `server/app.test.ts` › "SPA via the app carries CSP; /api and /healthz responses do not get the SPA CSP". |
| 2 | `Strict-Transport-Security` header. | `server/static.test.ts` › "SPA responses carry HSTS". `server/app.test.ts` (extended header test) › HSTS `max-age=31536000; includeSubDomains` on `/`, `/healthz`, `/readyz`, `/api/x`, `/assets/nope.js`. |
| 3 | `/verify-email` (and `/reset-password`) are served with `Referrer-Policy: no-referrer`; `static.test.ts` checks it (T-019.7 plan A5). | `server/static.test.ts` › "`/verify-email` and `/reset-password` (± trailing slash) → `no-referrer`; `/`, `/verify-emailx`, `/verify-email/x`, `/assets/x.js` → no override". `server/app.test.ts` › "`/verify-email` through the app → `no-referrer` (overrides the site-wide value); `/` stays `strict-origin-when-cross-origin`". Unit: `referrerPolicyFor` cases. |
| 4 | CSP allows Cloudflare Turnstile (`https://challenges.cloudflare.com` in `script-src` and `frame-src`) for sign-up (A8 changed). | `server/static.test.ts` › "CSP directives are exact": `script-src` = `'self' https://challenges.cloudflare.com`, `frame-src` = `https://challenges.cloudflare.com`. `challenges.cloudflare.com` must not appear in `connect-src`, `default-src` or `img-src`. |
| 5 | App and fonts still load; `static.test.ts` checks the headers; all checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` green. Then `pnpm build` and read `dist/index.html`: only `<script type="module" … src="/assets/…">`, `<link rel="modulepreload|stylesheet" href="/assets/…">`, `<link rel="icon">` and meta tags; no inline `<script>` body and no `<style>`. `grep -o "https://fonts.googleapis.com[^)\"]*" dist/assets/*.css` shows the font `@import` is kept (covered by `style-src`). `server/static.test.ts` › "source index.html has no inline script or style" guards the shell. Real browser load is under *Ming verification*. |
| 6 | `/api/photos` keeps its own CSP (`default-src 'none'; sandbox`). | `server/photos.js:241-248` unchanged (`git diff --stat` shows no `server/photos.js`). The existing assertion `server/api.db.test.ts:696` is still green in CI. The SPA CSP is set only in `serveStatic`, never on `/api/*`, and AC1's app test checks that `/api/x` has no SPA CSP. |
| 7 | Local / dev mode is unaffected (R1). | No change under `src/`, `vite.config.ts` or `index.html` (`git diff --stat`). The Vite dev server and the Figma Make preview never run `server/static.js`. |

## Ming verification after merge
To do in the release that also ships T-019.7. That release is the precondition for M-21 (switch to Identity, Access still on).
1. `curl -sI https://tudocuatui.mmlabs.online/` (with an Access session cookie, or via the browser's Network tab):
   `Content-Security-Policy` equals `SPA_CSP`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` is present.
   `/verify-email` shows `Referrer-Policy: no-referrer`.
2. **Access mode (today's production):** open the app on phone and desktop. The DevTools console shows no CSP violation
   from the app on load, list, edit and save with a photo, the photo grid (blob images), the AI settings modal, or
   sign-out/in through Access. Fonts render as Be Vietnam Pro / Fraunces, not a system fallback.
3. **Identity mode (M-21):** sign-in, sign-up with the Turnstile widget visible and solvable, `/verify-email` button,
   token refresh, and photos all work with no CSP violation in the console.
4. Violations that come from Cloudflare-injected features (Web Analytics beacon `static.cloudflareinsights.com`, Bot
   Fight / JS detections, email obfuscation, Rocket Loader) are expected. They do not affect the app (A4). If one of
   them is wanted, tell the loop and a follow-up widens the CSP.
5. Rollback if the app breaks: revert the T-019.8 merge (headers only, no data change). HSTS stays cached in browsers
   for up to a year. That is harmless because the site is HTTPS-only behind Cloudflare.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/http.js` | Export `SPA_CSP` (the exact string above, built from a directive array joined with `"; "`) and `HSTS`. Add `"Strict-Transport-Security": HSTS` to `SECURITY_HEADERS`. Keep the existing three headers unchanged. | AC1, AC2, AC4 |
| `server/static.js` | Import `SPA_CSP`, `HSTS`. Export a pure `referrerPolicyFor(urlPath)` that returns `"no-referrer"` for `/verify-email`, `/verify-email/`, `/reset-password`, `/reset-password/` and `undefined` otherwise. In `serveStatic`, add `Content-Security-Policy` and `Strict-Transport-Security` to the 200 headers, plus `Referrer-Policy` when `referrerPolicyFor(urlPath)` is set (use the requested `urlPath`, not `cacheTarget`). In `notFound`, add CSP and HSTS too. | AC1–AC4 |
| `server/static.test.ts` | New tests below. Existing tests unchanged. | AC1–AC5, R8 |
| `server/app.test.ts` | Extend the "every response has…" test with HSTS. Add the CSP-scope test and the `/verify-email` override test. | AC1–AC3, AC6 |
| `server/README.md` | One short paragraph next to the CSRF note: response security headers (site-wide set, SPA CSP, HSTS, `no-referrer` paths, photo CSP), and a note to widen `SPA_CSP` when a new external origin is added. | docs |

No other files. Specifically not `src/**`, `index.html`, `vite.config.ts` or `.figma/**` (R10), `server/photos.js`, `server/app.js`, and no deploy config.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/static.test.ts` › "SPA responses carry the CSP": `/`, `/index.html`, `/some/deep/path`, `/assets/x.js`, HEAD `/` → `content-security-policy` === `SPA_CSP`; `/assets/missing.js` 404 also has it | AC1 |
| `server/static.test.ts` › "CSP directives are exact": parse `SPA_CSP` (`split(";")`, trim, first token = name) → `default-src ['self']`, `script-src ['self', challenges]`, `style-src ['self', fonts.googleapis]`, `font-src ['self', fonts.gstatic]`, `img-src ['self', blob:, data:]`, `connect-src ['self', https://api.mmlabs.online]`, `frame-src [challenges]`, `object-src ['none']`, `base-uri ['none']`, `form-action ['self']`, `frame-ancestors ['none']`; no other directive; no directive repeated | AC1, AC4 |
| `server/static.test.ts` › "CSP has no unsafe sources and keeps Turnstile out of connect-src": string has no `'unsafe-inline'`, `'unsafe-eval'`, `*` or `http:`; `challenges.cloudflare.com` is absent from `connect-src`, `default-src` and `img-src` | AC4, S3 |
| `server/static.test.ts` › "SPA responses carry HSTS": `/` and `/assets/x.js` → `max-age=31536000; includeSubDomains` | AC2 |
| `server/static.test.ts` › "`/verify-email` and `/reset-password` → `Referrer-Policy: no-referrer`": both paths, with and without a trailing `/`, and with a query (`/verify-email?x=1`, stripped by the test server) → `no-referrer`, body is index.html, `no-cache` | AC3 |
| `server/static.test.ts` › "other paths get no Referrer-Policy override": `/`, `/verify-emailx`, `/verify-email/x`, `/VERIFY-EMAIL`, `/assets/x.js` → header absent (serveStatic alone sets none) | AC3 |
| `server/static.test.ts` › "referrerPolicyFor": pure cases from the two rows above, plus `""` → `undefined` | AC3, R8 |
| `server/static.test.ts` › "source index.html has no inline script or style": read `new URL("../index.html", import.meta.url)`; every `<script` has `src=`; no `<style` | AC5 |
| `server/app.test.ts` › extended "every response has nosniff, Referrer-Policy, X-Frame-Options DENY, HSTS and an X-Request-Id" (same five paths) | AC2 |
| `server/app.test.ts` › "SPA CSP only on static responses": `/` → `SPA_CSP`; `/healthz`, `/api/x` (401) → no `content-security-policy` | AC1, AC6 |
| `server/app.test.ts` › "`/verify-email` through the app → `no-referrer`; `/` → `strict-origin-when-cross-origin`" (only one `referrer-policy` value, so writeHead overrode setHeader) | AC3 |

Edge cases covered: trailing slash, query string, case sensitivity, look-alike prefixes (`/verify-emailx`), HEAD, 404, and asset vs document. Vietnamese text, UTC+7 dates and local vs API mode do not apply to these headers. Local mode never reaches `server/` (R1, AC7).

## Approach
1. `server/http.js`: build `SPA_CSP` from an ordered array of `[directive, ...sources]` joined with `"; "`, so the test
   and the code read the same structure. Add `HSTS` and put it in `SECURITY_HEADERS`. `app.js` already applies
   `SECURITY_HEADERS` to every response (`app.js:50`), so HSTS needs no `app.js` change.
2. `server/static.js`: add `referrerPolicyFor`. In `serveStatic`, add CSP and HSTS to the `writeHead` headers, and the
   `Referrer-Policy` override for the two paths. Node merges `setHeader` values with `writeHead` headers, and the
   `writeHead` value wins (the same mechanism `photos.js` uses for its own CSP). So the app-level
   `strict-origin-when-cross-origin` is replaced only on those paths. `notFound` gets CSP and HSTS as well.
3. Tests as listed, then the README paragraph.
4. Run the checks. Run `pnpm build` and read `dist/index.html` and the CSS `@import` as in AC5. Record the result in
   `impl-log.md`.

Rules:
- **R1:** server-only change; the dev server, local mode and the Figma preview are untouched.
- **R3:** no secrets; all origins are public.
- **R6:** no UI copy.
- **R7:** only the listed files.
- **R8:** pure `referrerPolicyFor` and the CSP string have unit tests.
- **R9:** no UI change.
- **R10:** `vite.config.ts`, `.figma/` and `AGENTS.md` are only read, never edited.

## Specialist input used
No consult files for this ticket. Taken from the T-019.7 security review (`work/tickets/T-019.7/security-review.md`):
- *What T-019.8's CSP must allow*: all adopted. `connect-src` is `'self'` plus `api.mmlabs.online` only. Turnstile is only
  in `script-src`/`frame-src`. `img-src 'self' blob: data:`. `frame-ancestors 'none'` and HSTS are included.
- "`Referrer-Policy: no-referrer` on `/verify-email` (and `/reset-password`); consider site-wide": the per-path part is
  adopted. Site-wide is not adopted (A3).
- S3 residual (Turnstile is first-party script for the whole session, and no SRI is possible): recorded under A5. The
  CSP keeps Turnstile out of `connect-src`, so its script cannot send data to its own origin via fetch/XHR. Script
  injection is still possible through `script-src`, and that is the accepted vendor trust.

From the T-019.7 consult (`consult-software-architect.md` F7): `/verify-email` is served by the SPA fallback. This is
confirmed (`static.js:79-84`), so the override belongs in `serveStatic`.

## Assumptions
- **A1 — Scope of the CSP.** The CSP goes on every `serveStatic` response (documents, assets, the asset 404), not on
  `/api/*`, `/healthz` or `/readyz`. CSP only acts on documents, and leaving it out of `SECURITY_HEADERS` keeps the
  photo route's own `default-src 'none'; sandbox` the only CSP there, untouched. HSTS goes on every response through
  `SECURITY_HEADERS`.
- **A2 — No `'unsafe-inline'` in `style-src`.** This rests on the code check above: there are no inline `<style>` tags or
  style attributes in the markup, and React styles go through the CSSOM. If the Turnstile loader styles its container
  with an inline style attribute, the result is cosmetic, because the challenge itself runs in its own iframe. Ming
  check 3 covers this. The fix would be a follow-up adding `'unsafe-inline'` to `style-src` only, which is low risk
  because style injection is not script execution.
- **A3 — Referrer-Policy stays `strict-origin-when-cross-origin` site-wide**, with `no-referrer` only on
  `/verify-email` and `/reset-password`. Fragments never go into `Referer`, and both pages strip the hash first.
  Site-wide `no-referrer` gives little gain, and it is not needed for CORS `Origin` to Identity either way.
- **A4 — Cloudflare edge features.** In access mode the CSP works unchanged. Access logins are top-level navigations,
  which CSP does not govern. API fetches use `redirect: "manual"`, so an expired-session redirect to
  `*.cloudflareaccess.com` is never followed and never hits `connect-src`. Same-origin `/cdn-cgi/*` is `'self'`. If the
  zone injects inline scripts (Web Analytics, JS detections, email obfuscation, Rocket Loader), the CSP blocks them.
  This is accepted, because the app does not depend on any of them.
- **A5 — Turnstile residual (S3).** The Turnstile script shares the JS realm with the in-memory token for the whole
  session. No SRI is possible. This is accepted vendor trust (D35). The CSP limits exfiltration to `'self'` and
  `api.mmlabs.online` for fetch/XHR. It does not stop navigation or script-based exfiltration by a compromised
  Cloudflare script.
- **A6 — Degraded fallback.** If `/healthz` fails twice, the SPA served by the Node server falls back to local mode
  (`src/data/mode.ts`), and its Unsplash demo images (`src/data/demo.ts`) are then blocked by `img-src`. Data still
  works and only the demo photos are missing. Allowing Unsplash is not worth it.
- **A7 — Figma Make site settings.** If Ming later enables Google Analytics, custom scripts or bypass links in Figma
  Make (`.figma/make/site.json`), `figmaSiteConfiguration` injects inline scripts or styles that this CSP blocks.
  `server/README.md` says so. No guard test reads `.figma/` (R10 spirit).
- **A8 — HSTS value.** One year with `includeSubDomains` and no `preload`. The host has no subdomains. Browsers ignore
  HSTS over plain `http://localhost` (`check-image.sh`, local docker).
- **A9 — `/reset-password`** (T-019.12, BACKLOG) gets the header now, so T-019.12 needs no server change.
- **Hotspots (rule 7):** no open ticket (`IN_PROGRESS`/`REVIEW`/`DONE`) edits these files. T-019.13 (BACKLOG, abuse
  limits) and T-019.9 (BACKLOG) will likely edit `server/app.js`/`server/app.test.ts`. Whichever merges second rebases.
  No `src/App.tsx` change.

## Blocking questions
None.

## Split proposal
None. The ticket is about 150 changed lines (mostly tests).
