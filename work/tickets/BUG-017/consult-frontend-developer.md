## Findings (client side, read-only)

1. **Single URL, single size.** `src/data/photoUrls.ts` fetches only `${base}/photos/${id}` (line 68) and caches one blob per photo id. `apiPhotoId`/`apiPhotoUrl` in `src/data/mappers.ts:173-182` accept only exactly `/api/photos/<uuid>`, with no query or variant. The loader cannot ask for a thumbnail today.
2. **Every consumer shares that one size.** `ItemPhoto` is used by `ItemCard.tsx:31`, `Hero.tsx:42` and `OutfitsModal.tsx:39`. `Editor.tsx:71` calls `usePhotoUrl` directly for the full-size view, so the editor is the only place that needs full size.
3. **`ItemPhoto.tsx` already has the cheap attributes.** It sets `loading="lazy"` and `decoding="async"`, and `usePhotoUrl` uses an IntersectionObserver with a 300px rootMargin, so off-screen photos are neither fetched nor held. What it lacks is `width`/`height`. The `.photo-pending` placeholder is 100%x100% inside `.photo-wrap` (so layout shift is probably already contained by the wrapper's size). Check `.photo-wrap` has a fixed aspect ratio, and that `object-fit` is set.
4. **Caching and revocation are sound.** `createPhotoLoader` uses refcounted entries, 4 concurrent fetches, and an LRU `keepUnused=40` that revokes object URLs on eviction and on `clear()`. Gap: 71 items can overflow 40 unused entries, so scrolling back refetches, and decoded bitmaps of 1.4MP images are still large. Smaller blobs fix both memory and decode cost.
5. **Server.** `servePhoto` (`server/photos.js:324`) streams the Drive file as-is, with ETag `"<photoId>"` and cache headers. There is no resize, no `sharp` dependency, and no `?size=` handling. The route table in `server/api.js:54` allows only `GET /api/photos/:id`. So a real thumbnail needs either a server variant (High path, plan approval) or a client-generated thumbnail at upload.
6. **Upload resize (client).** `preparePhoto` in `src/data/photoPrep.ts` has a 1200px ladder (quality 0.82, 0.7, 0.55), with an off-thread path and a main-thread fallback (`photos.ts` `renderJpeg(img, max, quality)`). This matches the ~1200px blobs in the UAT. Existing photos (71) are already stored full-size, so a client-only thumbnail at upload would not fix them, and ticket scope forbids changing the pipeline beyond adding a thumbnail size.
7. **CSS (outside my focus but relevant).** `.wear-pill` is at index.css lines 415, 438, 1844, and 2602 sits in a media query. The UAT says no long tasks, so the cost is paint and compositing. Both full-size decode and `backdrop-filter` are suspects, so the profile must separate them.

## Recommendations

- **R-A, thumbnail variant via the API (R1, R4).**
  - Add a `size` concept to the data layer only: `apiPhotoUrl(id, base, "thumb")` returns `/api/photos/<id>?size=thumb`, and `apiPhotoId` ignores the query. Make `PhotoLoader.acquire(src, variant?)`, keyed by `id + variant`, so thumb and full blobs never collide in the cache.
  - `ItemPhoto` takes a `variant` prop, defaulting to `"thumb"`. The editor keeps full size by passing `variant="full"` or by using `usePhotoUrl` as it does now.
  - Components still never call `fetch`, so R1 and R4 hold, and the bearer token stays in the Authorization header.
  - The server needs a resize (for example `sharp`, a new dependency) plus on-demand caching. That is a High-path change, so plan approval is needed. Server-side detail is outside my read.
- **R-B, client-only fallback if the server variant is rejected.**
  - At upload, additionally render a ~320px thumbnail via `renderJpeg` and PUT it as a second variant. This needs server and DB changes too, and existing photos would stay full-size.
  - A backfill is awkward on the client alone: fetch the full blob, downscale to a canvas, and display that. It saves GPU memory but not bandwidth, and costs main-thread work. Not recommended as the primary fix.
- **Attributes.** Add `width`/`height` (or CSS `aspect-ratio`) and `sizes` on the `<img>` only if a `srcset` is used. Blob URLs make `srcset` pointless, so skip it. Keep `loading="lazy"` and `decoding="async"`.
- **Pill blur.** Replace the `.wear-pill` `backdrop-filter` with a solid translucent background in the CSS, as the ticket scope says. This is cheap to ship alongside. Measure each change separately (see the perf check below) so the impl-log shows which one mattered.
- **Cache size.** Consider raising `keepUnused` only after thumbnails land, since small blobs make a larger LRU cheap.

## Regression test (Vitest + jsdom, fails on main)

- `photoUrls.test.ts` (extend): create the loader with a fake `fetchFn`. `acquire("/api/photos/<uuid>", "thumb")` must fetch a URL containing `size=thumb`. On main this fails because there is no variant parameter and it always fetches the bare URL. Also assert that thumb and full acquires of the same id cause two fetches and two separate object URLs, and that `release`/eviction revokes each.
- `ItemPhoto.test.tsx` (extend): with the existing `fakeLoader`, render `<ItemPhoto>` with no variant prop and assert `acquire` was called with `"thumb"`. Render with `variant="full"` and assert `"full"`. Also assert the img carries `width`/`height` if those are added.
- `ItemCard`/`Hero` test: render with a fake loader and assert `acquire` receives the thumb variant. The editor test should assert it keeps full size (`Editor.test.tsx` already injects a `PhotoLoader`).
- `mappers.test.ts`: `apiPhotoId` accepts the thumb URL and still rejects non-uuid ids and other prefixes.
- Server (if R-A): `server/photos.test.ts` covers `size=thumb` returning a smaller JPEG with its own ETag, so a cached thumb never answers a full request. The ETag must include the variant.
- jsdom cannot measure frame rate or decode cost, so these tests prove only that the right variant is requested.

## One-off perf check (Playwright/DevTools, record in impl-log)

- Before and after, on the same 70-item account. Scroll the grid to the end with Chrome tracing, with CPU throttling 4x and a mobile viewport (390px).
- Record fps (rAF sampling), screenshot timeouts, bytes transferred, and decoded image memory (the Layers or Rendering panel).
- Do three runs: baseline, thumbs only, and thumbs plus pill blur removed, to attribute the gain.
- Also run on a real phone, since the UAT window may have been throttled.

## Risks

- **High-path server change.** The thumbnail route in `server/` triggers plan approval and High review. A pure-client approach avoids that but cannot fix existing photos.
- **Cache poisoning of ETags.** The ETag is `"<photoId>"`. A variant sharing it would return 304 for the wrong size, so the variant must be part of the ETag and of any HTTP cache key.
- **Merge conflicts.** `Editor.tsx` and `Modal.tsx` are touched by unmerged BUG-014 and BUG-016, and `App.tsx` and `index.css` by T-032. Keep the `Editor.tsx` change minimal (at most one line passing the full-size variant), and put the CSS edits in the `.wear-pill` blocks only. Rebase after those branches merge.
- **Unconfirmed cause.** If the profile shows the blur dominates, the thumbnail work may be a smaller win. The ticket already requires measuring first.
- **Thumb quality.** Hero collage tiles may be larger than card tiles, so one 320px size may look soft there. Pick the size from the largest display size times devicePixelRatio.

## Open questions

1. Server-generated variant (needs `sharp`, High path, plan approval) or client-generated at upload (no help for the 71 existing photos)? Default: server-side, resized lazily and cached on disk.
2. Is a backfill of existing photos needed, or does on-demand server resize make it moot? Default: on-demand.
3. One thumb size (default 360px longest edge) or separate sizes for cards and the Hero collage?
4. Does `sharp` fit the Docker image on the home server (native build, ARM or x86)? Needs checking.
5. Can the profile be run on Ming's phone, or should the one-off run use CPU throttling only?

Files read: `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\photoUrls.ts`, `src\data\usePhotoUrl.ts`, `src\data\photos.ts`, `src\data\mappers.ts`, `src\components\ItemPhoto.tsx`, `src\components\ItemPhoto.test.tsx`, `server\api.js`, `server\photos.js`, `src\index.css`, `work\tickets\BUG-017\ticket.md`. I did not read the other branches or `ItemCard.tsx`/`Hero.tsx` in full.
