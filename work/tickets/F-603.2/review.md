Verdict: PASS

## Attempt 1 — 2026-11-17

Reviewed `git diff origin/main...HEAD` (implementation commit 6a43d1b; HEAD e5560b3 only moves the ticket to REVIEW).

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` — no errors.
- format:check: "All matched files use the correct format.", exit 0.
- test: Test Files 119 passed | 11 skipped (130); Tests 1495 passed | 221 skipped (1716) — matches impl-log.
- test:coverage (CI): exit 0, thresholds met; `src/data` 96.17 % stmts / 94.45 % branches — matches impl-log.
- build: OK; `dist/assets/photoPrep.worker-B1z90X5a.js 1.16 kB` (same hash as impl-log).

### Acceptance criteria
- [x] AC 1 — decode/encode in the worker: `src/data/photoWorkerHost.ts:815-837` (`createImageBitmap(blob, { imageOrientation: "from-image" })`, `OffscreenCanvas` + `convertToBlob({ type: "image/jpeg", quality })`); tests `photoWorkerHost.test.ts › decodes with createImageBitmap and from-image orientation`, `› renders on an OffscreenCanvas of scaledSize and encodes JPEG at the given quality`, `photoPrep.test.ts › auto path uses the off-thread deps when available` — all green.
- [x] AC 2 — output parity: both paths go through the same `prepareWith` (`src/data/photoPrep.ts` `ENCODE_STEPS` loop, HEIC→`heicUnsupported` / `unreadable` mapping, `release()` in `finally`) and the same `scaledSize` (`src/data/photoScale.ts`, used by `photos.ts › renderJpeg` and the host). Tests: `photoWorkerClient.test.ts › worker deps through preparePhoto walk ENCODE_STEPS like main deps`, `› worker deps return scaledSize dimensions`, `photoScale.test.ts` (4), `photoPrep.test.ts › decode failure on both paths -> heicUnsupported for HEIC, unreadable otherwise`, `› deterministic errors … are not retried`. Browser: both paths give 1200×900 JPEGs well under 2 MiB (worker 618 859 B, main 568 362 B; the small size difference is the canvas scaler, not a step difference).
- [x] AC 3 — EXIF orientation parity: unit test above asserts `imageOrientation: "from-image"`. Playwright P3 re-run: fixture `orient6.jpg` is stored 4032×3024 with EXIF Orientation=6 (checked with Pillow); output worker `[900, 1200]`, main `[900, 1200]` — portrait on both.
- [x] AC 4 — missing `Worker` / `OffscreenCanvas` / `createImageBitmap` → main thread: `photoWorkerClient.ts canUseWorker`; tests `canUseWorker is false when … is missing` (3), `getOffThreadDeps returns null in jsdom`, `photoPrep.test.ts › auto path uses main deps when off-thread deps are null`.
- [x] AC 5 — worker fails / never sends ready: `createWorkerDeps` rejects pending requests and the `ready` promise on `error`, `messageerror`, `ready {ok:false}` and the 5 s timeout (`markBroken`), constructor throw sets `failed`; `preparePhotoAuto` retries every non-deterministic failure on main deps. Tests: `ready {ok:false} marks the worker broken`, `no ready within 5 s marks it broken`, `worker error event rejects pending requests and marks it broken`, `messageerror marks it broken`, `worker infrastructure failure falls back to main deps and succeeds`, `worker decode failure retries on main deps (Safari HEIC)` — green. A late `ready` after the timeout cannot un-break it (rejected promise stays rejected, `state.broken` stays true).
- [x] AC 6 — bitmaps released: `prepareWith` calls `img.release()` in `finally` (also when render fails); the worker `release` op closes and forgets the bitmap (`photoWorkerHost.ts:839-846`). Tests `release closes the bitmap and forgets the id`, `release posts a release message`.
- [x] AC 7 — Vite emission: `dist/assets/photoPrep.worker-B1z90X5a.js` exists; `dist/assets/index-*.js` contains ``new Worker(new URL(`/assets/photoPrep.worker-B1z90X5a.js`,``+import.meta.url),{type:`module`})``; `grep -c "Không"` on the worker chunk = 0; no `blob:` URL / `eval` in it (the only "blob" hit is the `blob:await` property).
- [x] AC 8 — CSP: `server/http.js:9` adds `["worker-src", "'self'"]`; `server/static.test.ts` exact-directive test gains `"worker-src": ["'self'"]` and the no-unsafe test adds `worker-src` to the no-Turnstile loop plus no `blob:` / `data:`. Both green. This narrows worker sources (previously fell back to `script-src`, which includes `challenges.cloudflare.com`).
- [x] AC 9 — no long task > 200 ms: Playwright re-run by the reviewer (harness rebuilt from the current `src`, served with the real `SPA_CSP` from `server/http.js`, Chromium, CDP 4× CPU throttling, 30 × 4032×3024 JPEGs ~8.5 MB). Output saved to `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-2/run-output.review.json`:

  | | worker (auto path) | forced main-thread baseline |
  |---|---|---|
  | photos | 30 | 30 |
  | long tasks (total / > 50 ms / > 200 ms) | 0 / 0 / 0 | 31 / 31 / 30 |
  | max long task | 0 ms | 559 ms |
  | avg prepare per photo | 178 ms | 616 ms |
  | CSP violations / console errors | 0 / 0 | 0 / 0 |
  | worker URL observed | `http://localhost:4599/assets/photoPrep.worker-B1z90X5a.js` | — |

  Matches impl-log (worker 0 long tasks; baseline 30 > 200 ms, max 580 ms). The worker chunk was actually used: Playwright saw the worker, and the zero long tasks plus 3.5× faster per-photo time are impossible on the main-thread fallback.
- [x] AC 10 — all checks pass (above).

### Scope
All changed files are in the plan's file list except `src/App.test.tsx`, justified under impl-log › Out-of-plan files: its `vi.mock("@/data/photos")` must export `mainThreadDeps` now that `photoPrep.ts` imports it. Test-only, 8 lines, no behaviour change. Accepted.

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data access added (the worker only receives a Blob by `postMessage`, fetches nothing). R3: nothing secret, no new `VITE_*`. R4: photo paths untouched; D48 holds (every output is re-encoded by `convertToBlob` / `toBlob`, which drop EXIF/GPS). R6: no new UI copy; errors still surface as `PhotoPrepError` messages; worker chunk carries no copy. R8: new pure logic has unit tests. R9: no UI change.

### Nits (do not block)
- `photoWorkerClient.ts markBroken` never calls `worker.terminate()`. After a `messageerror`/`error`/late-`ready`, the worker stays alive for the page, and a `load` that finishes after the break keeps its bitmap (never released). Rare infrastructure path; consider terminating the worker in `markBroken`.
- `preparePhoto` passes `mainThreadDeps: PhotoDeps<MainImage>` where `PhotoDeps` is expected; it typechecks only through method-parameter bivariance. Harmless at runtime (the main deps only ever see their own images).
- No per-request timeout after `ready` (plan assumption): a hung decode inside a live worker would stall that photo until the worker crashes.

### Ming verification after merge (from plan.md; carry into the PR)
- Turnstile still works on sign-up and "Quên mật khẩu" with the new `worker-src 'self'`; no CSP `worker-src` violation in the Console.
- Production DevTools: `/assets/photoPrep.worker-*.js` loads with 200 on the first photo pick; no CSP violations.
- Bulk import of 30 photos on a real iPhone (iOS ≥ 16.4) and an Android phone stays responsive.
- A portrait phone photo is stored upright via bulk import and via the editor (iPhone and Android).
- On Safari, a HEIC photo still imports (D47; main-thread fallback if the worker cannot decode it).
- Optional: an older iPhone (iOS < 16.4) still imports (main-thread fallback).

### Follow-ups (out of scope)
- `Editor.test.tsx` and `useWardrobe.test.tsx` also mock `@/data/photos`; any future `photos` export used by `photoPrep` must be added there too (from impl-log).
- Terminate the worker on break (nit above), if wanted.
