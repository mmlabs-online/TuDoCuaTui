## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| src/data/repo.ts | `SaveOptions.withPrepared`, `save(item, opts?)` (AC 5, one decode) |
| src/data/repo.http.ts | calls `withPrepared` with the prepared JPEG after `prepare`, before the item PUT; id/upload computed before the hook |
| src/data/useWardrobe.ts | `save` forwards `opts` (one-argument call kept when no opts) |
| src/data/photoImport.ts | optional AI step: `tag`, `onTagging`, `applyAiToBatchItem`, `AI_BATCH_OFF`, job `ai`/`aiError`/`aiFields`, result `aiStopped` |
| src/features/items/useAiLoad.ts (new) | settings-load effect extracted from `useAiFill` |
| src/features/items/useAiFill.ts | uses `useAiLoad`, no behaviour change |
| src/features/import-export/usePhotoImport.ts | `tagger`, `aiOn`, `aiStopped`, `current.tagging` |
| src/features/import-export/ImportModal.tsx | optional `ai` prop, `useAiLoad` + `aiAvailability` |
| src/features/import-export/ImportPhotosTab.tsx | checkbox row + availability notes, tagging progress, row labels, summary line, banner, skipped reasons |
| src/features/import-export/copy.ts | `photos.ai` strings |
| src/App.tsx | passes `ai` to `ImportModal` |
| src/index.css | `.check-row` alignment (flex-start, block title, 2px checkbox offset): the old centred layout put the title above a vertically centred box |
| tests: photoImport.test.ts, repo.http.test.ts, ImportModal.test.tsx, ImportPhotosTab.test.tsx | R8 |

### Tests added / changed
- photoImport.test.ts › applyAiToBatchItem (5 cases) and › runPhotoImport AI (14 cases: off, fill, prepared JPEG, nothing, tag error, non-AI error, rate_limited, invalid_key, photo ApiError rate_limited, 503 retry, PUT-failure retry, photoFailed retry, off retried, abort, onTagging)
- repo.http.test.ts › save withPrepared (3 cases)
- ImportModal.test.tsx › photos AI (11 cases; replaces "Photos tab shows no AI checkbox")
- ImportPhotosTab.test.tsx › AI (4 cases: progress, row labels, skipped reasons, banner + settings link)
- Editor tests unchanged and green (useAiLoad extraction).

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` no errors
- format:check: All matched files use the correct format.
- test: Test Files 119 passed | 11 skipped (130); Tests 1531 passed | 221 skipped (1752) (baseline 1495 passed)
- build: built in 619ms

### 390px / dark check (one-off Playwright harness, outside the repo: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-703/run.cjs; API mocked with page.route, `pnpm dev`, viewport 390x844, light and dark)
Screenshots in /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-703/:
- ready-light.png, ready-dark.png (AI ready, checkbox on, provider disclosure)
- nokey-light.png, nokey-dark.png (not configured: disabled checkbox + "Mở cài đặt")
- progress-light-running.png, progress-dark-running.png ("Đang nhờ AI xem ảnh 1/2: IMG_2031")
- finished-light-done.png, finished-dark-done.png (5 files: filled, skipped, rate_limited, 2 off; banner + summary)
- plus -done / base variants for each scenario.
Findings: no horizontal scroll (scrollWidth 390). Progress (y 403-433), summary (393-561) and AI-off banner (470-506) all sit above the modal footer (top 771) with the content scrolled to 0; the footer stays visible. Edit phase with 5 files scrolls inside the modal and is clipped by the footer as before (pre-existing). Dark tokens are fine (checkbox row border, green-ink title, csv-error banner). Initial look showed the check-row title above a vertically centred checkbox; fixed with the small CSS change above. Not checked: a real phone (Ming's step).

### Out-of-plan files
None beyond the plan; `src/index.css` is the plan's "only if needed" file.

### Follow-ups (noticed, not done)
- Per-row AI labels only appear after the run (the list shows "Chờ" while pending); could show the current file's tag state live.
- AI name replacing the file name is assumption A1 (easy flip in `applyAiToBatchItem`).
- `.check-row small` uses 8px on desktop (existing rule); the AI note is small there.

### Scope self-check
- Could the diff be smaller? No; production diff is about 330 lines including copy and UI.
- Diff size: +887 / -52 lines (about 630 of it tests).
