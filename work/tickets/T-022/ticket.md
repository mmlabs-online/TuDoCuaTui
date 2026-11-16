# T-022: Hotfix — CSP blocks photo upload (connect-src data:/blob:)

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P0 |
| Size | XS |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | security |
| Gate | none |
| Depends on | T-019.8 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | claude@2026-11-16T04:23:57Z |
| PR | — |

## Goal
Photo upload works again in production: saving an item with a new photo stores the photo.

## Feature reference
Production bug reported by Ming 2026-11-16 ("Đã lưu món đồ nhưng chưa lưu được ảnh — Failed to fetch"; no `PUT /api/items/<id>/photo` in the Network tab). Cause: the T-019.8 CSP `connect-src 'self' https://api.mmlabs.online` blocks `fetch(data:…)` / `fetch(blob:…)` in `urlToBlob` (`src/data/photos.ts:31-35`), called from `src/data/repo.http.ts:82-83` before the upload.

## Scope
- Add `blob:` and `data:` to `connect-src` in the SPA CSP (`server/http.js`), keeping everything else (no `unsafe-*`, Turnstile still not in `connect-src`).
- Update the CSP tests (`server/static.test.ts` per-directive parse; any app test asserting the exact string) and `server/README.md` if it quotes the CSP.
- Regression check in a real browser: pick a photo in the editor under the built server's CSP → the `PUT …/photo` request is sent (no CSP violation).

## Acceptance criteria
- [ ] `connect-src` is exactly `'self' https://api.mmlabs.online blob: data:`; no other directive changes; tests assert it.
- [ ] In a browser served with the real CSP, saving an item with a picked photo sends `PUT /api/items/<id>/photo` and shows no CSP violation.
- [ ] All checks pass.

## Notes / answers from Ming
- 2026-11-16: bug report with screenshot (Network shows no photo upload; item saved with `primary_photo_id: null`).

## Handoff
