# BUG-002: Photo upload blocked by the page CSP ("Đã lưu món đồ nhưng chưa lưu được ảnh")

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S1 |
| Priority | P0 |
| Size | XS |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui, data, security |
| Gate | none |
| Found in | v0.2.8 (production) |
| Introduced in | v0.2.6 (T-019.8, commit 138916d: SPA CSP with `connect-src 'self' https://api.mmlabs.online`) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | — |
| PR | — |

## Report
Ming, 2026-11-16: "version v0.2.8 món đồ đã lưu nhưng không lưu được ảnh". Viewing existing photos from Drive works, the Drive folder exists and has free space.

## Environment
- Mode: API (identity), production, any browser that enforces CSP.

## Steps to reproduce
1. Add or edit an item, pick or take a photo.
2. Save.

## Expected
- The item and its photo are saved; the photo shows in the grid.

## Actual
- The item is saved without photo; toast "Đã lưu món đồ nhưng chưa lưu được ảnh — Failed to fetch". No request reaches `PUT /api/items/:id/photo`.

## Root cause
**Confirmed (Chromium with the real `SPA_CSP`):** the editor keeps the picked photo as a `data:image/jpeg;base64,…` URL (FileReader, `src/features/items/Editor.tsx:73`). On save, `src/data/repo.http.ts:83` calls `urlToBlob(item.photo)`, which does `fetch(url)` (`src/data/photos.ts:31-35`). The SPA CSP (`server/http.js:12`) allows `connect-src 'self' https://api.mmlabs.online` only, so `fetch("data:…")` is blocked ("Failed to fetch") and `PhotoSaveError` is raised after the item was saved. Reading photos is unaffected (same-origin `/api/photos/<id>`). Unit tests run in jsdom without CSP, so they never saw it.

## Scope
- Turn a `data:` URL into a Blob without `fetch` (decode base64 locally) in `src/data/photos.ts`; keep the CSP unchanged.

## Out of scope
- Loosening the CSP; other photo flows (import, AI tag-photo) unless they use the same helper; photo quotas.

## Acceptance criteria
- [ ] Regression test (unit): `urlToBlob` on a `data:image/jpeg` URL returns the right Blob **without calling `fetch`** (spy on `fetch`); it fails on `main` and passes after the fix.
- [ ] One-off Playwright check with the real `SPA_CSP` header: the fixed helper turns a `data:` URL into a Blob; result recorded in impl-log (D42).
- [ ] Unit tests for the decoder: base64 JPEG → Blob with type `image/jpeg` and the right bytes; malformed `data:` URL → a clear error, no crash.
- [ ] Saving an item with a new photo in API mode uploads the photo (`PUT /api/items/:id/photo` is called); local mode unchanged (R1).
- [ ] `server/http.js` CSP unchanged; all checks pass.

## Technical notes
- Files: `src/data/photos.ts`, `src/data/photos.test.ts`.
- Check other `urlToBlob` / `fetch(data:` callers (`grep`); fix only the shared helper.
- Users who saved items without photo since v0.2.6 must re-add the photo (editor retry updates the same item).

## Notes / answers from Ming
- 2026-11-16 (Ming): "ảnh vẫn load từ drive, folder vẫn còn. chưa hết dung lượng".

## Handoff
