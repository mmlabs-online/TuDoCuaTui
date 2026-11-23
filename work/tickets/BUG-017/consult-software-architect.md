## BUG-017 consult (software-architect, read-only)

### Findings
1. **How photos get to the grid now.**
   - **Upload:** `src/data/photoPrep.ts` (`ENCODE_STEPS`, max 1200 px) resizes on the client in a worker (`photoWorkerHost.ts`, using OffscreenCanvas and createImageBitmap), or on the main thread if there is no worker (`photos.ts`).
   - **Server:** `PUT /api/items/:id/photo` stores one JPEG per item on Drive (`server/photos.js`, `putPhoto`). `GET /api/photos/:id` (`servePhoto`) streams that file as it is. Headers are `private, no-cache` with `ETag = "<photoId>"`, so a repeat fetch is answered with a 304.
   - **Client:** `src/data/photoUrls.ts` (`createPhotoLoader`) fetches it with the bearer token and turns it into a `blob:` URL. Each photo id has one cache entry, and up to 40 unused URLs are kept (oldest dropped first).
   - **Display:** `usePhotoUrl` → `ItemPhoto` (already has `loading="lazy"`, `decoding="async"`, and IntersectionObserver with `rootMargin` 300px) → `ItemCard`, `Hero` collage and `OutfitsModal`. The `Editor` calls `usePhotoUrl(item.photo, { lazy: false })` itself.
   - **Result:** every surface gets the same ~1200 px original, and there is no size variant anywhere.
2. **Lazy-loading and decode hints are already in place.** The "just add hints" option gains nothing.
3. **The server has no image library.** Dependencies are only `jose`, `pg`, `react`, `react-dom`, and `drive.js` is plain fetch with "no dependency". Resizing on the server would mean adding `sharp` (a native dependency that changes the Docker image, which is a High path) or proxying Drive's `thumbnailLink`.
4. **The client already has a resizer we can reuse.** The `PhotoDeps` interface (`load(blob)` / `render(img, max, quality)`) with `getOffThreadDeps()` and the `mainThreadDeps` fallback can downscale a fetched blob off the main thread.
5. **CSS.**
   - `backdrop-filter: blur(6px)` is on the shared `.badge, .wear-pill` rule (`src/index.css:421`), so it applies to badges too.
   - Both already have near-opaque backgrounds (pill `rgba(31,29,26,0.78)`, badge `rgba(255,255,255,0.88)`), so removing the blur is almost invisible.
   - Line 1844 has no `backdrop-filter`. The other blurs are `.topbar` at line 69 (16px; sticky over a scrolling grid, so it is re-blurred on every frame) and `.modal-backdrop` at line 522.
   - Also in the picture: cards are rotated (`nth-child` rotate ±0.5deg, lines 1813–1818), and hovered images get `transition: 0.35s` plus `scale`.
6. **Possible measurement problem.** In the UAT, `requestAnimationFrame` ran at 2–4 fps with **no long tasks**. That also matches a throttled or hidden window under automation. The "measure first" step must use a foreground window or a real phone, or the before/after numbers mean nothing.
7. **Scrolling back reloads photos.** `usePhotoUrl` releases a photo when it leaves the viewport. With 71 items and only 40 cached URLs, scrolling back fetches (304) and decodes again.

### Recommendations
**R-A (recommended, smallest fix): downscale on the client when the photo is displayed, and drop the backdrop-filter. No `server/**`, no `db/migrations/**`, so no plan-approval gate.**
- `src/data/photoUrls.ts`:
  - Add `acquire(src, { variant: "thumb" | "full" })`, with a separate cache entry per variant (e.g. key `${id}#thumb`).
  - Thumb flow: fetch the same `/api/photos/:id`, then call an injected `makeThumb(blob)`, then `createUrl`.
  - `makeThumb` reuses `PhotoDeps`: `load` + `render(img, THUMB_MAX, 0.8)`, off-thread first and on the main thread otherwise.
  - **Never fail the display:** if making the thumb fails, resolve with the full blob.
  - Raise `keepUnused` for thumbs (e.g. 150; 71 thumbs of ~30–50 KB each is trivial) so scrolling back does not reload.
- `THUMB_MAX` is a constant for the longest edge, about **480 px**. The largest display is ~180×240 CSS px, so this is about 2× DPR. It holds 6.25× fewer pixels than 1200 px, which meets "close to display size".
- `src/data/usePhotoUrl.ts`: add an optional `variant` that defaults to `"full"`. `src/components/ItemPhoto.tsx` passes `"thumb"`, which covers `ItemCard`, `Hero` and `OutfitsModal` without touching them. **`Editor.tsx` stays unchanged and full size**, which avoids the BUG-014/BUG-016 hotspot.
- `src/data/useWardrobe.ts`: inject `makeThumb` into `createPhotoLoader` (photoUrls stays testable with a fake).
- `src/index.css`: delete line 421 only. That one-line change keeps the conflict with T-032's `index.css` edits small. Touch `.topbar` (line 69) only if the profile shows it matters; it overlaps T-032.
- **Existing photos:** nothing to backfill, because thumbs are made on read. Every existing and future photo is covered at once, and falling back to full size is built in.
- **Regression test (meets the first acceptance criterion, fails on `main`):**
  - `photoUrls.test.ts`: acquiring a `thumb` calls `makeThumb` and resolves to the thumb blob's URL; a `makeThumb` failure falls back to the full blob; thumb and full are cached separately.
  - `ItemPhoto.test.tsx` / `ItemCard.test.tsx`: the card asks the loader for the `thumb` variant.
  - Editor test: the editor still asks for `full`.
- **R8:** the new pure logic (variant keying, fallback) gets unit tests. Record the frame rate as a one-off Playwright/DevTools run in impl-log, as `loop.config.md` asks.

**Alternatives considered (not recommended for this ticket):**
- **R-B: client makes a thumbnail at upload and stores it next to the photo.**
  - Needs `server/**` (PUT takes two parts, GET takes `?size=`) and `db/migrations/**` (`thumb_drive_file_id`). Both are High, so the plan needs Ming's approval.
  - Doubles Drive files and quota. Sweep, relocate, backup and delete (`photo-sweep.js`, `photo-relocate.js`, `backup.js`, `deleteDriveFiles`) would all need to know about thumbs.
  - The 71 existing photos would need a backfill script or a fallback to full size.
  - It arguably conflicts with Out of scope ("changing photo storage on Google Drive").
  - Its only real gain is fewer bytes on the network.
- **R-C: server-side resize.** Either `sharp` (new native dependency, Docker image change, CPU on the home server; High) or a proxy for Drive's `thumbnailLink`.
  - The Drive route needs no migration and no backfill.
  - But it is `server/**` (High), costs an extra metadata call per photo, and `thumbnailLink` is short-lived and may not exist right after upload, so a fallback is still needed.
  - Sizing it depends on the undocumented `=sNNN` suffix, which is fragile.

### Risks
- **Network bytes stay the same.** Each card still downloads the ~150–300 KB original (~15 MB for 71 items, mostly answered by 304 after the first visit). R-A fixes decoding, painting and memory, not mobile data. If Ming counts bytes as part of "close to display size", only R-B or R-C does that.
- **Extra CPU once per photo per session to make the thumb.** It runs in the worker when available. Old Safari (no 2d OffscreenCanvas, before 16.4) falls back to the main thread and could jank during the first scroll. The 4-at-a-time loader limit spreads this out. Check on a mid-range phone.
- **Shared worker.** Thumb jobs and upload resizes share one worker. Its 20 s `requestTimeoutMs` marks the worker broken for the whole page. A burst of thumb jobs must not starve an upload or trip that timeout, so keep thumb work behind the loader's 4-at-a-time limit, or give thumbs their own worker.
- **Orientation.** `createImageBitmap` uses `imageOrientation: "from-image"`. Uploads are already re-encoded by canvas, which normally drops EXIF, so this should be a no-op.
- **The measurement itself (finding 6).** If the before-profile in a real foreground window is already smooth, the fix may be cosmetic. The planner should record the profile before writing code, as the ticket says.
- **Branch conflict.** `index.css` overlaps T-032. Keep the CSS change to the single line.

### Open questions (for Ming, batched)
1. Does "thumbnails close to their display size" mean decoded pixels only (R-A is enough) or also bytes on the network (R-B/R-C, High gate, likely outside the stated scope)? **Default: pixels only, R-A.**
2. Should `THUMB_MAX` be a fixed 480 px or based on `devicePixelRatio`? **Default: fixed 480; easier to test and cache.**
3. Should the `.topbar` blur (16px) be removed too, if the profile blames it? It overlaps T-032's `index.css`. **Default: only if the profile shows it; otherwise record it as a follow-up.**
4. Should the rotated cards and hover `scale` be measured but left alone (outside the ticket)? **Default: yes, record as a follow-up if the profile flags them.**

**Relevant files** (all under `D:\Projects\SAF\spaceM\projects\tudocuatui\`):
- `src\data\photoUrls.ts`
- `src\data\usePhotoUrl.ts`
- `src\components\ItemPhoto.tsx`
- `src\data\useWardrobe.ts`
- `src\data\photoPrep.ts`
- `src\data\photoWorkerClient.ts`
- `src\data\photoWorkerHost.ts`
- `src\data\photos.ts`
- `src\index.css` (line 421)
- `server\photos.js` (reference only)
- `server\drive.js` (reference only)
- `src\features\items\Editor.tsx` (do not touch)
