## Attempt 1 — 2026-11-17
Verdict: REWORK

Reviewed: branch `ticket/F-202.1` at `2e5d52c` against `origin/main` `f232b9c`. Checks run under WSL (Ubuntu-24.04) on `/mnt/d`.

### Checks (run by reviewer)
- typecheck: green (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- format:check: green ("All matched files use the correct format.", 271 files).
- test: `Tests 16 failed | 1272 passed | 205 skipped (1493)`, `Test Files 4 failed | 101 passed | 10 skipped (115)`.
  - 15 failures are spawned-process timeouts (5000 ms) in `server/index.cli.test.ts` (13), `server/photo-relocate.cli.test.ts` (1) and
    `server/photo-sweep.cli.test.ts` (1). **They exist on `origin/main` too:** a temporary `git worktree` of `origin/main` (`f232b9c`),
    run in the same WSL environment with the same `node_modules`, gave `Tests 15 failed | 1242 passed | 205 skipped (1462)` with the
    exact same 15 test names. The worktree was removed afterwards. This diff touches no file under `server/`, `package.json`,
    the lockfile or the Vite/Vitest config, so these failures are environmental (WSL on a Windows drive), not caused by this ticket.
  - The 16th failure, `server/ai/tagPhoto.test.ts` › "413 for a streamed body over 2 MB without a length" (`fetch failed`,
    `ECONNRESET`), is flaky: it passed when re-run (`tagPhoto.test.ts` 30/30). Untouched by this diff.
  - All touched test files pass: `photoPrep.test.ts` 15/15, `repo.http.test.ts` 31/31, `apiErrors.test.ts` 8/8,
    `Editor.test.tsx` 26/26, `App.test.tsx` 41/41 (targeted re-run: 18 files, 303/303).
  - impl-log matches (1273 passed / 15 failed there vs 1272 / 16 here; the difference is the flaky tagPhoto test).
- build: green, no new chunk (`index-*.js` 263.43 kB, `AuthRoot-*.js` 30.36 kB, CSS 53.49 kB).

### Acceptance criteria
- [x] 1. iPhone and Android photos upload — evidence: `photoPrep.test.ts` › "accepts the phone formats" and "returns a JPEG of at most
  MAX_UPLOAD_BYTES on the first step"; `repo.http.test.ts` › "save with a blob: photo prepares it before the item PUT and uploads the
  JPEG" (asserts `prepare` call order before `fetchFn`, `Content-Type: image/jpeg`, body is the prepared blob); `App.test.tsx` ›
  "a failed photo step keeps the editor open …" passes through the real `preparePhoto`. Real phones: Ming verification (below).
- [x] 2. A file over 10 MB is rejected, nothing uploaded — evidence: `photoPrep.test.ts` › "rejects a file over 10 MiB before
  decoding"; `Editor.test.tsx` › "a file over 10 MB shows the size message and does not set the photo"; `repo.http.test.ts` › "a photo
  that fails preparation throws before any request" (`fetchFn` not called). Size check runs first, `src/data/photoPrep.ts:82`.
- [x] 3. HEIC on desktop Chrome uploads or shows a clear error — evidence: `photoPrep.test.ts` › "HEIC that the browser cannot decode →
  heicUnsupported" and "HEIC that the browser decodes → JPEG"; `Editor.test.tsx` › "an undecodable HEIC shows the HEIC message".
- [x] 4. Busy state while preparing and saving — evidence: `Editor.test.tsx` › "shows the preparing state while a pick is processed and
  disables Save", "shows the uploading state while saving a new photo".
- [ ] 5. Object URLs revoked on replace, remove and **close** — the replace/remove/unmount tests pass, but a pick that is still being
  prepared when the editor closes is not invalidated. See Issue 1.
- [x] 6. 413/415/429/503 photo messages — evidence: `apiErrors.test.ts` › "PhotoSaveError uses the photo copy for 413 and 415",
  "… keeps the existing copy for 429, 503 and other causes"; `repo.http.test.ts` `test.each` with 409/413/415/429/503.
- [x] 7. Checks — green, except the 15 pre-existing environmental server CLI failures shown above (identical on `origin/main`).

### Issues
#### Issue 1 — 🔴 blocker — correctness / data integrity
- **Where**: `src/features/items/Editor.tsx:74` (`useEffect(() => revokeOwn, [])`) with `:75-95` (`upload`), and `src/App.tsx:102-103`
  (`update` writes into whatever item is open) and `:185-193` (Editor is mounted per open item).
- **Expected**: closing the editor ends any photo pick in progress. A pick for item A can never change item B, and no object URL is
  created after the editor has gone.
- **Actual**: unmount revokes `ownUrl` but does not bump `pickSeq`. Pick a large photo, press "Huỷ" while "Đang xử lý ảnh…" is shown
  (no discard prompt: `isDirty` is false because `photo` has not changed yet), then open item B. When `preparePhoto` resolves, the old
  closure still sees `seq === pickSeq.current`, creates an object URL and calls `update("photo", url)`. App's `update` applies it to
  item B, and saving B uploads A's photo to B, silently. The URL is also never revoked (up to 2 MiB per occurrence). Same finding as
  Y1 in `security-review.md`.
- **Fix instruction**: change the unmount cleanup to invalidate the in-flight pick, e.g.
  `useEffect(() => () => { pickSeq.current++; revokeOwn(); }, []);`. Add a regression test in `Editor.test.tsx` › "closing during a
  pick ignores its result": `prep` returns a deferred promise, pick a file, `cleanup()` (unmount), resolve the promise, then assert
  `update` was never called with `"photo"` and `URL.createObjectURL` was not called. The test must fail on the current code.

#### Issue 2 — 🟡 should-fix — correctness / memory
- **Where**: `src/features/items/Editor.tsx` (the `onDuplicate` button) with `src/App.tsx:195-205`.
- **Expected**: "Nhân bản" starts the copy with no photo and no pending pick, and frees the original's object URL.
- **Actual**: Duplicate keeps the same Editor instance and only clears `photo` in App. An in-flight pick still lands on the copy, and a
  finished pick's `ownUrl` stays alive until the editor closes. Same finding as Y2 in `security-review.md`.
- **Fix instruction**: extract the four reset steps already used by "Bỏ ảnh" (`pickSeq.current++`, `setPreparing(false)`,
  `setPhotoError(null)`, `revokeOwn()`) into a `resetPhoto()` helper. Call it from "Bỏ ảnh" and before `onDuplicate()`. Add a test:
  pick, duplicate, then assert `URL.revokeObjectURL` was called with that URL (and, with a deferred pick, that `update("photo", …)` is
  not called after duplicate).

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: the editor calls only the pure `preparePhoto`; no `fetch` in components. `urlToBlob` stays inside the repo.
- R3/R4: no secret or new env var; uploads still go only to `PUT /api/items/:id/photo`.
- R6: all new copy is in `src/features/items/copy.ts` and `src/data/apiErrors.ts`.
- R7: every changed file is in the plan's file list; `useWardrobe.test.tsx` is untouched as the plan allowed.
- R8: new pure logic (`photoKind`, `preparePhoto`, `PHOTO_UPLOAD_ERROR_COPY`) is unit-tested.
- R9: `.photo-busy`/`.photo-error` use `--surface`, `--text`, `--danger`, which have light and dark values (`src/index.css:6-25`).
- R2/R5: not touched.

### Nits (do not block)
- 💭 `src/data/photos.ts` imports a type from `./photoPrep` while `photoPrep.ts` imports values from `./photos`. It is type-only, so
  there is no runtime cycle, but `DecodedImage` could live in `photos.ts`.
- 💭 `photoKind` uses `name!` after the `dot < 0` check. It is safe, but `(name ?? "")` once in a local would avoid the assertion.
- 💭 Transparent PNGs become JPEGs with a black background (unchanged from `resizeImage`).

### Ming verification after merge
From the plan (M-6 in `work/ming-todo.md`):
1. iPhone (Safari), deployed app: camera photo via "Chụp ảnh" saves and shows in the grid; a HEIC photo from "Chọn từ thư viện" uploads.
2. Android (Chrome): the same with the camera and the gallery.
3. Desktop Chrome: pick a `.heic` file; the HEIC message appears and nothing is uploaded.
4. Any browser: pick a file over 10 MB (e.g. 12 MB); the size message appears and nothing is uploaded.
5. Slow connection (DevTools "Slow 4G"): the photo shows "Đang tải ảnh lên…" while saving.

### Follow-ups (out of scope)
- F-202.3: lazy-loaded HEIC decoder (CSP `'wasm-unsafe-eval'`, LGPL notice, bundle size). These are decisions for Ming, see the plan's
  Split proposal.
- The server CLI spawn tests (`server/index.cli.test.ts`, `server/photo-relocate.cli.test.ts`, `server/photo-sweep.cli.test.ts`)
  time out under WSL on a Windows drive, on `origin/main` as well. Worth a `debt` issue: confirm they pass in CI or on a native
  filesystem, or raise their timeouts.
- `server/ai/tagPhoto.test.ts` › "413 for a streamed body over 2 MB without a length" is flaky (`ECONNRESET`).
- From `security-review.md`: avoid the double re-encode (G3), a pixel cap in `loadImage` (G4), map English `cause.message` in
  `PhotoSaveError` to Vietnamese copy (G5), and a decision on server-side EXIF stripping.
