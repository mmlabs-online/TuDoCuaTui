# Security review — F-202.1

## Attempt 1 (2026-11-17, security-ai-generated-code-auditor)

No 🔴 blockers. Two 🟡 should-fix items, both in how the editor handles a photo pick that is still being prepared. None of the issues lets one user see or change another user's data.

Scope: `src/data/photoPrep.ts`, `src/data/photos.ts`, `src/data/repo.http.ts`, `src/data/apiErrors.ts`, `src/features/items/Editor.tsx`, the save/close/duplicate flows in `src/App.tsx`, the SPA CSP in `server/http.js`, the new CSS in `src/index.css`. Read-only; nothing was run.

### Findings

**🟡 Y1 — A photo still being prepared can land on a different item** (`src/features/items/Editor.tsx:74-86`, with `src/App.tsx:102-103` and `185-193`)
- The unmount cleanup (`useEffect(() => revokeOwn, [])`) does not invalidate an in-flight pick (`pickSeq`). Pick a large photo, close the editor, open another item before `preparePhoto` finishes: the old editor's `upload` passes the `seq` check and calls `update("photo", url)`, and App's `update` changes whichever item is open now.
- Effect: item B shows item A's photo; saving uploads the wrong photo to B. Data integrity within the user's own account, not a privilege problem. Closing during prep shows no "discard changes?" prompt (`isDirty` is false), so it is easy to hit.
- Second effect: the object URL created after close is stored in a ref that is never cleaned up (up to 2 MiB leak each time).
- Fix: `useEffect(() => () => { pickSeq.current++; revokeOwn(); }, [])`, plus a regression test (close during an in-flight pick, open another item, `update` is never called with that URL). Ticket object-URL requirement ("revoke on replace/close"), R8.

**🟡 Y2 — "Duplicate" during prep carries the photo over and leaks the old URL** (`src/App.tsx:195-205`, `src/features/items/Editor.tsx:66-73`)
- Duplicate keeps the editor open and clears `photo`, but does not invalidate the in-flight pick or revoke `ownUrl`; the pick attaches the original's photo to the copy, and the old blob URL lives until close.
- Fix: a `resetPhoto()` in Editor (bump `pickSeq`, `revokeOwn()`, clear `preparing`/`photoError` — same steps as "Bỏ ảnh", lines 208-211), called before `onDuplicate()`.

**🟢 G1 — EXIF/GPS stripped on every upload, client-side only.** Every `blob:`/`data:` photo is re-encoded through canvas (`repo.http.ts:75-78`, `photos.ts:30-37`). The server does not enforce it; a direct API caller can store EXIF in their own photo. Accept; record as a known gap.

**🟢 G2 — Upload body well bounded** (`repo.http.ts:31-40, 73, 87`): prepared JPEG ≤ 2 MiB, fixed `Content-Type: image/jpeg`, id checked with `isUuid` or generated, `credentials: "same-origin"`, `redirect: "manual"`.

**🟢 G3 — Double re-encode** (`Editor.tsx:81` and `repo.http.ts:77`): quality/CPU cost only. Later cleanup: keep the prepared blob or pass the Blob directly, which would also let `blob:`/`data:` leave `connect-src` (T-022 follow-up).

**🟢 G4 — Type checks** (`photoPrep.ts:17-44`): SVG/GIF/PDF/unknown rejected; extension only as fallback. Limit: a tiny PNG/WebP with huge dimensions passes the 10 MB check and is fully decoded (self-DoS only). Suggest a pixel cap (e.g. 50 MP) in `loadImage` → `unreadable`. Not required here. Transparent PNGs become JPEGs with a black background.

**🟢 G5 — Error messages leak nothing** (`apiErrors.ts:45-53, 70-82`; `Editor.tsx:89-91`). Optional: `PhotoSaveError` still appends `cause.message` for non-API errors (e.g. English "Failed to fetch") — map to `API_ERROR_COPY.network` / `photo_upload_failed` (R6).

**🟢 G6 — CSP compatible.** `blob:` previews allowed by `img-src`; `fetch(blob:/data:)` allowed by `connect-src` since T-022 (`server/http.js:11-12`). No new script/worker/WASM/origin. F-202.3 (libheif WASM) will need `'wasm-unsafe-eval'` — High-tier CSP change for Ming.

**🟢 G7 — Decoding cleans up its URLs** (`photos.ts:4-21`): revoked on failure and in `release()`, called in `finally`.

### Recommendations
1. Fix Y1 with a regression test — the only finding to hold PASS for.
2. Fix Y2 in the same commit (same reset helper).
3. G3, G4 pixel cap and G5 copy → follow-ups (R7), not this diff.

### Risks
- Y1 can be hit in normal use on a slow phone, and a wrong-photo save is silent.
- EXIF stripping depends on every upload path going through `preparePhoto`; F-603 and F-702 must call it.

### Open questions
- Server-side metadata stripping, or client-only? Suggested default: client-only, recorded in `work/decisions.md`.

## Attempt 2 (2026-11-17, security-ai-generated-code-auditor) — re-check of 791d711

Result: Y1 and Y2 fixed with regression tests; the rework introduced no new security issue. No 🔴. Read-only; nothing run.

**🟢 Y1 fixed** (`src/features/items/Editor.tsx:80-86`): unmount cleanup bumps `pickSeq` then `revokeOwn()`; the `seq !== pickSeq.current` check (line 94) runs before `URL.createObjectURL` (line 95), so a late pick creates no URL and never calls `update("photo")`. Test `Editor.test.tsx:114-125` (unmount during pick → no `update("photo")`, no `createObjectURL`). StrictMode double cleanup is harmless.

**🟢 Y2 fixed** (`Editor.tsx:74-79`, `:401-404`): `resetPhoto()` bumps `pickSeq`, clears `preparing`/`photoError`, revokes `ownUrl`; runs before `onDuplicate()` and is shared with "Bỏ ảnh" (line 220). Tests `Editor.test.tsx:127-133`, `:135-146`.

**🟢 Revoking during a save is safe**: `repo.http.ts:75-78` reads the blob before any PUT; an already-started `fetch(blob:)` is not cancelled by revoke. Worst case is a plain save error, never a partial save.

**🟡 Pre-existing, out of this diff (R7) — Duplicate and Delete stay clickable during a save** (`Editor.tsx:395-404`, `App.tsx:87-95`, `:195-206`). Duplicate during a successful save loses the copy silently; during a `PhotoSaveError` the copy gets the original's id and `isNew=false`, so the next save overwrites the original with "(bản sao)" data. Own-account integrity only. Suggested follow-up: `disabled={saving || preparing}` on Duplicate and Delete, plus a test.

### Recommendations
1. Y1/Y2 closed; no further security changes for this ticket.
2. Record the 🟡 as a follow-up / `debt` issue.
3. Attempt-1 follow-ups stand (G3, G4, G5).

### Risks
- The fix depends on the `seq` check staying before `URL.createObjectURL`; test 114-125 guards it.

### Open questions
- None new. Server-side EXIF stripping still open; default: client-only, recorded in `work/decisions.md`.
