Status: READY

# Plan — F-603.2: Resize photos off the main thread for bulk import

Security-relevant: this ticket changes the production CSP header (`server/http.js`). Route the diff to
`security-ai-generated-code-auditor` at REVIEW (ticket areas include `security`; CLAUDE.md: "a diff touching …
env"; the F-603 split proposal says the same).

## Feature summary
`docs/feature-list.md` F-603:
> - **AC:** 30 phone photos import in one go; the browser does not freeze (resize work off the main thread if needed).

Ticket F-603 scope (quoted in this ticket): "Run the resize off the main thread (`createImageBitmap` +
`OffscreenCanvas` in a worker) when supported; otherwise fall back to the main thread. The worker must be allowed
by the CSP (`worker-src`)."

`work/tickets/F-603/plan.md` › Split proposal (F-603.2): "A module worker
(`new Worker(new URL("./photoPrep.worker.ts", import.meta.url), { type: "module" })`, emitted by Vite as a
same-origin `/assets/*.js` chunk) … exposed as `PhotoDeps` for `preparePhoto` so size steps, HEIC (D47) and error
codes stay identical; feature-detect … and fall back to the current main-thread deps; check EXIF orientation parity
(`imageOrientation: "from-image"`). **Security-relevant (CSP):** add an explicit `["worker-src", "'self'"]` …
no `blob:` or `'unsafe-eval'`."

`work/decisions.md`:
> D47 — No client-side HEIC decoder. Browsers that can decode HEIC (Safari) upload it re-encoded as JPEG; elsewhere … a clear Vietnamese error and uploads nothing. (The reason given: a decoder needs `'wasm-unsafe-eval'` in the CSP.)
> D48 — EXIF/GPS is removed by re-encoding every photo in the browser (`preparePhoto`) … Every upload path (editor, F-603 bulk import, F-702) must go through `preparePhoto`.
> D42 — … a browser-only check gets … a one-off Playwright check (the session's preinstalled Playwright, script outside the repo) whose result is recorded in impl-log and review.

### Facts checked while planning
- **Vite emission (verified).** A scratch build with the repo's Vite 8.0.5 (outside the repo) of
  `new Worker(new URL("./photoPrep.worker.ts", import.meta.url), { type: "module" })` emits
  `dist/assets/photoPrep.worker-<hash>.js` and rewrites the call to
  `new Worker(new URL("/assets/photoPrep.worker-<hash>.js", "" + import.meta.url), { type: "module" })`.
  Vite's default `worker.format` is `"iife"`: the worker body is one self-contained IIFE (imports inlined), which is
  valid code for a module worker. No `blob:` URL, no `data:` URL, no `eval`. **No `vite.config.ts` change.**
- **Current CSP already allows it.** `server/http.js:6-18` has no `worker-src`/`child-src`, so workers fall back to
  `script-src 'self' https://challenges.cloudflare.com`; `/assets/*.js` is served as
  `text/javascript; charset=utf-8` (`server/static.js:10`) with `nosniff`, which a module worker needs. The explicit
  `worker-src 'self'` therefore **narrows** worker sources (drops the Turnstile host); it does not widen anything.
  The worker script response itself carries `SPA_CSP` (`server/static.test.ts` › "SPA responses carry the CSP" checks
  `/assets/x.js`), so the worker runs under the same policy; it fetches nothing (it receives the `Blob` by
  `postMessage`).
- **Browser support** (from platform knowledge, to be confirmed by the Ming checks): module workers — Chrome 80,
  Safari 15, Firefox 114; `createImageBitmap(Blob, { imageOrientation: "from-image" })` — Chrome, Firefox, Safari 15+
  (older Safari may ignore the options bag); `OffscreenCanvas` with a **2d** context and `convertToBlob` — Chrome 69,
  Firefox 105, **Safari/iOS 16.4+** (16.0–16.3 had no 2d context). Because 2d support cannot be detected from the main
  thread, the worker reports its own capability in a `ready` handshake (see Approach) and anything less falls back to
  the main thread.
- **jsdom** has no `Worker`, `OffscreenCanvas` or `createImageBitmap`; `<img>` never loads and `<canvas>` has no 2d
  context. All unit tests therefore use fakes (a fake worker wired to the real host handler with a fake
  bitmap/canvas env); real decoding is only checked with the one-off Playwright run.
- Call sites need no change: `Editor.tsx:115` calls `preparePhoto(f)` and `repo.http.ts:18` defaults
  `prepare = preparePhoto` (called with one argument), so both — and the F-603.1 bulk import, which goes through
  `repo.save` — get the off-thread path once `preparePhoto(file)` without deps uses it.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | With worker support, `preparePhoto` decodes (`createImageBitmap`) and encodes (`OffscreenCanvas.convertToBlob({ type: "image/jpeg", quality })`) in the worker. | `photoWorkerHost.test.ts › decodes with createImageBitmap and from-image orientation`, `› renders on an OffscreenCanvas of scaledSize and encodes JPEG at the given quality`; `photoPrep.test.ts › auto path uses the off-thread deps when available` |
| 2 | Output matches the main-thread path: JPEG ≤ 2 MiB, same size steps (`ENCODE_STEPS` walk), same width/height rounding, same error codes (`tooLarge`, `unsupportedType`, `heicUnsupported`, `unreadable`, `tooLargeAfterResize`). | Both paths run the same `prepareWith` loop and the same `scaledSize` (shared module): `photoWorkerClient.test.ts › worker deps through preparePhoto walk ENCODE_STEPS like main deps`, `› worker deps return scaledSize dimensions`, `› decode failure maps to heicUnsupported / unreadable after fallback`; `photoScale.test.ts` cases; existing `photoPrep.test.ts` cases unchanged and green |
| 3 | EXIF orientation parity: the worker decodes with `imageOrientation: "from-image"` (the `<img>` path applies EXIF orientation too). | Unit: `photoWorkerHost.test.ts › decodes with createImageBitmap and from-image orientation`. Browser: Playwright step P3 (orientation-6 JPEG → portrait output on both paths) recorded in impl-log |
| 4 | Without `Worker`, `OffscreenCanvas` or `createImageBitmap` on the main thread, the main-thread deps are used and the photo still succeeds. | `photoWorkerClient.test.ts › canUseWorker is false when Worker / OffscreenCanvas / createImageBitmap is missing` (3 cases), `› getOffThreadDeps returns null in jsdom`; `photoPrep.test.ts › auto path uses main deps when off-thread deps are null` |
| 5 | When the worker errors (script fails to load, `error`/`messageerror` event, `ready` says unsupported or never arrives within 5 s, or a load/render fails inside the worker), that photo is redone on the main thread and succeeds; after an infrastructure failure the worker is not used again in this page. | `photoWorkerClient.test.ts › ready {ok:false} marks the worker broken`, `› no ready within 5 s marks it broken` (fake timers), `› worker error event rejects pending requests and marks it broken`, `› messageerror marks it broken`; `photoPrep.test.ts › worker infrastructure failure falls back to main deps and succeeds`, `› worker decode failure retries on main deps (Safari HEIC)`, `› deterministic errors (tooLarge, unsupportedType, tooLargeAfterResize) are not retried` |
| 6 | Decoded bitmaps are released: `release()` closes the bitmap in the worker, also when encoding fails. | `photoWorkerHost.test.ts › release closes the bitmap and forgets the id`; `photoWorkerClient.test.ts › release posts a release message` |
| 7 | Vite emits the worker as a same-origin `/assets/*.js` chunk loaded with `{ type: "module" }`, no `blob:`/`data:` worker, and the worker chunk does not bundle UI copy. | After `pnpm build`: `ls dist/assets/photoPrep.worker-*.js`; `grep -o 'new Worker(new URL(`/assets/photoPrep.worker-[^`]*`' dist/assets/index-*.js`; `grep -c "Không" dist/assets/photoPrep.worker-*.js` → 0 |
| 8 | The CSP header contains `worker-src 'self'` and nothing broader. | `server/static.test.ts › CSP directives are exact` (adds `"worker-src": ["'self'"]`), `› CSP has no unsafe sources and keeps Turnstile out of connect-src` (adds `worker-src` to the no-`CHALLENGES` loop and asserts no `blob:`/`data:` in it) |
| 9 | Importing 30 phone photos shows no long task over 200 ms on the main thread. | One-off Playwright trace (P1–P4 below) with 4× CPU throttling, recorded in impl-log with numbers for both the worker path and the forced main-thread baseline; reviewer re-runs or checks the recorded output |
| 10 | All checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` (CI also runs `pnpm test:coverage`) |

### One-off Playwright check (D42 style; scripts and fixtures outside the repo, in the session scratchpad)
Preinstalled Playwright 1.63 with Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), no repo dependency.
- **Fixtures:** 30 generated phone-like JPEGs (4032×3024, noisy content so each is 3–6 MB) plus one 4032×3024 JPEG
  with EXIF `Orientation=6`; generated by a script outside the repo (e.g. Python Pillow or ImageMagick).
- **Harness:** a throwaway Vite root in the scratchpad with alias `@` → `/home/user/TuDoCuaTui/src`, whose `main.ts`
  exposes `preparePhoto` (auto path) and `prepareWith(file, mainThreadDeps)` on `window`. Build it with the repo's
  Vite and serve `dist/` with a ~20-line Node static server that sets `Content-Security-Policy: SPA_CSP` imported from
  `/home/user/TuDoCuaTui/server/http.js` (so the worker loads under the real policy).
- **P1 long tasks:** CDP `Emulation.setCPUThrottlingRate({ rate: 4 })`; `PerformanceObserver({ type: "longtask",
  buffered: true })`; `page.setInputFiles` the 30 photos, then run `preparePhoto` sequentially over them (what
  `runPhotoImport` does). Pass = max long-task duration ≤ 200 ms; record max, count > 50 ms, total time.
- **P2 baseline (sensitivity):** the same run with `prepareWith(file, mainThreadDeps)`; expect long tasks > 200 ms
  (proves the probe detects the problem). Record the numbers.
- **P3 orientation:** the Orientation-6 file through both paths → both outputs are portrait (width < height) with the
  same dimensions (e.g. 900×1200).
- **P4 CSP:** listen for `securitypolicyviolation` and console errors during P1; pass = none, and a `ready {ok:true}`
  arrived (the worker path was really used, not the fallback). Also confirm the worker URL is `/assets/…`.
The whole-app flow (upload to the API) is not needed for this check: after F-603.1 the upload is async network I/O;
the CPU work on the main thread is `preparePhoto`, which is what this measures.

## Ming verification after merge
- **Turnstile still works** with the new `worker-src 'self'`: sign up (new account) and "Quên mật khẩu"
  (forgot password) on the production site; the widget renders and passes, and DevTools Console shows no CSP
  `worker-src` violation. (Expected: Turnstile runs in its own `challenges.cloudflare.com` iframe whose document has its
  own CSP; the change only removes that host from *our* page's worker sources.)
- DevTools on the production site: Network shows `/assets/photoPrep.worker-*.js` with status 200 on the first photo
  pick; Console has no CSP violations.
- Bulk import of 30 photos on a real phone (iPhone with iOS ≥ 16.4, and an Android phone) stays responsive: you can
  scroll the modal and the progress updates while it runs.
- A portrait photo taken on the phone (both iPhone and Android) is stored upright, not rotated, via bulk import and
  via the editor.
- On Safari, a HEIC photo still imports (D47; if the worker cannot decode it, the main-thread fallback does).
- Optional: on an older iPhone (iOS < 16.4), import still works (main-thread fallback).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/photoScale.ts` (new) | `scaledSize(width, height, max) → { width, height }` (`r = min(1, max / max(w, h))`, `Math.round`), no imports | One rounding rule for both paths (AC 2); importable by the worker without pulling UI copy |
| `src/data/photoScale.test.ts` (new) | Unit tests for `scaledSize` | R8 |
| `src/data/photos.ts` | `renderJpeg` uses `scaledSize`; `loadImage` returns `MainImage` (`DecodedImage & { source: CanvasImageSource }`); export `mainThreadDeps: PhotoDeps<MainImage> = { load: loadImage, render: renderJpeg }` | Parity (AC 2) and fallback deps (AC 4, 5); stays excluded from coverage |
| `src/data/photoPrep.ts` | `DecodedImage` drops `source` (moves to `MainImage`); `PhotoDeps<T extends DecodedImage = DecodedImage>`; current body becomes `prepareWith(file, deps)` (exported, logic unchanged); new `preparePhotoAuto(file, { offThread, main })` and `preparePhoto(file, deps?)` = `deps ? prepareWith(file, deps) : preparePhotoAuto(file, { offThread: getOffThreadDeps, main: mainThreadDeps })` | Off-thread by default with fallback; call sites unchanged (AC 1, 4, 5) |
| `src/data/photoPrep.test.ts` | Keep existing cases (they pass `deps`); add `preparePhotoAuto` cases | R8 |
| `src/data/photoWorkerHost.ts` (new) | Worker side, no DOM/UI imports: message protocol types, `probeEnv(env)` (2d context + `convertToBlob` present), `createPhotoWorkerHost(env, post)` → message handler for `load` / `render` / `release`; keeps bitmaps in a `Map<id, ImageBitmap>` | Testable worker logic (AC 1, 3, 6) |
| `src/data/photoWorkerHost.test.ts` (new) | Host tests with a fake env (`createImageBitmap`, `OffscreenCanvas`) | R8 |
| `src/data/photoPrep.worker.ts` (new) | ~5-line entry: builds the env from `self`, posts `{ type: "ready", ok: probeEnv(env) }`, sets `self.onmessage = createPhotoWorkerHost(env, (m) => self.postMessage(m))` | The worker module Vite emits (AC 7) |
| `src/data/photoWorkerClient.ts` (new) | Main side: `canUseWorker(g = globalThis)`; `createWorkerDeps(worker, { readyTimeoutMs = 5000 })` → `PhotoDeps` + `broken` state; `getOffThreadDeps()` lazily creates one shared worker via `new Worker(new URL("./photoPrep.worker.ts", import.meta.url), { type: "module" })` (wrapped in try/catch), returns `null` when unsupported or broken | Feature detection, fallback, worker lifecycle (AC 1, 4, 5) |
| `src/data/photoWorkerClient.test.ts` (new) | Client tests with a `FakeWorker` that routes `postMessage` to the real `createPhotoWorkerHost` with a fake env (async, like a real worker) | R8 |
| `vitest.config.ts` | Add `"src/data/photoPrep.worker.ts"` to `coverage.exclude` (next to `src/data/photos.ts`) | The entry only runs in a real worker; keeps the `src/data/**` 80 % gate honest |
| `server/http.js` | Add `["worker-src", "'self'"]` to `CSP_DIRECTIVES` right after `script-src` | AC 8 (ticket scope) |
| `server/static.test.ts` | Exact-directive test gains `"worker-src": ["'self'"]`; the "no unsafe sources" test adds `worker-src` to the no-`CHALLENGES` loop and asserts `worker-src` has no `blob:` / `data:` | AC 8 |

No change to `vite.config.ts`, `repo.http.ts`, `Editor.tsx`, the import UI, copy, or dependencies.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `photoScale.test.ts › landscape 4032×3024 at 1200 → 1200×900` | AC 2 |
| `… › portrait 3024×4032 at 900 → 675×900` | AC 2, 3 |
| `… › smaller than max is not upscaled (800×600 at 1200 → 800×600)` | AC 2 |
| `… › rounds like Math.round (e.g. 4000×3001 at 1200 → 1200×900)` | AC 2 |
| `photoWorkerHost.test.ts › decodes with createImageBitmap and from-image orientation` (fake called with `(blob, { imageOrientation: "from-image" })`; replies `{ id, ok: true, width, height }` from the bitmap) | AC 1, 3 |
| `… › decode failure replies ok:false and stores nothing` | AC 5 |
| `… › renders on an OffscreenCanvas of scaledSize and encodes JPEG at the given quality` (canvas size, `drawImage(bitmap, 0, 0, w, h)`, `convertToBlob({ type: "image/jpeg", quality })`, reply `{ blob, width, height }`) | AC 1, 2 |
| `… › render of an unknown id or a convertToBlob rejection replies ok:false` | AC 5 |
| `… › release closes the bitmap and forgets the id` (later render → ok:false) | AC 6 |
| `… › probeEnv is false without a 2d context or without convertToBlob` | AC 5 (Safari < 16.4) |
| `photoWorkerClient.test.ts › canUseWorker is false when Worker is missing` / `… OffscreenCanvas is missing` / `… createImageBitmap is missing`; `› true when all three exist` | AC 4 |
| `… › getOffThreadDeps returns null in jsdom` | AC 4 |
| `… › load waits for ready, posts the blob and resolves width/height` | AC 1 |
| `… › worker deps return scaledSize dimensions` | AC 2 |
| `… › worker deps through preparePhoto walk ENCODE_STEPS like main deps` (same fake size function on both deps → identical `(max, quality)` sequence and result) | AC 2 |
| `… › concurrent requests are matched by id` (two loads in flight resolve to their own sizes) | AC 1 |
| `… › ready {ok:false} marks the worker broken` (load rejects with a worker-unavailable error; `broken` true) | AC 5 |
| `… › no ready within 5 s marks it broken` (fake timers) | AC 5 |
| `… › worker error event rejects pending requests and marks it broken` | AC 5 |
| `… › messageerror marks it broken` | AC 5 |
| `… › release posts a release message` | AC 6 |
| `photoPrep.test.ts › auto path uses the off-thread deps when available` (main deps not called) | AC 1 |
| `… › auto path uses main deps when off-thread deps are null` | AC 4 |
| `… › worker infrastructure failure falls back to main deps and succeeds` | AC 5 |
| `… › worker decode failure retries on main deps (Safari HEIC)` (off-thread `load` rejects, main `load` succeeds → result from main) | AC 5, D47 |
| `… › decode failure on both paths → heicUnsupported for HEIC, unreadable otherwise` | AC 2 |
| `… › deterministic errors (tooLarge, unsupportedType, tooLargeAfterResize) are not retried` (main deps not called; `tooLarge` / `unsupportedType` also never call off-thread deps) | AC 2, 5 |
| `static.test.ts › CSP directives are exact` (updated) | AC 8 |
| `static.test.ts › CSP has no unsafe sources and keeps Turnstile out of connect-src` (extended to `worker-src`) | AC 8 |

## Approach
1. **Shared scaling.** Add `src/data/photoScale.ts › scaledSize`. `photos.ts › renderJpeg` uses it (behaviour
   identical to today's inline formula).
2. **Types.** In `photoPrep.ts`: `DecodedImage = { width; height; release(): void }`;
   `PhotoDeps<T extends DecodedImage = DecodedImage> = { load(src: Blob): Promise<T>; render(img: T, max, quality) }`.
   `photos.ts` defines `MainImage extends DecodedImage { source: CanvasImageSource }` and `mainThreadDeps`. The
   existing test fixture (`source: {}`) stays assignable.
3. **`prepareWith(file, deps)`** = today's `preparePhoto` body, unchanged (size check, `photoKind`, load → HEIC /
   unreadable mapping, `ENCODE_STEPS` loop, `release` in `finally`).
4. **`preparePhotoAuto(file, { offThread, main })`:** run the cheap pre-checks once (`tooLarge`,
   `unsupportedType`) by letting `prepareWith` throw them; if `offThread()` returns deps, `try prepareWith(file, off)`;
   on `PhotoPrepError` with code `tooLarge` / `unsupportedType` / `tooLargeAfterResize` rethrow (deterministic: the
   browser JPEG encoder is the same on both paths); on any other error (`heicUnsupported`, `unreadable`, or a
   worker-unavailable error) fall through to `prepareWith(file, main)`. If `offThread()` is `null`, go straight to
   main. `preparePhoto(file, deps?)` delegates (explicit deps keep today's behaviour, so `photoPrep.test.ts` and any
   caller with injected deps are unaffected).
5. **Worker host** (`photoWorkerHost.ts`, imports only `photoScale.ts`):
   - Protocol (main → worker): `{ op: "load", id, blob }`, `{ op: "render", id, max, quality }`,
     `{ op: "release", id }`. Worker → main: `{ type: "ready", ok }` once, then `{ id, ok: true, width, height }`
     (load), `{ id, ok: true, blob, width, height }` (render), `{ id, ok: false }` (any failure; no error text is
     sent or shown — the main side maps to `PhotoPrepError` codes via `prepareWith`).
   - `load`: `env.createImageBitmap(blob, { imageOrientation: "from-image" })`, store in a `Map`, reply with
     `bitmap.width/height` (oriented size, like `img.width` on the main path).
   - `render`: `scaledSize`, `new env.OffscreenCanvas(w, h)`, `getContext("2d")!.drawImage(bitmap, 0, 0, w, h)`,
     `await canvas.convertToBlob({ type: "image/jpeg", quality })`. Re-encoding drops EXIF/GPS exactly as `toBlob`
     does today (D48 holds).
   - `release`: `bitmap.close()`, delete. No reply.
   - `probeEnv(env)`: `typeof env.OffscreenCanvas === "function"` and
     `new env.OffscreenCanvas(1, 1).getContext("2d")` non-null and has `convertToBlob`, and
     `typeof env.createImageBitmap === "function"`; wrapped in try/catch.
   - Typing: tsconfig has `DOM` but not `WebWorker` lib; declare a minimal `WorkerEnv` / `PostFn` interface in the
     host and cast `self` in the entry (`self as unknown as { postMessage(m: unknown): void; onmessage: … }`). No
     tsconfig change.
6. **Worker entry** (`photoPrep.worker.ts`): builds `env` from `self.createImageBitmap.bind(self)` and
   `self.OffscreenCanvas`, posts `ready`, installs the handler. Imports only `./photoWorkerHost` so the emitted
   chunk carries no UI copy (AC 7).
7. **Client** (`photoWorkerClient.ts`):
   - `canUseWorker(g)`: `typeof g.Worker`, `g.OffscreenCanvas`, `g.createImageBitmap` all `"function"`.
   - `createWorkerDeps(worker, opts)`: `ready` promise resolved by the `ready` message (`ok:false` → broken) or
     rejected after `readyTimeoutMs` (5000) → broken; `pending: Map<id, {resolve, reject}>` with a counter id;
     `worker.addEventListener("error" | "messageerror")` → broken, reject all pending with `WorkerUnavailableError`.
     `load(blob)` awaits `ready`, posts, resolves `{ width, height, release: () => post({ op: "release", id }) }`;
     `render(img, max, quality)` posts and resolves the reply; `ok:false` rejects.
   - `getOffThreadDeps()`: module-level singleton. Returns `null` if `!canUseWorker(globalThis)` or the singleton is
     broken; otherwise creates the worker once (`try { new Worker(new URL("./photoPrep.worker.ts", import.meta.url),
     { type: "module" }) } catch { broken }`). The worker lives for the page; bitmaps are released per photo.
     The exact `new Worker(new URL(...), { type: "module" })` expression must stay literal in source so Vite
     detects and emits it.
8. **CSP.** Add `["worker-src", "'self'"]` after `script-src` in `server/http.js`; update both CSP tests. Nothing
   else in the policy changes; `/api/photos` keeps its own CSP.
9. **Verify** with checks, `pnpm build` greps (AC 7) and the Playwright run P1–P4; record numbers in impl-log.

Rules: R1 — no data access added (the worker only resizes a Blob it is handed). R3 — nothing secret; no new
`VITE_*`. R4 — storage paths and signed display untouched. R6 — no new UI copy; errors still surface as the
existing `PhotoPrepError` messages. R7 — only the files listed. R8 — tests above. R9 — no UI change. R2/R5 — no
schema or derived values. (R2–R4 still name Supabase; the equivalent here is: no migration, no secret, no photo path
change.)

## Specialist input used
None (no `consult-*.md` in the ticket folder). REVIEW must include `security-ai-generated-code-auditor` for the CSP
change.

## Assumptions
- **Fallback granularity.** A decode/encode failure inside a working worker retries that one photo on the main
  thread (covers Safari builds whose `createImageBitmap` cannot decode HEIC while `<img>` can, D47) but does not mark
  the worker broken; only infrastructure failures (load error, `messageerror`, `ready` false or late,
  constructor throw) disable the worker for the rest of the page. Cost: an undecodable file is attempted twice; both
  attempts fail fast.
- **No per-request timeout after `ready`.** A decode under heavy throttling can legitimately take seconds; the 5 s
  timeout applies only to the handshake. If a request hangs after `ready`, the worker would have to crash to unblock
  (it fires `error`). Accepted as low risk.
- **Editor uses the worker too.** `Editor.tsx` calls `preparePhoto(f)` without deps, so single-photo picks also go
  off-thread. This is the same function and the same output; no editor change is made (R7 holds: no edit there).
- **`iife` worker format is fine.** The worker imports nothing at runtime after bundling, so Vite's default
  `worker.format: "iife"` works in a module worker in prod; in `pnpm dev` Vite serves it as ESM. No config change.
- **Future service worker** (F-8xx PWA, `vite-plugin-pwa`): a same-origin `sw.js` is also covered by
  `worker-src 'self'`; nothing else needed then.
- **Not a High-tier gate.** The ticket has `Gate: none`; the CSP lives in `server/http.js`, not in the High-tier
  paths listed in CLAUDE.md. The change only narrows worker sources. It is still security-relevant → auditor at
  review + Ming's Turnstile check.
- No other ticket is `IN_PROGRESS`, `REVIEW` or `DONE` (backlog: only F-603.2 is open), so no rebase hotspot.
  `src/App.tsx` is not touched.

## Blocking questions
None.

## Split proposal
None. Estimated ~150 production lines (host ~60, client ~70, prep/photos/scale/CSP ~20) and ~250 test lines.
