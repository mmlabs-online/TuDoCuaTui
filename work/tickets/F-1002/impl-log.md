## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/features/items/Editor.tsx` | Camera input (`capture="environment"`), `photo-source-actions` row with two buttons (D2) |
| `src/features/items/copy.ts` | `EDITOR_COPY.photo` labels (R6) |
| `src/index.css` | `.photo-source-actions` hidden by default, shown under `@media (hover: none) and (pointer: coarse)`; light-on-chocolate button colours |
| `src/features/items/Editor.test.tsx` (new) | The 4 tests listed in the plan (R8) |

### Tests added / changed
- `Editor.test.tsx › photo inputs › has one camera input and one gallery input`
- `Editor.test.tsx › photo inputs › "Chụp ảnh" clicks the camera input`
- `Editor.test.tsx › photo inputs › "Chọn từ thư viện" and the upload zone click the gallery input`
- `Editor.test.tsx › photo inputs › a file from the camera input sets the photo`

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean
- format:check: All matched files use the correct format
- test: 355 passed (355)
- test:coverage: Statements 100%, Branches 99.28% (415/418), Functions 100%, Lines 100%
- build: built in 445ms
- Not done: visual check at 390px / dark mode in DevTools (criterion 4, reviewer/Ming).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Input value is not reset after a pick, so re-picking the same file after "Bỏ ảnh" will not fire `change` (pre-existing).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see `git show --stat`.
