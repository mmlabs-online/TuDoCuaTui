# Security review — T-027.2

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-18

**Overall result: PASS. No 🔴 blockers; 3 🟡 non-blocking notes** (residual risk, limited to the user's own files).
All four 🟡 items from F-603.2 are closed. The header parser cannot read out of bounds, loop forever or allocate
unbounded memory. D48 still holds; no secrets and no new data access.

### Header parser (`src/data/imageHeader.ts`)
- **Out-of-bounds reads:** none. Reads past a `Uint8Array` give `undefined` (→ 0 in bitwise ops), and every
  fixed-offset read has an explicit length check: PNG `<24` (line 15); JPEG SOF `i + 9 > length` (line 36);
  WebP VP8 `<30` (line 47), VP8L `<25` (line 45), VP8X `<30` (line 56). A `try/catch` wraps the parser (lines 63-70).
- **No infinite loop:** each pass of the JPEG loop (lines 23-40) moves `i` forward by at least 1 (fill byte +1,
  standalone marker +2, other segments `2 + u16be(...)` ≥ 2); a huge length ends the loop; `SOS`/`EOI` before SOF
  returns `null`.
- **Bounded memory:** at most `HEADER_BYTES` = 512 KiB is read per file (`photoPrep.ts:111`); no allocation depends
  on parsed values.
- **Dimensions:** `width * height` is a double, so even 2^32 squared compares correctly with 52M. Zero size passes the
  header check and is caught by the decoder or the post-decode check; negative values cannot occur.
- **Unrecognised formats are still capped:** a `null` header falls through to the post-decode check
  (`photoPrep.ts:137`), inside the `try` so `img.release()` always runs. `tooManyPixels` is in `DETERMINISTIC`
  (`photoPrep.ts:157`), so it is not retried on the main thread.

### D48 and `withPhotoType`
- `withPhotoType` (`photoPrep.ts:59-65`) only builds a new `File` with the same bytes and an extension-derived MIME
  type; its only caller is `photoImport.ts:221` (`createUrl`). The blob URL then goes through `repo.http.ts:85-86`
  (`urlToBlob` → `prepare`); only the prepared `.blob` is uploaded, and `prepareWith` (`photoPrep.ts:121-151`) only
  returns `deps.render(...)` output.
- Behaviour change: an empty-type `.jpg`/`.png`/`.heic` file in bulk import is now accepted instead of rejected as
  `unsupportedType`; it is still decoded and re-encoded, so EXIF stripping holds.

### F-603.2 items
1. **Pixel cap: closed.** Header check before decoding (`photoPrep.ts:128-129`) and decoded-size check after
   (line 137), on both paths; Vietnamese copy in `copy.ts:21`. Residual risk: 🟡 A and C.
2. **Terminate a broken worker: closed.** `markBroken` (`photoWorkerClient.ts:41-57`) is idempotent, rejects every
   pending request, clears their timers and calls `worker.terminate()`.
3. **Per-request timeout: closed.** Each request gets its own 20 s timer (`photoWorkerClient.ts:81`), cleared on
   answer (line 71); a timeout marks the worker broken and the photo is retried on the main thread
   (`photoPrep.ts:170-171`).
4. **Message shape: closed.** `isWorkerRequest`/`isWorkerReply` (`photoWorkerHost.ts:18-50`) check object shape,
   integer ids and finite numbers; release only on explicit `op === "release"` (line 114); the client
   (`photoWorkerClient.ts:62`) ignores messages when broken, malformed, or for unknown/finished ids.

### Non-blocking notes (🟡)
- 🟡 **A. Renamed files can force a full decode in the worker before the cap applies** (`photoPrep.ts:128`,
  `photoWorkerHost.ts:88`). `photoKind` trusts the MIME type or extension, but `createImageBitmap` sniffs the real
  format; a GIF, RLE BMP or AVIF renamed to `.jpg`/`.png` gives a `null` header and can claim gigapixel dimensions
  under 10 MiB. On the worker path the full decode happens before the post-decode check (memory spike, possibly the
  20 s timeout and a main-thread retry). The main-thread `<img>` path (`photos.ts:14`) usually reports size before a
  full decode. User's own files only (availability). Follow-up: when a jpeg/png/webp-typed file has no recognised
  header, reject it or prepare it on the main thread.
- 🟡 **B. One timeout disables the worker for the rest of the page** (`photoWorkerClient.ts:130`). Acceptable
  degradation; later photos block the UI again.
- 🟡 **C. HEIC (and AVIF) sizes are not read from the header** (D47). On Safari a huge HEIC is caught only after the
  worker decodes it; same residual risk as A.

### Rules
R1 holds (no new fetch or data access; `readBytes` reads a local Blob). R3 holds (no new `VITE_*`, keys or tokens).
R4 holds (upload and storage paths unchanged). D47 holds (no client HEIC decoder, no wasm). D48 holds (every upload
path is re-encoded).

### Follow-ups (out of scope)
- Prepare on the main thread when a jpeg/png/webp-typed file has no recognisable header (closes 🟡 A).
- Optional real-browser check that a 30k×30k PNG is rejected before upload on Chrome and Safari.
