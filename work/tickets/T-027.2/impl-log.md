## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/data/imageHeader.ts` (new) | Pure JPEG/PNG/WebP header size reader for the pre-decode pixel cap |
| `src/data/photoPrep.ts` | `MAX_PIXELS`, `HEADER_BYTES`, `tooManyPixels` (deterministic), header and post-decode checks, `withPhotoType` |
| `src/data/photoWorkerClient.ts` | `terminate()` in idempotent `markBroken`, 20 s per-request timeout, reply shape guard, Blob check on render |
| `src/data/photoWorkerHost.ts` | `isWorkerRequest` / `isWorkerReply` guards, handler takes `unknown`, explicit `op === "release"` |
| `src/features/items/copy.ts` | Vietnamese copy for `tooManyPixels` (R6) |
| `src/data/photoImport.ts` | `createUrl(withPhotoType(file))` so an empty-MIME HEIC keeps its type through the blob URL |
| test files (below) | R8 |

### Tests added / changed
- `imageHeader.test.ts` › 5 tests (PNG, JPEG SOF0/SOF2, fill bytes/standalone/SOS, WebP VP8/VP8L/VP8X, unknown/truncated)
- `photoPrep.test.ts` › pixel cap (header reject without load, boundary, decoded reject on main deps, worker `tooManyPixels` not retried), `withPhotoType` (3), empty-type `.HEIC` → `heicUnsupported`; the existing copy test now covers the new code
- `photoWorkerClient.test.ts` › `markBroken terminates the worker once …`, 20 s fallback to main deps, late reply ignored, answered request clears its timeout, malformed replies ignored, render without Blob rejects, worker deps over MAX_PIXELS (`FakeWorker` got `terminate()`/`terminated`)
- `photoWorkerHost.test.ts` › malformed requests ignored, unknown op does not release, `isWorkerReply` shapes
- `photoImport.test.ts` › `.heic` with empty MIME reaches `createUrl` typed `image/heic`
- `repo.http.test.ts` › photo over the pixel cap throws before any request

### Plan's open check: `Blob.arrayBuffer` in jsdom
jsdom 27 `Blob`/`File` (and `slice()` results) have NO `arrayBuffer`. `readBytes` in `photoPrep.ts` therefore uses
`blob.arrayBuffer()` when present (all real browsers) and falls back to `FileReader`. Consequence for tests: jsdom's
`FileReader` needs the real `setImmediate`, so `photoWorkerClient.test.ts` fakes only `setTimeout`/`clearTimeout`
and waits for the posted request before advancing 20 s.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean, no errors
- format:check: "All matched files use the correct format."
- test: Test Files 121 passed | 11 skipped (132); Tests 1586 passed | 221 skipped (1807)
- build: built in 449ms; `dist/assets/photoPrep.worker-D_qeP6FA.js` (1.52 kB) emitted, `grep -c "Không"` = 0

### Real-browser check
Not run (optional). Worker path and over-cap rejection are covered only by jsdom unit tests with fakes; a one-off
Playwright confirmation is still worth doing if the reviewer wants it.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- On a worker `ok:false` the client now rejects with an `Error` (before: the reply object); `prepareWith` catches every
  rejection, so behaviour is unchanged.
- A malformed reply for a pending id is ignored and that request ends by the 20 s timeout (as the plan assumes).
- HEIC dimensions are not parsed (D47), so a huge HEIC is caught only after decoding.

### Scope self-check
- Could the diff be smaller? No: most lines are the tests the plan lists.
- Diff size: +414 / -15 tracked, plus two new files (`imageHeader.ts` 71 lines, `imageHeader.test.ts` 68 lines), plus this log.
