## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm typecheck` — pass (tsc app + server, exit 0).
- `pnpm format:check` — pass (354 files checked, no diffs).
- `pnpm test` — 7 failed | 2004 passed | 288 skipped. The 7 failures are the known Windows-only ones that already fail on `main`: server/api.test.ts (1), server/ai/tagPhoto.test.ts (3), server/index.cli.test.ts (1), server/scoping.test.ts (1), src/features/auth/boundary.test.ts (1). The diff touches none of them, and every test in the changed files passes. This matches impl-log exactly.
- `pnpm build` — pass.

### Acceptance criteria
- [x] Regression test fails on `main` and passes after the fix. Evidence: I extracted `origin/main` with `git archive` into a scratch dir, copied in the branch's `Editor.test.tsx`, and ran `vitest -t "last worn label"`. "worn today shows Lần cuối hôm nay" FAILED: it rendered "Lần cuối 0 ngày trước". The 3-day test (got "Lần cuối 3 ngày trước") and the over-year test (got "Lần cuối 371 ngày trước") also failed. "never worn" passed, as expected. On the branch all 4 pass.
- [x] 2a "hôm nay" for 0 days in both places. Evidence: Editor.test.tsx › last worn label › worn today, and ItemCard.test.tsx › the existing "hôm nay" at 02:00 UTC+7 test. Both green.
- [x] 2b Same "N ngày" rule in both places. Evidence: Editor.test.tsx › worn 3 days ago, ItemCard.test.tsx › "1 ngày", and copy.test.ts › 1 and 365 days. All green.
- [x] 2c Same "hơn 1 năm" rule in both places. Evidence: Editor.test.tsx › worn over a year ago, ItemCard.test.tsx › new "hơn 1 năm" test, and copy.test.ts › 366 days. All green.
- [x] 2d One shared formatter. Evidence: src/features/items/copy.ts:67 `lastWornLabel`. ItemCard.tsx:39 and Editor.tsx:324-325 both call it. A grep for "hôm nay|hơn 1 năm|ngày trước" in ItemCard.tsx/Editor.tsx finds only the unrelated "Mặc hôm nay" button label (Editor.tsx:334).
- [x] 3 All checks pass. See Checks above (the only failures are the Windows-only ones already on `main`).

### Issues
None.

### Rules (CLAUDE.md)
No violations found.
- R5: the label is computed at render time and nothing is stored.
- R6: the new strings live in `EDITOR_COPY.wear`.
- R7: all 6 changed source files are in the plan, and there are no out-of-plan files.
- R8: copy.test.ts covers the pure formatter at the boundaries 0, 1, 365, 366 and empty.
- R9: text-only change, and the new label is shorter than the old one.

The card's branch order and thresholds are unchanged, so card output is identical. The editor keeps its `item.lastWorn` guard, so the 999 fallback never reaches the formatter.

### Blockers from review agents
None

### Nits (do not block)
- Editor.tsx:321 `Đã mặc {item.wearCount} lần` is still an inline literal next to the edited hunk. It is older than this ticket and was left alone per R7.
- Editor.test.tsx `last worn label` › `at` calls `vi.useFakeTimers` inside the helper. That works, and `afterEach` restores real timers.

### Follow-ups (out of scope)
- The other inline Vietnamese literals in ItemCard.tsx ("Chưa có ảnh", "Không hãng", "Chưa có vị trí") and Editor.tsx:321 ("Đã mặc … lần") break R6. They should go into one follow-up/debt ticket.
- Hotspot with the unmerged BUG-014 (Editor.tsx, Editor.test.tsx): the orchestrator found no textual conflict. Whichever ticket merges second re-runs the checks.
