## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| `src/features/items/Editor.tsx` | Root cause: "−1" `Btn` now has `disabled={item.wearCount <= 0}` (oxfmt wrapped it over 3 lines) |
| `src/features/items/Editor.test.tsx` | New `describe("wear bar")` with 3 tests (D42 regression test + companions) |

### Tests added / changed
- `Editor.test.tsx` › wear bar › −1 is disabled at 0 wears (regression)
- `Editor.test.tsx` › wear bar › −1 is enabled above 0 wears and calls onWorn(-1)
- `Editor.test.tsx` › wear bar › Mặc hôm nay stays enabled at 0 wears

Regression test written first. Before the fix (Editor.tsx unchanged): "−1 is disabled at 0 wears" FAILED
(`expected false to be true` at `btn.disabled`), the other two passed (1 failed | 2 passed). After the fix all 3 pass.

### Checks (actual output summary)
- typecheck: pass (tsc --noEmit && tsc -p tsconfig.server.json, no errors)
- format:check: pass ("All matched files use the correct format.")
- test: 7 failed | 1998 passed | 288 skipped. All 7 failures are the known pre-existing Windows failures on main, none in Editor tests:
  server/ai/tagPhoto.test.ts (3), server/api.test.ts (1), server/index.cli.test.ts (1), server/scoping.test.ts (1), src/features/auth/boundary.test.ts (1). Not fixed.
- build: pass (built in 651ms)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Disable "−1" and "Mặc hôm nay" while a wear request is in flight (double-click race at count 1); harmless server-side no-op.
- Optional Playwright screenshot at 390px not done; global `button:disabled` style covers it (per plan).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: Editor.tsx +3 / -1; Editor.test.tsx +30 / -0
