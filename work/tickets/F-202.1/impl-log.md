# Implementation log — F-202.1

## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/data/photoPrep.ts` (new) | `preparePhoto`, `photoKind`, `PhotoPrepError`, size/encode constants (plan step 1) |
| `src/data/photoPrep.test.ts` (new) | R8 unit tests for the above |
| `src/data/photos.ts` | Extracted `loadImage` / `renderJpeg`; `resizeImage` keeps its signature |
| `src/data/repo.http.ts` | `prepare` (default `preparePhoto`) runs before the item PUT |
| `src/data/repo.http.test.ts` | New order, prepare-failure and 413/415/503 cases |
| `src/data/apiErrors.ts` | `PHOTO_UPLOAD_ERROR_COPY` used by `PhotoSaveError` for 413/415 |
| `src/data/apiErrors.test.ts` | Tests for the photo copy mapping |
| `src/features/items/copy.ts` | Hint, busy and error copy (R6) |
| `src/features/items/Editor.tsx` | `preparePhoto` + object URL instead of `FileReader`; busy and error UI |
| `src/features/items/Editor.test.tsx` | Editor photo tests |
| `src/App.test.tsx` | `@/data/photos` mock extended with `loadImage` / `renderJpeg`; URL stubs |
| `src/index.css` | `.photo-busy` / `.photo-error` section |

### Tests added / changed
- `photoPrep.test.ts`: all plan cases (photoKind, 10 MiB rule, ENCODE_STEPS walk, HEIC paths, release, error copy, 2 MiB pin).
- `repo.http.test.ts`, `apiErrors.test.ts`, `Editor.test.tsx`, `App.test.tsx`: as listed in the plan.
- `useWardrobe.test.tsx` needed no change (its `./photos` mock still passes).

### Checks (actual output summary)
- typecheck: green (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test: 1273 passed, 15 failed, 205 skipped. All 15 failures are in untouched `server/index.cli.test.ts`, `server/photo-relocate.cli.test.ts` and `server/photo-sweep.cli.test.ts` (spawned-process timeouts of 5-40 s under WSL on /mnt/d; 3 still fail when those files run alone). Every F-202.1 test file passes.
- build: green, no new chunk (index 263 kB, AuthRoot 30 kB).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The server CLI spawn tests time out under WSL on /mnt/d; confirm they pass in CI/native.
- F-202.3: lazy-loaded HEIC decoder (see plan Split proposal).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +375 / -67 lines tracked, plus the two new photoPrep files.
