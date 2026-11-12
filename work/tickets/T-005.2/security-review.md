# Security review — T-005.2

## Attempt 1 (2026-11-12) — security-ai-generated-code-auditor

No 🔴. Two 🟡, rest 🟢. No edits, no .env read, tests not run.

### 🟡 Should fix
1. **A save from a stale view deletes a photo it never saw** — `src/data/repo.http.ts:83`: `saved.primary_photo_id && !item.photoPath` can't tell "user pressed Bỏ ảnh" from "this view never knew about a photo". Phone A loads; phone B adds a photo; A edits the name and saves → `DELETE /items/:id/photo` removes row + Drive file. Integrity / permanent data loss. Fix: (a) delete only on an explicit removal recorded by the editor (e.g. `photoRemoved` flag / compare with the `photoPath` the editor opened with), or (b) `DELETE /items/:id/photo?photo=<uuid>` that deletes only if still the primary photo (also closes the two-tab race server-side; changes the A1 contract slightly — Ming's call).
2. **Notes for T-005.3** — `server/photos.js:175`: magic bytes only block obvious cases (JPEG/HTML polyglot passes) — fine while nothing serves bytes. `GET /api/photos/:id` must send fixed `Content-Type: image/jpeg` (never Drive's mimeType), keep `nosniff` (`server/http.js:5`), consider `Content-Security-Policy: default-src 'none'; sandbox` + `Content-Disposition: inline`. Server accepts any JPEG, so a hand-made request could store EXIF/GPS (the app's canvas resize `src/data/photos.ts:2-27` strips it) — record next to T-005.3.

### 🟢 Notes
- Routing/auth: `access.verify` before `handleApi` (`server/app.js:60-69`); photo route matched on the raw pathname with exact segment count (`server/api.js:18-20`); 405/`Allow`, Sec-Fetch-Site and uuid checks before dispatch (`:46-60`); log uses the route template.
- CSRF holds (PUT/DELETE + `image/jpeg` not simple; no CORS; cross/same-site → 403).
- Body handling (`photos.js:22-66,122-134,167-173`): 415 first; CL over cap → 413 before read + socket destroy; streamed counting; 408 at 30 s; error/early close/length mismatch → 400, never partial; semaphore race-free. Minor: 3 slow uploads can hold slots 30 s each (acceptable behind Access).
- Drive call: fixed `image/jpeg` (`:187`); appProperties uuids only, `<uuid>.jpg`; create not retried; errors mapped to generic codes, logs `{event, code}` (`:191-198`).
- Drive id never reaches browser or logs (`server/items.js:7-31` allowlist; `photo_orphan` logs photoId `photos.js:80`; `dbLogFields` excludes pg detail `server/errors.js:35-44`).
- SQL parameterised (`photos.js:95,142,178,206-212`; `items.js:116-120`).
- Migration safe: expand-only, format check = `FILE_ID_RE`, `num_nonnulls`, partial unique index; view keeps order and appends `primary_photo_id`; deterministic tiebreaker.
- Lock order/orphans correct (`withLockedItem`, `removeItem` lock items first; Drive upload outside tx; compensating delete `:215-218`; missing item `:219-222`; rows before files).
- Edge: ambiguous commit (connection drop after Postgres committed) → compensating delete removes a file a committed row points to; rare; T-005.6 won't fix it; README note.
- Edge: double release in `withLockedItem` (`photos.js:96-99`) if rollback throws → 500, not a crash; cosmetic.
- Edge: 500 after a successful save if `getItem` fails (`:224`); retry replaces cleanly.
- No unhandled rejections in new async paths (`index.js:22` fatal).
- Client: no XSS sinks; only data:/blob: uploaded after `resizeImage`; `call()` keeps same-origin + manual redirect; `PhotoSaveError` cause may be English (R6 nit); local mode untouched.
- R3: Drive credentials only from server runtime env (`index.js:42-43`).

Risks: orphans until T-005.6 (accepted, A5); 23505 → compensating delete (only harmful if Google reused an id).
Open: should DELETE photo require the expected photo id (1b)?

## Attempt 2 (2026-11-12) — security-ai-generated-code-auditor (d84988c..9e0bb68)

Attempt-1 🟡 1 (stale-view photo deletion) fixed client + server. No 🔴/🟡. Static read only.

1. Query split / routing: one `pathname` for guard and router, cut at first `?` then `#` (`server/app.js:42-43,60,73`, `server/api.js:42-61`); `…/photo#?photo=` → 400; `?photo=<u>?x` fails uuid → 400; `%3F` never decoded → 404/400; duplicates/empty/other names → 400 (`photos.js:135-138`, tests `api.db.test.ts:517-532`); absolute-form/`*` still 400 (`app.js:42`); query parsed only after access/405/Sec-Fetch-Site/uuid checks.
2. Server DELETE (`server/photos.js:133-162`): required single uuid before the 503 checks; under `withLockedItem`; `delete … where item_id=$1 and id=$2`; stale/no photo/missing item → 204 no-op (README `:45`, "never 409"); Drive delete only after commit and only for `returning` rows. Note: SQL doesn't check `is_primary` — equivalent today (PUT replaces all rows); revisit if several photos per item arrive.
3. Client (`src/types/item.ts:23-24`, `Editor.tsx:164-176`, `repo.http.ts:83-89`): DELETE only with `removedPhotoId`; stale view sends none (`repo.http.test.ts:203-208`); new photo wins; upload-then-remove still deletes; retry keeps `removedPhotoId`; result patch only clears the matching id (`:210-220`); `removedPhotoId` not in the PUT body (`mappers.ts:89-107`). Nit: `encodeURIComponent` at `repo.http.ts:85` (cosmetic).
4. Tests cover 400 cases, two-tab stale case, repeated/unknown DELETE 204, Drive-off 503 (`api.test.ts:293`), client cases (`repo.http.test.ts:188-228`). Optional: app-level test for `#`, `%3F`, extra `?` on the photo route.
5. Not security: "Bỏ ảnh" then close doesn't prompt (`src/features/items/dirty.ts:4-19` ignores photoPath/removedPhotoId) — removal silently dropped, no data loss; follow-up.

Risks unchanged (orphans until T-005.6; ambiguous commit). T-005.3 serving notes still apply.
