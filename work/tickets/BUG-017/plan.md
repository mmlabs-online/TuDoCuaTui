Status: READY

# Plan — BUG-017: Full-size photos are used for small grid thumbnails and rendering slows down

## Scope summary
Bug ticket: the scope reference is the bug report in `work/tickets/BUG-017/ticket.md`.

- Expected: "Thumbnails close to their display size; smooth scrolling (≥ 50 fps) on a mid-range phone."
- Scope: "Measure first. If confirmed: serve or generate a thumbnail size for cards and the hero collage (full size
  only in the editor), and replace the wear-pill `backdrop-filter` with a solid translucent background."
- Out of scope: "Changing photo storage on Google Drive, or the upload resize pipeline beyond adding a thumbnail size."
- Technical notes: "possibly `server/` photo route (High path → would need plan approval if a server size variant is
  chosen)."
- Feature list F-202 (`docs/feature-list.md:146`): "Grid uses lazy-loaded images". Already true; this plan keeps it.
- D34 (`work/decisions.md:43`): photos are fetched "with the bearer and renders `blob:` URLs; responses
  `private, no-cache` + ETag." This plan does not change it.

### Root cause (confirmed in code; the paint cost itself is confirmed by Ming's profile, see below)
- `src/data/photoUrls.ts:68` fetches the one stored file, `${base}/photos/${id}`. There is one cache entry per id
  (`photoUrls.ts:108`) and no size variant.
- `src/data/photoPrep.ts:13-19` (`ENCODE_STEPS`, max 1200) is the only resize, and it runs at upload. Every stored photo
  is therefore about 1200 px on its long edge.
- `src/components/ItemPhoto.tsx:15` is used by `ItemCard.tsx:31`, `Hero.tsx:42` and `OutfitsModal.tsx:39`. It shows
  that same blob at about 110–180 CSS px. Each card decodes and paints about 1.4 MP.
- `src/index.css:421`: `backdrop-filter: blur(6px)` sits on the shared `.badge, .wear-pill` rule, so every card has
  one or two blurred layers. The pills already have near-opaque backgrounds: `rgba(31,29,26,0.78)` at line 441 and
  `rgba(255,253,248,0.92)` at line 1844, where the badge is `#fffdf8`. Removing the blur is the "solid translucent
  background" the Scope asks for.
- The UAT saw "no long tasks", which fits paint/decode cost. It also fits a throttled automation window
  (architect finding 6). Agents cannot sign in to measure, so Ming records the before/after profile (see
  "Ming verification"). The code fix does not depend on that profile.

### Decision: R-A (the client makes the thumbnail on display), not a server variant
- **Expected** asks for thumbnails "close to their display size". A 480 px decoded thumb has about 6.25× fewer pixels
  than 1200 px, and the card's decode, paint and memory cost scales with pixels. The client-side option meets the
  Expected text for every photo that exists or will exist, with no backfill.
- **Out of scope** excludes "changing photo storage on Google Drive, or the upload resize pipeline beyond adding a
  thumbnail size". R-B (a thumb stored at upload) adds a second Drive file per item, a DB column
  (`db/migrations/**`) and sweep/backup/relocate changes. That is a storage change. R-C (`sharp` on the server) adds a
  native dependency and a Docker image change. Both are High paths, and the Scope says "serve **or generate**", so
  the generate option is allowed.
- **No High path is touched by this plan** (`server/**`, `db/migrations/**`, Docker and deploy files are not in the
  file list). Gate stays `none`. The server variant stays an open option for Ming (Assumption A1).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: it fails on `main` before the fix and passes after | Implementer records in impl-log that the tests marked "regression" below were run first against unchanged `src/` and failed (paste the failing test names), then pass after the fix. Reviewer re-runs `pnpm test` and checks that, with `src/data/photoUrls.ts`, `src/components/ItemPhoto.tsx` and `src/index.css` checked out from `main` (`git stash`/`git checkout main -- <files>` locally), these fail: `photoUrls.test.ts › thumb variant: makeThumb gets the fetched blob and createUrl gets its result`, `ItemPhoto.test.tsx › asks the loader for the thumb variant`, `ItemCard.test.tsx › ItemCard photo › asks the loader for the thumb variant`, `cardPaint.test.ts › card badges and wear pills have no backdrop-filter`. |
| 2 | Cards, hero collage and outfit tiles use the thumbnail; the editor keeps full size | `ItemPhoto.test.tsx › asks the loader for the thumb variant`; `usePhotoUrl.test.tsx › default variant is full (editor path)`; `git diff main -- src/features/items/Editor.tsx` is empty. |
| 3 | The thumb never breaks display: if making the thumbnail fails, the full photo is shown | `photoUrls.test.ts › thumb variant: a makeThumb failure falls back to the full blob`; `photoThumb.test.ts` cases. |
| 4 | Thumb and full are cached separately, and scrolling back over ~70 cards does not refetch or regenerate | `photoUrls.test.ts › thumb and full of the same id are separate entries`, `› thumbs use their own keepUnused limit (default 150)`, `› clear revokes thumb URLs too`. |
| 5 | Wear-pill and badge `backdrop-filter` replaced by the existing solid translucent background | `cardPaint.test.ts`; `git diff main -- src/index.css` shows exactly one removed line (old line 421) and nothing else. |
| 6 | Profile before/after recorded in impl-log; scrolling the grid is smooth | Agents cannot sign in, so this is split. The reviewer checks that impl-log has the measurement procedure below and states that the numbers are Ming's step. Ming records the numbers (see next section). The reviewer does **not** block PASS on the numbers. |
| 7 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` green. |
| 8 | R9: 390px viewport and dark mode unchanged | No layout change. The only visual change is the pill/badge blur, which sits behind 0.78–0.92 opacity. Reviewer looks at `src/index.css` and confirms that no dark-mode rule redefines `.wear-pill`/`.badge` with a transparent background. |

## Ming verification after merge
Ming runs these himself (real sign-in). Paste the numbers into `work/tickets/BUG-017/impl-log.md` under "Profile", or
into the Handoff.
1. **Before** (production v0.3.1, or `main` before this merge), in a foreground Chrome window on Windows (not under
   automation), on the account with ~70 photo items:
   - DevTools → Performance, record while scrolling the grid to the end and back.
   - Note: the FPS / frames chart (dropped frames), the total "Paint" + "Decode Image" + "Rasterize" time, and whether
     any long tasks appear.
   - Optional: Rendering panel → "Frame rendering stats".
2. The same on a mid-range phone, if available. Android Chrome with remote DevTools, or just whether it feels smooth.
3. **After** the release that contains BUG-017, the same steps. Expected: ≥ 50 fps while scrolling and much less
   Decode Image / Paint time.
   - In DevTools → Elements, a card `<img>` should report about 480 px natural size (`$0.naturalWidth`). The editor
     image should still be about 1200 px.
4. Look check on phone and desktop, light and dark mode: card, hero collage and outfit tiles are not visibly soft; the
   wear pills and badges look the same as before.
5. If "before" is already smooth in a foreground window (the UAT numbers came from throttling), say so. The fix still
   reduces decode and memory, but it then counts as a cleanup, and the `.topbar` follow-up (A4) is dropped.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/data/photoThumb.ts` (new) | `THUMB_MAX = 480`, `THUMB_QUALITY = 0.8`. `thumbWith(blob, deps)` loads the blob, returns the original blob unchanged when its long edge is ≤ `THUMB_MAX`, otherwise `deps.render(img, THUMB_MAX, THUMB_QUALITY)`, and always calls `img.release()`. `makeThumb(blob, sources = { offThread: getOffThreadDeps, main: mainThreadDeps })` tries off-thread first and the main thread on any failure. | Pure, testable thumbnail generation that reuses the existing `PhotoDeps` resizer (architect finding 4), with no new dependency | No |
| `src/data/photoUrls.ts` | Add `export type PhotoVariant = "thumb" \| "full"`, `acquire(src, variant: PhotoVariant = "full")`, options `makeThumb?: (b: Blob) => Promise<Blob>` and `keepUnusedThumbs = 150`. Thumb entries use key `${id}#thumb`; full entries keep key `id`. Thumb run: same fetch as today, then `makeThumb(blob)`; if it rejects, use the full blob; check `gen !== generation` after that await as well; then `createUrl`. Without `makeThumb`, a thumb acquire uses the full entry (same key). Each variant gets its own LRU limit. `drop`, `clear` and `release` work on the entry key. The fetch URL is unchanged. | The loader is the only place that can serve a smaller decoded image (R1: through the data layer, no component fetch) | No |
| `src/data/usePhotoUrl.ts` | Option `variant?: PhotoVariant` (default `"full"`), passed to `loader.acquire(src, variant)` and added to the effect deps. | Lets `ItemPhoto` ask for thumbs while `Editor.tsx` stays untouched and gets full by default | No |
| `src/components/ItemPhoto.tsx` | `usePhotoUrl(src, { lazy: true, variant: "thumb" })` | Covers `ItemCard`, `Hero` collage and `OutfitsModal` in one place ("full size only in the editor") | No |
| `src/data/useWardrobe.ts` | Pass `makeThumb` into `createPhotoLoader({ getToken, onAuthLost, makeThumb })` (one line plus import) | The real thumbnailer is wired only in the app; tests inject fakes, and jsdom never runs `Image`/canvas | No |
| `src/index.css` | Delete line 421 `backdrop-filter: blur(6px);` in `.badge, .wear-pill`. Nothing else. | Scope: "replace the wear-pill `backdrop-filter` with a solid translucent background". The backgrounds already exist at lines 427, 441 and 1839/1848. | No (hotspot T-032) |
| `src/data/photoThumb.test.ts` (new) | Unit tests for `thumbWith` / `makeThumb` with fake deps | R8 | No |
| `src/data/photoUrls.test.ts` | New variant/fallback/cache tests | R8, regression | No |
| `src/data/usePhotoUrl.test.tsx` (new) | Hook test: default variant `"full"`, explicit `"thumb"` passed through | Proves the editor path stays full without editing `Editor.tsx`/`Editor.test.tsx` (BUG-014/016 hotspot) | No |
| `src/components/ItemPhoto.test.tsx` | Assert `acquire` is called with `(src, "thumb")` | Regression | No |
| `src/features/items/ItemCard.test.tsx` | One test with a fake loader in `PhotoLoaderContext` asserting the thumb variant | Regression, matching the ticket's example ("the card requests the thumbnail variant") | No |
| `src/test/cardPaint.test.ts` (new) | Reads `src/index.css`. For every rule whose selector list contains `.wear-pill` or `.badge`, asserts it has no `backdrop-filter`. | jsdom cannot see CSS; static check like `src/test/indexHtml.test.ts` | No |
| `work/tickets/BUG-017/impl-log.md` | Regression run (fail before, pass after), the measurement procedure above marked "Ming's step" | AC 1 and 6 | No |

Not touched: `server/**`, `db/migrations/**`, `src/data/mappers.ts` (no `?size=` URL), `src/data/photoPrep.ts` and
`ENCODE_STEPS` (upload pipeline unchanged), `src/features/items/Editor.tsx`, `src/components/Modal.tsx`,
`src/App.tsx`, `Hero.tsx`, `ItemCard.tsx`, `OutfitsModal.tsx`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `photoUrls.test.ts › thumb variant: makeThumb gets the fetched blob and createUrl gets its result` (**regression**, fails on main) | `makeThumb` called once with the fetched JPEG blob; `createUrl` receives the blob `makeThumb` returned; the fetch URL is still exactly `/api/photos/<uuid>` with no `?` |
| `photoUrls.test.ts › thumb variant: a makeThumb failure falls back to the full blob` | Never fail display; promise resolves; no error leaks the token |
| `photoUrls.test.ts › thumb and full of the same id are separate entries` | Two fetches, two URLs; releasing one does not revoke the other |
| `photoUrls.test.ts › without makeThumb, a thumb acquire shares the full entry` | One fetch; keeps the existing `realGrid` tests in `ItemPhoto.test.tsx` working unchanged |
| `photoUrls.test.ts › thumbs use their own keepUnused limit (default 150)` | 150 released thumbs are kept (no revoke). The 151st evicts the oldest thumb, and full entries still evict at `keepUnused` |
| `photoUrls.test.ts › clear revokes thumb URLs; a makeThumb that resolves after clear creates no unrevoked URL` | Generation check after the extra await |
| `photoUrls.test.ts › queued thumb released before start is dropped` | Queue removal uses the entry key |
| `photoThumb.test.ts › an image larger than THUMB_MAX is rendered at THUMB_MAX, quality 0.8, and released` | Fake deps record `render(img, 480, 0.8)` and `release()` |
| `photoThumb.test.ts › an image already ≤ THUMB_MAX returns the original blob without render` | No needless re-encode |
| `photoThumb.test.ts › render failure still releases the image and rejects` | No leak |
| `photoThumb.test.ts › makeThumb: off-thread first; off-thread failure → main; no worker → main` | Same fallback as `preparePhotoAuto` |
| `usePhotoUrl.test.tsx › default variant is full (editor path)` | `usePhotoUrl(src, { lazy: false })` → `acquire(src, "full")` |
| `usePhotoUrl.test.tsx › variant "thumb" is passed to acquire` | Hook plumbing |
| `ItemPhoto.test.tsx › asks the loader for the thumb variant` (**regression**) | `acquire` called with `(API, "thumb")` |
| `ItemCard.test.tsx › ItemCard photo › asks the loader for the thumb variant` (**regression**) | The card path end to end with a fake loader |
| `cardPaint.test.ts › card badges and wear pills have no backdrop-filter` (**regression**) | CSS part of the fix (jsdom cannot see it) |

## Approach
1. **Regression first.** Add the four regression tests and run `pnpm test` on unchanged `src/`. Record the failures in
   impl-log. The `photoUrls` test passes `makeThumb` as an option that `main` ignores; typecheck errors are expected at
   that point. Only the Vitest failure counts.
2. Write `photoThumb.ts` with its tests. Reuse `PhotoDeps`, `getOffThreadDeps` and `mainThreadDeps`. The thumb code
   changes neither `ENCODE_STEPS` nor `preparePhoto` (Out of scope: the upload pipeline).
3. Extend `createPhotoLoader` with the variant key, the `makeThumb` step plus fallback, and the per-variant LRU.
   Thumb work runs inside the existing `run()`, so the 4-at-a-time limit (`maxConcurrent`) also caps how many thumb
   jobs reach the shared worker at once (architect risk "shared worker").
4. `usePhotoUrl` variant option (default full) → `ItemPhoto` passes `"thumb"` → `useWardrobe` injects `makeThumb`.
5. Delete `src/index.css:421`. Do not touch `.topbar` (line 69) or `.modal-backdrop` (line 522).
6. Write the impl-log: regression evidence, then the Ming measurement procedure (copy it from "Ming verification").
   Do not try to profile with a real sign-in.
7. Run the checks.

Rules:
- **R1**: no component calls `fetch`; the thumb is produced inside the data-layer loader, and no fallback mode is
  added.
- **R3**: nothing new reaches `VITE_*`; the bearer stays in the Authorization header.
- **R4 / D34**: photos still come only from `/api/photos/:id` with the bearer, as `blob:` URLs.
- **R5**: n/a.
- **R6**: no new UI copy.
- **R7**: only the files listed above.
- **R8**: new pure logic (`photoThumb`, variant keying, fallback, LRU) has unit tests.
- **R9**: no layout change. The blur removal is checked by Ming in light and dark mode.

## Specialist input used
- Architect R-A: **adopted** as the fix. It is the only option that meets Expected without touching Drive storage or
  a High path, and it covers the 71 existing photos without a backfill.
- Architect `THUMB_MAX` ≈ 480 (≈ 2× DPR of the largest ~180×240 tile): **adopted**. The frontend consult's 360 px is
  rejected because the hero collage tiles may be larger (frontend risk "Thumb quality").
- Architect: raise `keepUnused` for thumbs (finding 7): **adopted** as a separate thumb limit of 150. Without it,
  scrolling back would refetch **and** regenerate thumbs, which would be worse than today.
- Architect: thumb failure falls back to full; Editor untouched; CSS one-line change; `.topbar` only if profiled:
  **adopted**.
- Architect R-B / R-C, and frontend R-A (server `?size=thumb` with `sharp`, High path) plus its default "server-side,
  resized lazily and cached on disk": **not adopted**. The reasons are in "Decision" above. It stays open as A1.
- Frontend: `apiPhotoUrl`/`apiPhotoId` with `?size=`, and an ETag that includes the variant: **not needed**, because
  the URL does not change. The existing test `fetches the exact URL … not.toContain("?")` stays valid.
- Frontend: add `width`/`height` to the `<img>`: **rejected**. The ticket does not ask for it, and `.photo-wrap`
  already sizes the box, so it would be a layout change (R7).
- Frontend: `ItemPhoto` `variant` prop: **simplified**. All three users want the thumb, so `ItemPhoto` hardcodes
  `"thumb"`. A prop can come later if a full-size `ItemPhoto` is ever needed.
- Frontend: three-run attribution (baseline / thumbs only / thumbs + blur): **adopted as optional** in Ming's
  verification. Agents cannot run it.
- Frontend: tests in `Editor.test.tsx` / `Hero.test.tsx`: **replaced** by `usePhotoUrl.test.tsx` and the `ItemPhoto`
  test, to stay clear of the BUG-014/BUG-016 and T-032 branches.

## Assumptions
- **A1 (open question for Ming, non-blocking): "close to display size" means decoded pixels, not network bytes.**
  - R-A still downloads the ~150–300 KB original per card. After the first visit most of those are 304 responses
    (ETag, D34). It fixes decode, paint and memory, not mobile data.
  - If Ming wants fewer bytes too, the follow-up is a server variant (architect R-C or the frontend server option),
    which is a High path and needs plan approval.
  - **Default: pixels only; record a `debt` issue "BUG-017 follow-up: server-side thumbnail variant (bytes)".**
- **A2: fixed `THUMB_MAX = 480`, not based on `devicePixelRatio`.** It is deterministic, cacheable and testable.
  **Default: fixed 480.** Ming can ask for a change after the look check.
- **A3: the main-thread fallback is acceptable for thumbs** on browsers without a worker 2d `OffscreenCanvas`, such as
  Safari before 16.4.
  - The browser already decodes that image today.
  - The extra cost is one `drawImage` to 480 px per photo per session, capped at 4 at a time.
  - **Default: keep the fallback; Ming's phone check covers it.**
- **A4: `.topbar` blur (`index.css:69`, 16px) and the rotated cards / hover `scale` (lines 1813–1818) are left
  alone.** They are outside the ticket's Scope, and `.topbar` overlaps T-032. **Default: if Ming's after-profile still
  shows heavy paint under the topbar, open a follow-up ticket; otherwise nothing.**
- **A5: shared worker.**
  - Thumb jobs and upload/bulk-import resizes share one worker (`photoWorkerClient.ts:118`), and its 20 s
    `requestTimeoutMs` marks the worker broken for the page.
  - Thumb jobs are small (1200 px → 480 px) and capped at 4 by the loader, so starvation is unlikely.
  - If it happens, uploads fall back to the main thread, which is slower but correct.
  - **Default: no separate worker; record a follow-up only if seen.**
- **A6: the dev proxy mode** (`useWardrobe` without `getToken`) has no loader, so `pnpm dev` shows plain-URL photos
  and no thumbs. That is expected. Thumbs apply to the signed-in production path, the only one where the bug was seen.
- **A7: hotspots.**
  - `src/index.css`: T-032 (state DONE, unmerged) also edits it. The change here is one deleted line (421); expect a
    trivial rebase.
  - `src/App.tsx`: not touched.
  - `src/features/items/Editor.tsx`, `Editor.test.tsx`, `src/components/Modal.tsx` (BUG-014/BUG-016, DONE, unmerged):
    not touched.
  - `Hero.tsx`/`Hero.test.tsx` and `OutfitsModal.tsx` may be touched by T-032 (AI outfits). They are not edited here;
    the variant comes through `ItemPhoto`.
- **A8: Ming does the "measure first" step.** The fix ships without an agent-run profile. The code path (1.4 MP decode
  per 110–180 px tile, plus a blur layer per pill) is confirmed by file:line above. Ming's before/after numbers
  confirm or reject the paint hypothesis after merge.
  - If they reject it, the change is still safe and small (less decoding, less memory).
  - Any remaining jank becomes a new bug with the profile attached.

## Blocking questions
None.

## Split proposal
None. About 120 lines of source plus about 200 lines of tests, which fits one cycle.
