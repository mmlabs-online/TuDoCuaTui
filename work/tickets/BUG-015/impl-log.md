## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| src/features/items/copy.ts | Shared `lastWornLabel` + wear strings (R6) |
| src/features/items/ItemCard.tsx | Uses `lastWornLabel`; inline literals removed |
| src/features/items/Editor.tsx | The fix: editor label via `lastWornLabel`; import line |
| src/features/items/copy.test.ts (new) | Unit tests for `lastWornLabel` (R8) |
| src/features/items/Editor.test.tsx | Regression + wording tests (`last worn label`) |
| src/features/items/ItemCard.test.tsx | Over-year card test |

### Tests added / changed
- Editor.test.tsx › last worn label › worn today / 3 days / over a year / never worn
- copy.test.ts › lastWornLabel › empty, 0, 1 and 365, 366
- ItemCard.test.tsx › ItemCard wear pill › hơn 1 năm

Regression test run BEFORE the fix: failed (rendered "Lần cuối 0 ngày trước"; the 3-day and over-year tests also failed). Green after the fix.

### Checks (actual output summary)
- typecheck: pass
- format:check: pass (all matched files use the correct format)
- test: 7 failed | 2004 passed | 288 skipped. All 7 failures are pre-existing on Windows/main: server/api.test.ts (1), server/ai/tagPhoto.test.ts (3), server/index.cli.test.ts (1), server/scoping.test.ts (1), src/features/auth/boundary.test.ts (1). None in touched files.
- build: pass

### Out-of-plan files
None

### Follow-ups (noticed, not done)
- Other inline literals in ItemCard.tsx ("Chưa có ảnh", "Không hãng", "Chưa có vị trí") violate R6.

### Scope self-check
- Could the diff be smaller? no
- Diff size: see git diff --stat
