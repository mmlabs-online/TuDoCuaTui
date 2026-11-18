# Impl log — T-027.1

## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/data/photoImport.ts` | `PhotoStop` widened; `photoStopFor`, `isPhotoQuotaStop`, `photoFileKey`, `newPhotoFiles`; runner uses `photoStopFor`; `photoQuotaHit` AI hold; `DEFAULT_WAIT_SEC` removed (AC 1-2, 6-9) |
| `src/data/photoImport.test.ts` | R8; the "defaults to 5 s" half of the wait-cap test replaced; three existing tests used a network error / 503 without Retry-After as a "file fails, batch continues" case, which now stops: switched to `500 internal` / `503` with `Retry-After` |
| `src/features/import-export/usePhotoImport.ts` | de-dup in `addFiles`, 429 cooldown (`cooldownSec`, guard in `run`), quota memory ref (AC 4, 5, 8, 10) |
| `src/features/import-export/ImportPhotosTab.tsx` | message per stop code; "Thử lại" disabled with the wait label (AC 4, 11) |
| `src/features/import-export/copy.ts` | `stoppedUnauthorized`, `stoppedNetwork`, `stoppedUnavailable`, `retryIn` (R6) |
| `src/features/import-export/ImportPhotosTab.test.tsx` | new tests; existing 429 test now asserts the disabled "Thử lại sau 2 giờ" button; `afterEach` also restores real timers |

### Tests added / changed
- photoImport.test.ts: photoStopFor mapping; isPhotoQuotaStop; newPhotoFiles; 401 (item step, photo step); network stop; second run after network stop; 503 without Retry-After (item and photo step); wait capped at 30 s (edited); photoQuotaHit x3 (no tag call, ai "off" without tag call, tagging resumes).
- ImportPhotosTab.test.tsx: 429 cooldown with fake timers (disabled, no re-run on click, 2 phút -> 1 phút -> enabled, re-runs); 429 without Retry-After enabled; it.each unauthorized/network/unavailable messages; network stop + retry; same file twice lists once (pick, pick, drop); photoQuotaHit passed on retry (false, true, true, false).

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: "All matched files use the correct format."
- test: Test Files 119 passed | 11 skipped (130); Tests 1550 passed | 221 skipped (1771). (One earlier full run showed a transient failure in `src/features/items/Editor.test.tsx` only; it passed on re-run and alone, unrelated to this diff.)
- build: `built in 390ms`

### 390px check (one-off, outside the repo)
Harness `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/t-027-1/run.cjs` against `pnpm dev` with mocked `/api`; 4 photos, the first photo PUT answers 429 (Retry-After 90) / 503 without Retry-After / network abort. Screenshots `<mode>-<light|dark>.png` in the same folder (modes 429, 503, network).
- 429: button "Thử lại sau 2 phút", disabled, 147 px wide, top 537 / bottom 581; stop banner 429-483; modal footer starts at 771. Light and dark identical geometry.
- 503 and network: stop message and "Thử lại (4)" enabled at the same positions (banner 429-483, button 537-581), footer 771.
- Message and button stay well above the footer; no horizontal scroll (scrollWidth 390 = viewport). Dark mode screenshot read well (disabled button visibly muted).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The stop message chain in `ImportPhotosTab.tsx` is a nested ternary; a lookup by code would read better (T-027.3 owns polish).
- `Editor.test.tsx` showed one transient failure in a full parallel run (spy on `name`); possibly flaky under load.

### Scope self-check
- Could the diff be smaller? No (source ≈ +95/-20; the rest is tests).
- Diff size: +402 / -33 lines (6 files, before this log).
