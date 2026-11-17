# Security review — F-603.2

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-17

**Overall result: PASS. No 🔴 blockers; 4 🟡 non-blocking notes.** The CSP change only narrows what was
allowed. The worker is same-origin and nothing can redirect it. Every path still re-encodes the photo, so
EXIF/GPS is still stripped. No secrets were added.

### Findings

**CSP (`server/http.js:9`)**
- The new directive is exactly `["worker-src", "'self'"]`: no `blob:`, `data:`, `'unsafe-eval'`,
  `'wasm-unsafe-eval'`, wildcard or `http:`. Before this change, workers fell back to
  `script-src 'self' https://challenges.cloudflare.com`, so the change removes the Turnstile host from our page's
  worker sources and adds nothing.
- The rest of `SPA_CSP` (lines 6-19) is unchanged and consistent: `frame-src` still allows only the Turnstile
  host, `connect-src` still has no Turnstile host, and `object-src`, `base-uri` and `frame-ancestors` stay locked
  down.
- The tests pin this down: `server/static.test.ts:203-230` checks the exact directive map, that `worker-src` has
  no `blob:`, `data:` or Turnstile host, and that the whole policy has no `unsafe-*`, `*` or `http:`.
- Turnstile runs inside its own `challenges.cloudflare.com` iframe, whose document has its own CSP; Cloudflare's
  documented CSP for Turnstile needs only `script-src` and `frame-src`. Breakage is not expected, but static
  review cannot prove it: Ming's post-merge check on sign-up and forgot-password confirms it.
- The worker script is served from `/assets/*.js` with `SPA_CSP` (`server/static.js:103`), so it runs under the
  same policy. It makes no network requests; `createImageBitmap` on a transferred Blob needs no `connect-src`.

**Worker origin (`src/data/photoWorkerClient.ts:101`)**
- The worker URL is the literal `new URL("./photoPrep.worker.ts", import.meta.url)`, rewritten by Vite to
  `/assets/photoPrep.worker-<hash>.js`, with `{ type: "module" }`. No input from users, the URL or storage reaches
  the constructor, and `worker-src 'self'` would block any other origin anyway. The impl-log's Playwright run P4
  recorded the same-origin worker URL and no CSP violations under the real `SPA_CSP`.

**postMessage trust boundary (`photoPrep.worker.ts:18`, `photoWorkerHost.ts:71-78`, `photoWorkerClient.ts:45-57`)**
- A dedicated `Worker`: only the page that created it holds the reference, so other frames or windows cannot post
  to it or read its messages. Worker messages have no origin to check, so the missing check is correct. Neither
  side validates message shape; both ends are our code, so this is not exploitable (note 4).

**EXIF/GPS, D48 (`src/data/photoWorkerHost.ts:57-65`)**
- The worker draws the `ImageBitmap` onto a fresh `OffscreenCanvas` and calls
  `convertToBlob({ type: "image/jpeg", quality })`; canvas encoding writes no source metadata, the same as the
  main-thread `toBlob` path.
- `prepareWith` (`src/data/photoPrep.ts:79-106`) only returns `deps.render(...)` output and never the original
  file. The fallback in `preparePhotoAuto` (`photoPrep.ts:115-122`) goes through `prepareWith(file, sources.main)`,
  which re-encodes too. Call sites are unchanged (`Editor.tsx:115`; `repo.http.ts:18`, default
  `prepare = preparePhoto`, used by bulk import).
- The server still checks JPEG magic bytes (`server/photos.js:224`).

**Secrets:** none (no new `VITE_*` variable, key or token).

### Non-blocking notes (🟡)
1. 🟡 **No pixel cap before decoding** (`photoWorkerHost.ts:49`, same as `photos.ts:10-26`). Only the 10 MiB byte cap
   applies (`photoPrep.ts:83`); a small, highly compressed image with huge dimensions (e.g. 30k×30k PNG) is fully
   decoded and could run the tab out of memory. Only the user's own files reach this code and the main-thread path
   behaves the same, so it is not new. Possible follow-up: reject over ~50 MP (a real fix reads the image header
   first).
2. 🟡 **A broken worker is never terminated** (`photoWorkerClient.ts:35-42`). `markBroken` rejects pending requests
   but does not call `worker.terminate()`, so a bitmap loaded after the client gave up stays in the worker's `Map`.
   Minor memory leak; a one-line `terminate()` fixes it (follow-up, R7).
3. 🟡 **No per-request timeout after the `ready` handshake** (`photoWorkerClient.ts:59-64`). A hung worker would stall
   `preparePhoto` and the import (availability, accepted in the plan). Memory per message is bounded: one Blob
   (≤ 10 MiB) per load, sequential import, `release()` in `finally`.
4. 🟡 **Hardening only: message shape is not checked** (`photoWorkerHost.ts:74`, `photoWorkerClient.ts:47`). Unknown
   `op` falls into the `release` branch; `"type" in m` throws for a non-object. Not reachable by an attacker; an
   explicit `m.op === "release"` and a `typeof m === "object" && m` guard would be cleaner.

### Rules
R3 holds (nothing secret in client code). R4 holds (storage and display paths untouched). D47 holds (no wasm
decoder, no `'wasm-unsafe-eval'`). D48 holds (every upload path is re-encoded).

### Open questions
None blocking. Ming's post-merge Turnstile check (sign-up and "Quên mật khẩu", no `worker-src` violation in the
Console) is the final confirmation for the CSP change.
