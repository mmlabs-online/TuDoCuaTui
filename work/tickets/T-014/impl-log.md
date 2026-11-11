
## Attempt 1 — 2026-11-11

### Files touched
| File | Required because |
|---|---|
| `src/data/repo.http.ts` (new) | `createHttpRepo` over `/api` (scope bullet 1, R1) |
| `src/data/apiErrors.ts` (new) | `ApiError` and Vietnamese `API_ERROR_COPY` (R6) |
| `src/data/mode.ts` (new) | `DataMode`, `pickMode`, `/healthz` probe `detectMode` |
| `src/Root.tsx` (new) | AuthGate only in supabase mode |
| `src/main.tsx` | detect mode, render `Root` |
| `src/data/repo.ts` | widen `mode` union |
| `src/data/useWardrobe.ts` | optional `mode` parameter, `api` branch |
| `src/App.tsx` | pass `mode`, `photoUpload={mode !== "api"}` |
| `src/features/items/Editor.tsx` | `photoUpload` prop and "Sắp có" block (diff is large mostly from re-indentation) |
| `src/features/items/copy.ts` | `photo.comingSoon`, `photo.comingSoonHint` |
| `README.md` | API mode bullet |
| tests (see below) | plan test list |

### Tests added / changed
- `src/data/repo.http.test.ts`, `src/data/apiErrors.test.ts`, `src/data/mode.test.ts`, `src/Root.test.tsx` (new)
- `src/features/items/Editor.test.tsx`: additive `photoUpload` off cases (`renderEditor` got an optional third arg)
- `src/data/useWardrobe.test.tsx`: additive api-mode case

### Checks (actual output summary)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: All matched files use the correct format.
- test: 55 files passed, 4 skipped; 620 passed, 42 skipped
- build: built OK
- E2E smoke (local PG 16, `server/migrate.js`, `TUDO_ACCESS_DISABLED=1 node server/index.js`, Playwright 390px): no login field, no sign-out button; create, edit + "Mặc hôm nay", delete each survived a reload (checked in the DB via `/api/items`); editor shows "Ảnh món đồ — Sắp có", 0 file inputs, no "Chụp ảnh"; no page errors. Server, PG and data dir removed afterwards.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- T-016: drop the supabase branch from `pickMode`/`useWardrobe`, re-home the `ItemRow`/`ItemInsert` types, fallback becomes local-only.
- Ming: data move Supabase -> Postgres if wanted (API mode starts empty).
- Ming: visual check at 390px light/dark (no CSS changed).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about 280 lines non-test code plus tests.
