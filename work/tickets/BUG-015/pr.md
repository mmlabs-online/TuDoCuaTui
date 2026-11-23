<!-- PR title: BUG-015: Last-worn label says "0 ngày trước" in the editor but "hôm nay" on the card -->
<!-- Branch: ticket/BUG-015 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- One shared, pure `lastWornLabel(lastWorn, days)` in `src/features/items/copy.ts` ("hôm nay" at 0 days, "N ngày", "hơn 1 năm" above 365, never-worn wording for empty), with its strings in `EDITOR_COPY.wear` (R6).
- `ItemCard.tsx` uses it in place of its inline ternary — the card shows exactly what it did before.
- `Editor.tsx` shows "Lần cuối " + the same label, so it now reads "Lần cuối hôm nay" / "Lần cuối 3 ngày" / "Lần cuối hơn 1 năm" (drops "ngày trước"); never-worn still reads "Chưa có lịch sử".
- Date maths (`ageInDays` → `daysSince`, UTC+7 aware) is unchanged; only the wording was wrong.

## Acceptance criteria
- [x] Regression test fails on `main` and passes after — "worn today shows Lần cuối hôm nay" renders "Lần cuối 0 ngày trước" on main (reviewer re-ran it on an `origin/main` copy); the 3-day and over-a-year editor tests also fail on main; all pass here.
- [x] Expected behaviour holds — one wording shared by card and editor (`copy.ts:67`, `ItemCard.tsx:39`, `Editor.tsx:324-325`); `lastWornLabel` unit tests for empty/0/1/365/366 days.
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 2004 passed, 7 failed, 288 skipped on the agent's Windows machine; the 7 are the known Windows-only failures also on `main`, none in touched files. Please confirm CI is green.
- No textual conflict with the open BUG-014 branch (`git merge-tree`); whichever merges second re-runs the checks.

## Needs Ming's decision
- Copy: the editor drops "trước" ("Lần cuối 3 ngày" instead of "Lần cuối 3 ngày trước") to match the card, per the ticket's "same rules". Say if you want "trước" kept.

## Follow-ups
- Remaining hard-coded Vietnamese copy (R6): "Chưa có ảnh", "Không hãng", "Chưa có vị trí" in `ItemCard.tsx`; "Đã mặc … lần" at `Editor.tsx:321`.

Links: [plan.md](work/tickets/BUG-015/plan.md) · [review.md](work/tickets/BUG-015/review.md) · [impl-log.md](work/tickets/BUG-015/impl-log.md) · [consult-frontend-developer.md](work/tickets/BUG-015/consult-frontend-developer.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
