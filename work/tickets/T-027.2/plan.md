Status: READY

# Plan — T-027.2: Harden the photo worker

## Scope summary
Ticket `work/tickets/T-027.2/ticket.md`, **Scope**:
> - Terminate the worker when it is marked broken, so nothing it decodes afterwards stays in memory.
> - A per-request timeout after the `ready` handshake: a hung request falls back to the main thread.
> - A pixel cap (about 50 MP) checked before or right after decoding, on both paths, with a clear Vietnamese error.
> - Validate message shape on both sides (`typeof m === "object"`, explicit `op === "release"`).
> - A HEIC file with an empty MIME type (Windows) is still recognised as HEIC by its extension.

> **Out of scope:** A client HEIC decoder (D47); CSP changes.

Sources quoted by the ticket:
- `work/tickets/F-603.2/security-review.md` 🟡1 "No pixel cap before decoding … reject over ~50 MP (a real fix reads
  the image header first)"; 🟡2 "`markBroken` … does not call `worker.terminate()`"; 🟡3 "No per-request timeout after
  the `ready` handshake"; 🟡4 "Unknown `op` falls into the `release` branch; `"type" in m` throws for a non-object".
- `work/tickets/F-603.2/review.md` nits: "`markBroken` never calls `worker.terminate()` … a `load` that finishes after
  the break keeps its bitmap"; "No per-request timeout after `ready`".
- `work/tickets/F-603/impl-log.md` follow-up: "`save()` re-reads the picked file through a blob URL, so a HEIC file
  with an empty MIME type (Windows) loses its extension hint before `preparePhoto`".
- `work/decisions.md` D47 "HEIC: clear error only … elsewhere the editor shows a clear Vietnamese error and uploads
  nothing"; D48 "Every upload path (editor, F-603 bulk import, F-702) must go through `preparePhoto`."

Not a feature-list item (hardening of F-202.1 / F-603.2); no feature-list conflict.

### Concrete decisions (asked for by the orchestrator)
1. **Pixel cap: both, header first.** `MAX_PIXELS = 52_000_000` (≈ 50 MP; real "50 MP" sensors write up to
   8160×6144 = 50.1 MP, which must still pass; 200 MP modes are rejected). Checked in `prepareWith` (shared by the
   worker and main-thread path), twice:
   - **before decoding**, from the image header (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X) read from the first 512 KiB
     of the file — this is the only check that protects memory on the worker path, because `createImageBitmap`
     decodes fully (a 30k×30k PNG = 3.6 GB) before any width is known. Weighed: post-decode alone is ~5 lines but
     does not stop the OOM it is meant to stop; the header parser is a small pure module (~60 lines) with unit tests.
   - **right after `deps.load`**, on `img.width × img.height` — covers HEIC (no ISOBMFF parsing: not worth it, D47
     makes HEIC Safari-only) and any header the parser cannot read (returns `null` → no pre-decode verdict). On the
     main path `<img>` gives dimensions on `load` without a bitmap draw, so this still prevents the canvas work.
   The new code `tooManyPixels` is **deterministic** (added to `DETERMINISTIC`): a worker-side rejection must never
   be retried on the main thread.
2. **Request timeout: 20 s per request** (`load` or `render`), option `requestTimeoutMs = 20_000` on
   `createWorkerDeps`. Legit worst case (≤ 52 MP decode or a 1200 px encode on a low-end phone) is a few seconds; 20 s
   is a 5× margin, and it costs at most once per page because a timeout marks the worker broken. On timeout:
   `markBroken()` → `worker.terminate()`, every pending request rejects with `WorkerUnavailableError` →
   `prepareWith` maps it to `unreadable`/`heicUnsupported` (non-deterministic) → `preparePhotoAuto` retries on the main
   thread; `getOffThreadDeps()` returns `null` from then on. **A late answer is ignored** three ways: the worker is
   terminated (no more messages in a browser); the message handler returns early when `state.broken`; and replies
   whose `id` is not in `pending` are dropped (the entry is deleted when it settles or breaks).
3. **Error code and copy:** `PhotoPrepCode` gains `"tooManyPixels"`; copy in
   `src/features/items/copy.ts` `EDITOR_COPY.photo.errors` (where every photo error lives, R6):
   `tooManyPixels: "Ảnh có độ phân giải quá lớn (tối đa khoảng 50 MP) — hãy chọn ảnh nhỏ hơn"`. The editor shows
   `PhotoPrepError.message` (`Editor.tsx:124`) and bulk import shows `error.message` (`photoImport.ts:153`), so no
   other UI change is needed.
4. **Empty-MIME HEIC.** Checked: the editor calls `preparePhoto(f)` with the picked `File` (`Editor.tsx:115`), so
   `photoKind` already sees the name (`photoPrep.ts:40-45`) — covered by a test only. Bulk import is broken:
   `runPhotoImport` calls `deps.createUrl(cur[i].file)` (`photoImport.ts:221`) → `repo.save` →
   `urlToBlob(item.photo)` (`repo.http.ts:84-86`, `photos.ts:61-65`) returns a Blob with no name and type `""`, so
   `photoKind` → `null` → `unsupportedType` instead of `heicUnsupported`. Fix: new pure `withPhotoType(file: File):
   File` in `photoPrep.ts` — when the type is empty or `application/octet-stream` and the extension gives a kind,
   return `new File([file], file.name, { type: <canonical MIME>, lastModified: file.lastModified })`; otherwise return
   the same object. `runPhotoImport` calls `deps.createUrl(withPhotoType(cur[i].file))`. A blob URL keeps the Blob's
   type through `fetch`, so `prepare` then sees `image/heic`. (`photoFileKey`/de-dup keep using the original file.)

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A broken worker is terminated (unit test with a fake worker). | `photoWorkerClient.test.ts` › `markBroken terminates the worker once (ready ok:false, ready timeout, error, messageerror, request timeout)` — `FakeWorker.terminated === 1` in each case |
| 2 | A request with no answer within the timeout falls back to the main thread and still succeeds (fake timers). | `photoWorkerClient.test.ts` › `a load with no answer within 20 s falls back to main deps and succeeds`, › `a late reply after the request timeout is ignored` |
| 3 | An image over the pixel cap is rejected with a clear error on both paths, and nothing is uploaded (unit tests). | `imageHeader.test.ts` (all); `photoPrep.test.ts` › `rejects an image over MAX_PIXELS from its header without decoding`, › `rejects a decoded image over MAX_PIXELS on main deps without rendering`, › `tooManyPixels from the worker is not retried on main deps`; `photoWorkerClient.test.ts` › `worker deps: a decoded image over MAX_PIXELS → tooManyPixels, no render posted, release posted`; `repo.http.test.ts` › `a photo over the pixel cap throws before any request`; `PhotoPrepError` copy test includes the new code |
| 4 | Malformed messages are ignored without throwing (unit tests). | `photoWorkerHost.test.ts` › `malformed requests are ignored without throwing or replying`, › `an unknown op does not release a bitmap`; `photoWorkerClient.test.ts` › `malformed replies are ignored without throwing`, › `a render reply without a Blob rejects the render` |
| 5 | A `.heic` file with an empty MIME type gets the HEIC handling (unit test). | `photoPrep.test.ts` › `withPhotoType …` (3 tests), › `a .HEIC File with an empty type that cannot be decoded → heicUnsupported`; `photoImport.test.ts` › `a .heic file with an empty MIME type reaches createUrl typed image/heic` |
| 6 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` green; `dist/assets/photoPrep.worker-*.js` still emitted and contains no Vietnamese copy (`grep -c "Không"` = 0) |

## Ming verification after merge
None required by the ticket ("Manual: none"). Optional: on desktop Chrome/Windows, bulk-import a `.heic` and see the
HEIC message ("Trình duyệt này chưa đọc được ảnh HEIC …") instead of "Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC".

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/data/imageHeader.ts` (new) | Pure `imageDimensions(bytes: Uint8Array): { width: number; height: number } \| null` for JPEG/PNG/WebP; never throws, `null` on unknown/truncated | Pixel cap before decoding | No |
| `src/data/imageHeader.test.ts` (new) | Parser unit tests | R8 | No |
| `src/data/photoPrep.ts` | `MAX_PIXELS`, `HEADER_BYTES = 512 * 1024`, code `tooManyPixels` (+ `DETERMINISTIC`), header check before `deps.load`, post-decode check after it, `withPhotoType` | Pixel cap on both paths; HEIC empty-MIME | No |
| `src/data/photoPrep.test.ts` | New tests below | R8 | No |
| `src/data/photoWorkerClient.ts` | `terminate()` on `WorkerLike`; idempotent `markBroken` that terminates; per-request timeout; ignore messages when broken; reply shape guard; render checks `blob instanceof Blob` | 🟡2, 🟡3, 🟡4 | No |
| `src/data/photoWorkerClient.test.ts` | `FakeWorker` gets `terminate()`/`terminated`, `hang` option, raw `emit`; new tests | R8 | No |
| `src/data/photoWorkerHost.ts` | Exported `isWorkerRequest(data: unknown)` guard; handler takes `unknown`, ignores invalid input; `release` only on `op === "release"`; exported `isWorkerReply` (shape guard used by the client; lives here with the types, no DOM imports) | 🟡4 | No |
| `src/data/photoWorkerHost.test.ts` | Malformed request tests, `isWorkerReply` tests | R8 | No |
| `src/features/items/copy.ts` | `EDITOR_COPY.photo.errors.tooManyPixels` | R6: photo error copy lives here | No |
| `src/data/photoImport.ts` | `deps.createUrl(withPhotoType(cur[i].file))` (one line + import) | Empty-MIME HEIC through the blob URL round-trip (not in the ticket's file list; it is where the type is lost) | No |
| `src/data/photoImport.test.ts` | One test | R8 | No |
| `src/data/repo.http.test.ts` | One test: `PhotoPrepError("tooManyPixels")` from `prepare` → no fetch | AC 3 "nothing is uploaded" | No |

Not changed: `photoPrep.worker.ts` (still `handle(e.data)`; the handler now accepts `unknown`), `photos.ts` (post-decode
check sits in `prepareWith`, not in `loadImage`), `photoScale.ts`, `repo.http.ts`, `Editor.tsx`, `server/**`
(no CSP change).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `imageHeader.test.ts` › `reads width/height from a PNG IHDR` | PNG |
| `imageHeader.test.ts` › `reads a JPEG SOF0 and SOF2 after APP0/APP1 segments` | JPEG walk, progressive |
| `imageHeader.test.ts` › `skips 0xFF fill bytes and standalone markers; stops at SOS → null` | JPEG edge cases |
| `imageHeader.test.ts` › `reads WebP VP8, VP8L and VP8X sizes` | WebP (3 variants) |
| `imageHeader.test.ts` › `returns null for unknown, empty, HEIC-like and truncated input without throwing` | Robustness (truncated mid-segment, length running past the end) |
| `photoPrep.test.ts` › `rejects an image over MAX_PIXELS from its header without decoding` | PNG 10000×6000 bytes → `tooManyPixels`, `load` not called |
| `photoPrep.test.ts` › `an image at MAX_PIXELS passes the header check` | Boundary (≤ passes) |
| `photoPrep.test.ts` › `rejects a decoded image over MAX_PIXELS on main deps without rendering` | Post-decode; `render` not called; `release` called |
| `photoPrep.test.ts` › `tooManyPixels from the worker is not retried on main deps` | `preparePhotoAuto` deterministic |
| `photoPrep.test.ts` › `withPhotoType gives an empty-type .HEIC file the image/heic type and keeps name and size` | HEIC Windows |
| `photoPrep.test.ts` › `withPhotoType maps application/octet-stream by extension` | `.heif`, `.jpg` |
| `photoPrep.test.ts` › `withPhotoType returns the same file when it already has a type or the extension is unknown` | No-op cases |
| `photoPrep.test.ts` › `a .HEIC File with an empty type that cannot be decoded → heicUnsupported` | Editor path (name kept) |
| `photoPrep.test.ts` › existing `PhotoPrepError message is the Vietnamese copy for its code` | Extend to `tooManyPixels` |
| `photoWorkerClient.test.ts` › `markBroken terminates the worker once (ready ok:false, ready timeout, error, messageerror, request timeout)` | 🟡2 |
| `photoWorkerClient.test.ts` › `a load with no answer within 20 s falls back to main deps and succeeds` | 🟡3, fake timers (`vi.advanceTimersByTimeAsync(20_000)`) |
| `photoWorkerClient.test.ts` › `a late reply after the request timeout is ignored` | Emit the reply after break: no throw, still broken, the rejected promise stays rejected |
| `photoWorkerClient.test.ts` › `an answered request clears its timeout` | No break after 20 s when the reply came in time |
| `photoWorkerClient.test.ts` › `malformed replies are ignored without throwing` | `undefined`, `null`, `5`, `"x"`, `{type:"ready"}`, `{id:"1",ok:true}`, `{id:1,ok:true,width:"a"}`; the pending load then resolves with a valid reply |
| `photoWorkerClient.test.ts` › `a render reply without a Blob rejects the render` | Replaces `r.blob!` |
| `photoWorkerClient.test.ts` › `worker deps: a decoded image over MAX_PIXELS → tooManyPixels, no render posted, release posted` | Worker path through `prepareWith` (`FakeWorker` dims `[[10000, 6000]]`) |
| `photoWorkerHost.test.ts` › `malformed requests are ignored without throwing or replying` | `null`, `42`, `{}`, `{op:"bogus",id:1}`, load without Blob, render with string id / NaN max |
| `photoWorkerHost.test.ts` › `an unknown op does not release a bitmap` | 🟡4 explicit `op === "release"` |
| `photoWorkerHost.test.ts` › `isWorkerReply accepts ready/done/fail and rejects other shapes` | Shared guard |
| `photoImport.test.ts` › `a .heic file with an empty MIME type reaches createUrl typed image/heic` | Bulk-import path |
| `repo.http.test.ts` › `a photo over the pixel cap throws before any request` | Nothing uploaded |

No App-level tests (slow on CI). No real `Worker`: everything uses the existing `FakeWorker` / host fakes in jsdom.

## Approach
1. **`imageHeader.ts`** (pure, bounds-checked reads; any out-of-range read → `null`):
   - PNG: 8-byte signature, `IHDR` at 12, width/height u32 BE at 16/20.
   - JPEG: `FF D8`, then walk segments: skip `0xFF` fill bytes; standalone markers (`01`, `D0`–`D7`) advance 2; SOF
     markers `C0`–`C3`, `C5`–`C7`, `C9`–`CB`, `CD`–`CF` → height u16 BE at +5, width at +7; `DA`/`D9` → `null`;
     otherwise advance `2 + length`.
   - WebP: `RIFF….WEBP`; chunk at 12: `VP8 ` → u16 LE at 26/28 `& 0x3FFF`; `VP8L` (signature `0x2F` at 20) → 14-bit
     fields from bytes 21–24, `+1`; `VP8X` → u24 LE at 24/27, `+1`.
   - Anything else (HEIC, unknown) → `null`.
2. **`photoPrep.ts` › `prepareWith`**, order: byte cap → `photoKind` → read `file.slice(0, HEADER_BYTES)` as bytes
   (`await blob.arrayBuffer()`; if jsdom 27's Blob lacks it, use a small `FileReader` helper; a read failure counts
   as `null`) → if dims and `w*h > MAX_PIXELS` throw `tooManyPixels` → `deps.load` → if `img.width*img.height >
   MAX_PIXELS` then `img.release()` and throw `tooManyPixels` (inside the existing `try/finally` so release happens
   once) → encode loop. Add `"tooManyPixels"` to `DETERMINISTIC`. Add `withPhotoType` with a kind→MIME map
   (`jpeg→image/jpeg`, `png→image/png`, `webp→image/webp`, `heic→image/heic`) reusing `photoKind`.
3. **`photoWorkerHost.ts`**: `isWorkerRequest` (object; `op` ∈ load/render/release; finite integer `id`; load needs
   `blob instanceof Blob`; render needs finite `max > 0` and `0 < quality ≤ 1`); handler `(m: unknown)` returns
   early when invalid; `else if (m.op === "release")`. `isWorkerReply` (ready: `type === "ready"` + boolean `ok`;
   done: integer `id`, `ok === true`, finite `width`/`height`, optional `blob instanceof Blob`; fail: integer `id`,
   `ok === false`). No new imports into the worker chunk beyond what it already has.
4. **`photoWorkerClient.ts`**: `WorkerLike.terminate(): void`; `Pending` gains its `timer`; `markBroken` returns
   if already broken, then sets broken, clears the ready timer and every request timer, rejects ready and pending,
   clears the map, and calls `worker.terminate()` in a `try/catch`. `request()` starts `setTimeout(markBroken,
   requestTimeoutMs)` and clears it on settle. Message handler: `if (state.broken || !isWorkerReply(e.data)) return`;
   ready branch as today; done branch only acts on ids still in `pending`. `render` throws when `!(r.blob instanceof
   Blob)`.
5. **`photoImport.ts`**: wrap the file in `withPhotoType` at the `createUrl` call.
6. Copy: one key in `EDITOR_COPY.photo.errors`.

Rules: R1 unchanged (no new data access; `fetch` stays in `urlToBlob`). R3 nothing secret. R4/D48: every output is
still re-encoded; nothing new is uploaded on any error (preparation runs before the first request in `repo.save`).
R6: copy only in `copy.ts`; the worker chunk stays copy-free. R7: no other changes (follow-ups go to impl-log). R8:
tests above. R9: no UI layout change. D47: no decoder, HEIC header not parsed.

## Specialist input used
None (no `consult-*.md`; areas `data`, `security` have no PLAN consult). `security-ai-generated-code-auditor` runs at
REVIEW (ticket Technical notes); its F-603.2 notes 🟡1–4 are the scope of this ticket.

## Assumptions
- `MAX_PIXELS = 52_000_000` satisfies "about 50 MP" while letting genuine 50 MP phone photos (up to ~50.2 MP) through.
  Ming can lower it to exactly 50 000 000 with a one-line change.
- A request timeout marks the whole worker broken (not just that request): a hung worker cannot be trusted, and the
  ticket asks only that "a hung request falls back to the main thread".
- A malformed reply for a pending id is ignored (per AC 4), so that request ends by the 20 s timeout and falls back.
- `withPhotoType` applies to bulk import only; the editor already passes the named `File`.
- Estimated diff ~420 lines, most of it tests; one cycle, no split.
- Hotspots: no other ticket is `IN_PROGRESS`/`REVIEW`/`DONE` in `work/backlog.md`.

## Blocking questions
None.

## Split proposal
None.
