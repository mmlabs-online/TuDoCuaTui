<!-- PR title: BUG-014: "−1" wear button is enabled at 0 wears and still sends a request -->
<!-- Branch: ticket/BUG-014 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- The "−1" wear button in `src/features/items/Editor.tsx` is disabled when `item.wearCount <= 0`, so it no longer sends a no-op `POST /api/items/:id/wear` at 0 wears.
- New `describe("wear bar")` in `Editor.test.tsx`: the regression test plus two tests that the buttons that should stay enabled still work.
- No server change: the endpoint already treats −1 at 0 as a harmless no-op.

## Acceptance criteria
- [x] Regression test fails on `main` before the fix and passes after — "−1 is disabled at 0 wears" fails on main's `Editor.tsx` with `expected false to be true` (reviewer re-ran it), passes with the fix; 55/55 in `Editor.test.tsx`.
- [x] Expected behaviour holds — "−1" disabled at 0 (uses the existing `button:disabled` style, `index.css:42-45`, both themes); enabled above 0 and calls `onWorn(-1)`; "Mặc hôm nay" stays enabled.
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 1998 passed, 7 failed, 288 skipped on the agent's Windows machine; the 7 are the known Windows-only failures also on `main`, none in the Editor tests. Please confirm CI is green.

## Needs Ming's decision
- None. After merge (UAT-5 re-check): open an item with "Đã mặc 0 lần" — "−1" is dimmed and sends no request; after one "Mặc hôm nay", "−1" undoes the wear.

## Follow-ups
- Disable both wear buttons while a wear request is in flight (a fast double click at count 1 sends two requests; the second is a server no-op).
- Nit: the hover ring still shows on a disabled `.btn` on desktop (existing behaviour for every disabled button).
- BUG-015 and BUG-016 touch the same Editor files and should rebase onto this.

Links: [plan.md](work/tickets/BUG-014/plan.md) · [review.md](work/tickets/BUG-014/review.md) · [impl-log.md](work/tickets/BUG-014/impl-log.md) · [consult-frontend-developer.md](work/tickets/BUG-014/consult-frontend-developer.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
