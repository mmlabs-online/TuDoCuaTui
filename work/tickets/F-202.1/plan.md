Status: READY

# Plan — F-202.1: Accept phone photo formats with size check and progress

## Feature summary
`docs/feature-list.md` §F-202 (lines 142–146):
- "Accept JPEG, PNG, WebP and **HEIC** (iPhone); convert HEIC client-side or show a clear error message."
- "Show upload progress; reject files over 10 MB before resizing."
- "**AC:** a photo taken on iPhone and on Android uploads successfully; …" (the "grid lazy-load / signed URLs" half
  was F-202.2, superseded by T-005.3.)

`work/decisions.md`:
- D3: "Keep 10 MB, as the feature list says."
- D4: "Convert on the client with a maintained HEIC decoder that is **lazy-loaded** only when a HEIC file is picked;
  on failure show a clear error."
- D27/D34: photos go through the Node server (`PUT /api/items/:id/photo`) and are shown as `blob:` URLs.
- D44: no local/demo mode; the app always runs against the Node API.

Ticket scope (quoted): accept JPEG/PNG/WebP/HEIC; "Reject files over 10 MB **before** resizing, with a Vietnamese
message"; "Show upload progress or a busy state on the photo while saving"; "Use object URLs instead of `FileReader`
data URLs for picked files"; "Shared helper `preparePhoto(file)` → `{ blob, width, height }` or a typed error. The
blob is always a JPEG that fits the server's upload limit … `repo.http.ts` uses it instead of calling `resizeImage`
directly"; "Map the photo upload errors from the Node API (`413 payload_too_large`, `415 unsupported_media_type`,
`429 rate_limited`, `503 photos_unavailable`) to Vietnamese messages in the editor."

Technical notes (quoted): server limit "body must be `image/jpeg` and at most **2 MiB** (`MAX_BYTES`)"
(`server/photos.js:17`, `:133-136`); "`preparePhoto` must guarantee the output is ≤ 2 MiB (for example, retry at
lower quality)"; "The HEIC decoder is a new dependency … must be lazy-loaded (separate chunk) and allowed by the CSP
(`script-src 'self'` — no CDN)."

**This plan covers everything above except bundling the HEIC decoder.** See `## Split proposal`. HEIC files are
still accepted. The browser's own decoder is tried first: Safari on iPhone/macOS decodes HEIC, and iOS usually hands
over a JPEG anyway. When the browser cannot decode the file (desktop Chrome/Firefox), the user gets a clear
Vietnamese error. That meets AC 3 ("either uploads or shows a clear error").

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A photo taken on an iPhone and one taken on an Android phone both upload successfully. | Unit: `photoPrep.test.ts` › "accepts the phone formats" (`image/jpeg`, `image/jpg`, `image/heic`, `image/heif`, and an empty type with `.HEIC`/`.jpg` names) and "returns a JPEG of at most MAX_UPLOAD_BYTES" (mocked decode). `repo.http.test.ts` › "save with a blob: photo prepares it before the item PUT and uploads the JPEG". `App.test.tsx` › "a failed photo step keeps the editor open …" still passes, now through the real `preparePhoto` with mocked canvas primitives. Real phones are under Ming verification. |
| 2 | A file over 10 MB is rejected with a message and nothing is uploaded. | Unit: `photoPrep.test.ts` › "rejects a file over 10 MiB before decoding" (`load` is never called; exactly 10 MiB is accepted). `Editor.test.tsx` › "a file over 10 MB shows the size message and does not set the photo" (`update` not called with `"photo"`; the `role="alert"` text equals `EDITOR_COPY.photo.errors.tooLarge`). `repo.http.test.ts` › "a photo that fails preparation throws before any request" (`fetchFn` not called). |
| 3 | A HEIC file picked on desktop Chrome either uploads or shows a clear error. | Unit: `photoPrep.test.ts` › "HEIC that the browser cannot decode → heicUnsupported" and "HEIC that the browser decodes → JPEG" (Safari path). `Editor.test.tsx` › "an undecodable HEIC shows the HEIC message". Real desktop Chrome is under Ming verification. |
| 4 | (Scope) Busy state on the photo while preparing and while saving. | `Editor.test.tsx` › "shows the preparing state while a pick is processed and disables Save" and "shows the uploading state while saving a new photo" (`role="status"` text = `EDITOR_COPY.photo.preparing` / `.uploading`). |
| 5 | (Scope) Object URLs instead of data URLs, revoked on replace, remove and close. | `Editor.test.tsx` › "a picked file sets a blob: URL of the prepared JPEG" (no `FileReader`; `update("photo", "blob:…")`), "replacing or removing the photo revokes the previous object URL" and "unmount revokes the object URL". `grep -n FileReader src/features/items/Editor.tsx` returns nothing. |
| 6 | (Scope) 413 / 415 / 429 / 503 from the photo upload show Vietnamese photo messages in the editor. | `apiErrors.test.ts` › "PhotoSaveError uses the photo copy for 413 and 415" and "keeps the existing copy for 429 and 503". `repo.http.test.ts` › the `test.each` for photo-step errors is extended with `[413, "payload_too_large"]`, `[415, "unsupported_media_type"]` and `[503, "photos_unavailable"]` and expects the photo copy. The message reaches the editor through the existing toast (`App.tsx:96`), and the editor stays open (existing App test). |
| 7 | Checks | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` are all green. `pnpm build` output contains no new chunk (no new dependency in this slice). |

## Ming verification after merge
This is M-6 in `work/ming-todo.md` ("Phone checks … F-202.1 (photo upload)"):
1. iPhone (Safari), on the deployed app: take a photo with "Chụp ảnh", save, and the photo appears in the grid. Also
   pick a HEIC photo from the library with "Chọn từ thư viện" and it uploads.
2. Android (Chrome): the same with the camera and the gallery.
3. Desktop Chrome: pick a `.heic` file. A clear HEIC message appears and nothing is uploaded.
4. Any browser: pick a file over 10 MB (e.g. 12 MB). The size message appears and nothing is uploaded.
5. On a slow connection (DevTools "Slow 4G"), the photo shows "Đang tải ảnh lên…" while saving.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/photoPrep.ts` (new) | `MAX_INPUT_BYTES`, `MAX_UPLOAD_BYTES`, `ENCODE_STEPS`, `photoKind()`, `PhotoPrepError`, `preparePhoto(file, deps?)`. Pure logic with injected `load`/`render`, so it is unit-tested and counted in coverage (`src/data/**`). | Scope: shared `preparePhoto`, typed errors, 10 MB rule, ≤ 2 MiB guarantee |
| `src/data/photoPrep.test.ts` (new) | Unit tests listed below. | R8 |
| `src/data/photos.ts` | Extract the canvas primitives into `loadImage(src: Blob)` and `renderJpeg(img, max, quality)`. `resizeImage` keeps its exact signature and behaviour, built on those two (F-702 still calls it). `urlToBlob` is unchanged. | Real `load`/`render` for `preparePhoto`; the file stays coverage-excluded (D6) |
| `src/data/repo.http.ts` | Rename the 3rd parameter `resize` → `prepare` with default `preparePhoto` (same position and type). In `save`, read and prepare the photo (`urlToBlob` + `prepare`) **before** the item PUT. Then PUT the item, then PUT the prepared blob. Only errors from the photo PUT/DELETE are wrapped in `PhotoSaveError`. | Scope: "repo.http.ts uses it instead of calling resizeImage"; AC 2 "nothing is uploaded" |
| `src/data/repo.http.test.ts` | Update for the order change and the new error cases (below). The `resize` mock is renamed `prepare`. | R8 |
| `src/data/apiErrors.ts` | Add `PHOTO_UPLOAD_ERROR_COPY` (overrides for `payload_too_large`, `unsupported_media_type`). `PhotoSaveError` uses the override when `cause` is an `ApiError` with one of those codes, and otherwise `cause.message` as today. | Scope: Vietnamese photo messages for 413/415 (429 and 503 already have photo-specific copy) |
| `src/data/apiErrors.test.ts` | Tests below. | R8 |
| `src/features/items/copy.ts` | Add `EDITOR_COPY.photo.hint`, `.preparing`, `.uploading` and `EDITOR_COPY.photo.errors.{tooLarge, unsupportedType, heicUnsupported, unreadable, tooLargeAfterResize}`. | R6: copy in one place |
| `src/features/items/Editor.tsx` | Replace `FileReader` with `preparePhoto` + an object URL. Add `preparing` state, an inline photo error, and busy overlays. Revoke the object URL on replace, remove and unmount. Reset the input's `value` after a pick. Save is disabled while preparing. Hint copy from `EDITOR_COPY`. | Scope items 1–4 |
| `src/features/items/Editor.test.tsx` | Rewrite "a file from the camera input sets the photo" (now `blob:`). Add the tests below. Mock `@/data/photoPrep`'s `preparePhoto` (keep the real `PhotoPrepError` via `importActual`). Stub `URL.createObjectURL`/`revokeObjectURL`. | R8 |
| `src/App.test.tsx` | Extend the `@/data/photos` mock with `loadImage` (resolves `{ width: 100, height: 100, source: {}, release() {} }`) and `renderJpeg` (resolves a small `image/jpeg` Blob). Stub `URL.createObjectURL`/`revokeObjectURL` in the "photos over the API" describe. | The existing photo test now goes through `preparePhoto` |
| `src/data/useWardrobe.test.tsx` | Only if a test there saves a `data:`/`blob:` photo: extend its `./photos` mock the same way. Otherwise untouched. | Keeps tests green after the import change |
| `src/index.css` | Append one small section `/* F-202.1 photo busy + error */`: `.upload-zone { position: relative }` (if not already set), `.photo-busy` overlay (centered text over a translucent `var(--surface)`, works in dark mode) and `.photo-error` (`color: var(--danger)`, small text). | R9: busy state readable at 390px and in dark mode |

No server, migration, CSP, `package.json` or `App.tsx` change.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `photoPrep.test.ts` › "photoKind maps MIME types" (`image/jpeg`, `image/jpg`, `image/pjpeg` → jpeg; `image/png`; `image/webp`; `image/heic`, `image/heif`, `image/heic-sequence`, `image/heif-sequence` → heic; `image/gif`, `image/svg+xml`, `application/pdf` → null) | Type rules |
| `photoPrep.test.ts` › "photoKind falls back to the extension when the type is empty or application/octet-stream" (`"Ảnh áo dài.HEIC"`, `"IMG_2031.heif"`, `"a.JPG"`, `"a.jpeg"`, `"a.jfif"`, `"a.png"`, `"a.webp"` → kind; `"a.gif"`, `"no-extension"`, `""` → null) | Windows Chrome gives HEIC an empty type; Vietnamese diacritics and upper case in names |
| `photoPrep.test.ts` › "rejects a file over 10 MiB before decoding" (`MAX_INPUT_BYTES + 1` → `PhotoPrepError` code `tooLarge`, `load` not called; exactly `MAX_INPUT_BYTES` is accepted) | AC 2, D3, "before resizing" |
| `photoPrep.test.ts` › "rejects an unsupported type without decoding" (GIF and SVG → `unsupportedType`, `load` not called) | Scope types |
| `photoPrep.test.ts` › "returns a JPEG of at most MAX_UPLOAD_BYTES on the first step" (render called once with `(img, 1200, 0.82)`; result `{ blob, width, height }` from render) | Baseline matches today's `resizeImage` |
| `photoPrep.test.ts` › "walks ENCODE_STEPS until the blob fits" (render returns `MAX_UPLOAD_BYTES + 1` twice, then `MAX_UPLOAD_BYTES` → 3 calls, the 3rd result returned; exactly `MAX_UPLOAD_BYTES` fits) | ≤ 2 MiB guarantee |
| `photoPrep.test.ts` › "throws tooLargeAfterResize when no step fits" (every render oversize → code `tooLargeAfterResize`, `ENCODE_STEPS.length` calls) | Never sends a 413-bound body |
| `photoPrep.test.ts` › "HEIC that the browser cannot decode → heicUnsupported" (`load` rejects, kind heic) | AC 3, D4 error half |
| `photoPrep.test.ts` › "HEIC that the browser decodes → JPEG" (`load` resolves → `image/jpeg` result) | AC 1 Safari path |
| `photoPrep.test.ts` › "a non-HEIC decode failure → unreadable" | Error typing |
| `photoPrep.test.ts` › "releases the decoded image on success and on failure" (`release` called once in both cases, including when render throws) | No leaked object URLs |
| `photoPrep.test.ts` › "a render failure → unreadable" | Error typing |
| `photoPrep.test.ts` › "PhotoPrepError message is the Vietnamese copy for its code" (every code ↔ `EDITOR_COPY.photo.errors`) | R6 |
| `photoPrep.test.ts` › "MAX_UPLOAD_BYTES equals the server limit (2 MiB)" (`=== 2 * 1024 * 1024`, with a comment that points to `server/photos.js` `MAX_BYTES`) | Keeps the client/server limits in step |
| `repo.http.test.ts` › "save with a blob: photo prepares it before the item PUT and uploads the JPEG" (the `prepare` mock is called before `fetchFn`; the 2nd request's body is the prepared blob; `Content-Type: image/jpeg`) | AC 1, new order |
| `repo.http.test.ts` › "a photo that fails preparation throws before any request" (`prepare` rejects with `PhotoPrepError` → the same error rethrown, not `PhotoSaveError`; `fetchFn` not called) | AC 2 "nothing is uploaded" |
| `repo.http.test.ts` › existing `test.each` extended: `[413, "payload_too_large"]`, `[415, "unsupported_media_type"]`, `[503, "photos_unavailable"]` (with 409/429 kept). Expectation: message contains the photo copy (`PHOTO_UPLOAD_ERROR_COPY[code] ?? API_ERROR_COPY[code]`) | Scope error mapping |
| `repo.http.test.ts` › existing "unchanged stored photo … makes no photo request" asserts `prepare` not called (renamed from `resize`) | Regression |
| `apiErrors.test.ts` › "PhotoSaveError uses the photo copy for 413 and 415" | Scope error mapping |
| `apiErrors.test.ts` › "PhotoSaveError keeps the existing copy for 429, 503 and other causes" (incl. a plain `Error` and `null`) | Regression |
| `Editor.test.tsx` › "a picked file sets a blob: URL of the prepared JPEG" (`preparePhoto` mocked → `createObjectURL` called with the prepared blob; `update("photo", "blob:…")`) | Scope object URLs |
| `Editor.test.tsx` › "a file over 10 MB shows the size message and does not set the photo" (mock rejects with `new PhotoPrepError("tooLarge")`) | AC 2 |
| `Editor.test.tsx` › "an undecodable HEIC shows the HEIC message" | AC 3 |
| `Editor.test.tsx` › "an unexpected error shows the unreadable message" (mock rejects with a plain `Error`) | Error fallback |
| `Editor.test.tsx` › "a new pick clears the previous error" | Feedback |
| `Editor.test.tsx` › "shows the preparing state while a pick is processed and disables Save" (unresolved promise) | Scope busy state |
| `Editor.test.tsx` › "shows the uploading state while saving a new photo" (`saving` true + `blob:` photo → `role="status"` with `.uploading`; with a stored `/api/photos/…` photo, no uploading status) | Scope busy state |
| `Editor.test.tsx` › "replacing or removing the photo revokes the previous object URL" | Memory, scope |
| `Editor.test.tsx` › "unmount revokes the object URL" | Memory, scope |
| `Editor.test.tsx` › "a stale pick that finishes after a newer pick is ignored" (two picks, the first resolves last → only the second URL is set; the first URL is revoked or never created) | Race safety |
| `Editor.test.tsx` › "the hint lists the accepted formats" (`EDITOR_COPY.photo.hint` is rendered) | R6 copy |

## Approach
1. **`src/data/photoPrep.ts`** (pure, no DOM at import time):
   - `export const MAX_INPUT_BYTES = 10 * 1024 * 1024;` (D3, "10 MB" read as 10 MiB, the lenient reading).
   - `export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;` (mirrors `server/photos.js:17`).
   - `export const ENCODE_STEPS = [{ max: 1200, quality: 0.82 }, { max: 1200, quality: 0.7 }, { max: 1200, quality: 0.55 }, { max: 900, quality: 0.55 }, { max: 600, quality: 0.5 }] as const;` The first step equals today's `resizeImage` defaults, so normal photos are unchanged.
   - `export type PhotoKind = "jpeg" | "png" | "webp" | "heic";` `photoKind({ type, name? })` reads the lower-cased MIME first. When the MIME is empty or `application/octet-stream`, it uses the lower-cased extension after the last `.`. Anything else → `null`.
   - `export type PhotoPrepCode = "tooLarge" | "unsupportedType" | "heicUnsupported" | "unreadable" | "tooLargeAfterResize";` `class PhotoPrepError extends Error { code }` with `message = EDITOR_COPY.photo.errors[code]` and `name = "PhotoPrepError"`.
   - `export interface DecodedImage { width: number; height: number; source: CanvasImageSource; release(): void }` and `export interface PhotoDeps { load(src: Blob): Promise<DecodedImage>; render(img: DecodedImage, max: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> }`.
   - `export async function preparePhoto(file: Blob, deps: PhotoDeps = { load: loadImage, render: renderJpeg })`. Order: size check → `photoKind(file, (file as File).name)` → `load` (a failure gives `heicUnsupported` for heic, otherwise `unreadable`) → walk `ENCODE_STEPS` until `blob.size <= MAX_UPLOAD_BYTES` (a render rejection gives `unreadable`) → none fits gives `tooLargeAfterResize`. `release()` runs in `finally`.
   - Note: the size and type checks run before any decode. No canvas or `Image` is created for a rejected file.
2. **`src/data/photos.ts`**: move the body of `resizeImage` into `loadImage(src)` and `renderJpeg(img, max, quality)`.
   - `loadImage(src)` uses an `HTMLImageElement` with an object URL, as today, so the EXIF orientation behaviour stays the same. `release()` revokes the URL.
   - `renderJpeg(img, max, quality)` handles the canvas and `toBlob("image/jpeg")`.
   - `resizeImage(src, max, quality)` = `load` → `render` → `release`, with the same signature and results. It is kept for F-702 (DONE, PR open), which calls it.
3. **`src/data/repo.http.ts`**: `prepare: (src: Blob) => Promise<{ blob: Blob }> = preparePhoto`. In `save`:
   - If `item.photo` is `data:`/`blob:`, compute `const upload = (await prepare(await urlToBlob(item.photo))).blob` first.
   - Then PUT the item.
   - Then, inside the existing `try`, PUT `upload`.
   - Errors before the item PUT propagate as they are (`PhotoPrepError` or the `urlToBlob` error). Nothing is saved, so App keeps `isNew` and the retry still creates one item. The existing `PhotoSaveError` path is unchanged for upload/DELETE failures.
   - R1: every access still goes through the repo.
4. **`src/data/apiErrors.ts`**: `PHOTO_UPLOAD_ERROR_COPY = { payload_too_large: "Ảnh quá lớn để tải lên — thử chọn lại ảnh nhé", unsupported_media_type: "Định dạng ảnh không được hỗ trợ — hãy dùng JPG, PNG, WebP hoặc HEIC" } as const`. In `PhotoSaveError`, `detail = (cause instanceof ApiError && PHOTO_UPLOAD_ERROR_COPY[cause.code]) || cause?.message`. `rate_limited` and `photos_unavailable` already have photo wording in `API_ERROR_COPY` (lines 19 and 23); keep them.
5. **`src/features/items/copy.ts`**, exact copy:
   - `hint: "JPG, PNG, WebP, HEIC · tối đa 10 MB"`
   - `preparing: "Đang xử lý ảnh…"`
   - `uploading: "Đang tải ảnh lên…"`
   - `errors.tooLarge: "Ảnh lớn hơn 10 MB — hãy chọn ảnh nhỏ hơn"`
   - `errors.unsupportedType: "Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC"`
   - `errors.heicUnsupported: "Trình duyệt này chưa đọc được ảnh HEIC — hãy chọn ảnh JPG/PNG hoặc dùng Safari"`
   - `errors.unreadable: "Không đọc được ảnh này — thử ảnh khác nhé"`
   - `errors.tooLargeAfterResize: "Ảnh vẫn quá lớn sau khi nén — thử ảnh khác nhé"`

   The existing "Thêm ảnh món đồ" and "Nhấp hoặc kéo ảnh vào đây" stay inline, because tests find the button by that name. Only the "JPG, PNG · tối đa 10MB" line moves to `hint`.
6. **`src/features/items/Editor.tsx`**:
   - Add `const ownUrl = useRef<string | null>(null)`, `const pickSeq = useRef(0)`, `const [preparing, setPreparing] = useState(false)` and `const [photoError, setPhotoError] = useState<string | null>(null)`.
   - `upload(f)`: `seq = ++pickSeq.current`; clear the error; `setPreparing(true)`; `await preparePhoto(f)`.
     - On success, when `seq` is still current: `url = URL.createObjectURL(blob)`, revoke the old `ownUrl`, store the new one, `update("photo", url)`.
     - On error, when current: `setPhotoError(e instanceof PhotoPrepError ? e.message : EDITOR_COPY.photo.errors.unreadable)`.
     - `finally`: when current, `setPreparing(false)`.
   - The camera and gallery `onChange` call `upload(...)` and then set `e.target.value = ""`, so re-picking the same file fires again after an error. The drop handler also uses `upload`.
   - "Bỏ ảnh" also revokes `ownUrl` and clears `photoError`. `useEffect(() => () => { if (ownUrl.current) URL.revokeObjectURL(ownUrl.current) }, [])` handles unmount.
   - Busy overlay inside `.upload-zone`:
     - `preparing` → `<span className="photo-busy" role="status">{EDITOR_COPY.photo.preparing}</span>`.
     - Otherwise, `saving && /^(blob|data):/.test(item.photo)` → the same element with `.uploading`.
   - Photo error: `<small className="photo-error" role="alert">` under the zone.
   - Save: `disabled={saving || preparing}`.
   - `accept="image/*"` stays as it is. Listing `.heic` would make iOS stop converting to JPEG, and the F-1002 tests assert `image/*`.
   - R9: the overlay and error use theme variables, so they work in dark mode at 390px.
7. **`src/index.css`**: append the small `.photo-busy` / `.photo-error` section. Check that `.upload-zone` is a positioning context; if not, add `position: relative` in the same section.
8. Update the tests (above) and run the Checks.

Rules: R1 (repo only; the editor calls only the pure `preparePhoto`, no `fetch`), R4/D27 (still only the user's own item photo endpoint), R6 (all copy in `copy.ts`/`apiErrors.ts`), R7 (no `App.tsx`/server change), R8 (unit tests for all new pure logic; `photoPrep.ts` is inside the coverage scope `src/data/**`), R9 (390px and dark mode). R2, R3 and R5 are not touched.

## Specialist input used
None (no consult files for this ticket).

## Assumptions
- A1 — **The picked photo is encoded twice.** The editor prepares the photo at pick time, so the preview equals what
  will be uploaded and every error shows at once. `repo.save` prepares again (scope: "repo.http.ts uses it"). The
  second pass re-encodes a ≤ 1200 px JPEG at 0.82: the quality loss is minor and it takes tens of ms. Passing small
  JPEGs through untouched was rejected because it would keep the original EXIF (GPS) for small originals (F-603 sends
  originals). The canvas re-encode removes it, as today.
- A2 — The photo is read and prepared **before** the item PUT. So a preparation failure saves nothing, and the toast
  shows the `PhotoPrepError` message. In practice this only happens if the object URL is gone, because the editor
  already validated the file. Upload failures after the item PUT keep today's `PhotoSaveError` flow (the editor stays
  open and the retry updates the same id).
- A3 — "10 MB" = 10 MiB (10,485,760 bytes). The hint says "10 MB".
- A4 — "Upload progress": `fetch` has no upload progress events, and the body is ≤ 2 MiB. A busy state ("Đang tải
  ảnh lên…") is used, which the ticket allows ("progress or a busy state").
- A5 — Error messages for 413/415/429/503 appear in the existing toast while the editor stays open (`App.tsx:92-96`).
  No inline placement in the editor, so `App.tsx` is not touched.
- A6 — `MAX_UPLOAD_BYTES` is a client constant that mirrors `server/photos.js` `MAX_BYTES`. The test pins it to
  2 MiB. Importing the server module into a jsdom test would pull in `pg`.
- A7 — **Hotspots:** F-702 is `DONE` (PR open) and edits `src/features/items/Editor.tsx` and
  `src/features/items/copy.ts`, and calls `resizeImage`/`urlToBlob` on `item.photo`. This plan keeps `resizeImage` and
  `urlToBlob` unchanged, and F-702 keeps working with `blob:` URLs (`connect-src` allows `blob:`, T-022). Expect a
  rebase on Editor.tsx/copy.ts after whichever merges first. `src/index.css` is shared with T-024/F-603 (append-only
  section). F-702's `tag-photo` upload could later switch to `preparePhoto` for HEIC; that is a follow-up, not this
  diff.
- A8 — Size: about 200 lines of product code and about 300 lines of tests. That is above the ~400-line guide mainly
  because of tests. It is kept as one slice because the decoder (the heaviest part) is split out.

## Blocking questions
None.

## Split proposal
- **F-202.1 (this plan):** everything in the ticket except bundling a HEIC decoder. HEIC is accepted and decoded by
  the browser where possible (Safari); elsewhere a clear error appears. All three acceptance criteria are met.
- **F-202.3 (new ticket, proposed): lazy-loaded HEIC decoder (rest of D4).** It is split out because it needs
  decisions only Ming can make, and the answers change the work. The orchestrator should publish these as decision
  questions; this slice is not blocked by them:
  1. **CSP.** The maintained decoders I know (`heic-to`, `libheif-js`) run libheif as WebAssembly. Under the current
     `script-src 'self' https://challenges.cloudflare.com` (`server/http.js:8`), compiling WebAssembly needs
     `'wasm-unsafe-eval'`. That is a server CSP change plus an update of `server/static.test.ts` "CSP directives are
     exact", which the ticket did not expect ("No server change is expected"). `heic2any` is not maintained (D4 asks
     for a maintained decoder), and may also need a `blob:` worker, which T-022's guard forbids. *Proposed default:*
     allow `'wasm-unsafe-eval'` only (never `'unsafe-eval'`), with a security consult.
  2. **Licence.** libheif is LGPL-3.0, and decoders that bundle it inherit that licence. Serving it as a separate lazy
     chunk keeps it replaceable, but it still needs an entry in `THIRD_PARTY_NOTICES.md`. *Proposed default:* accept
     LGPL-3.0 as a separate chunk with a notice.
  3. **Bundle size.** The decoders I know are about 1–3 MB, downloaded only when a HEIC file is picked. *Proposed
     default:* acceptable when lazy-loaded.

  Alternatively, amend D4 to "clear error only" and drop F-202.3. Package names, licences and sizes must be checked
  against the registry when F-202.3 is planned; this planning step had no network access.
