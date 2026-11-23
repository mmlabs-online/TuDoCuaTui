<!-- PR title: BUG-016: Modals have no dialog semantics or focus handling; new-item name field is not focused -->
<!-- Branch: ticket/BUG-016 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- `src/components/Modal.tsx` (used by every modal: Editor, Confirm, AI settings, "Hôm nay mặc gì?", Import, Export) is now a named dialog: `role="dialog"`, `aria-modal`, `aria-labelledby` from the modal's first `h2`.
- Focus handling in Modal: initial focus on the `data-autofocus` element (else the dialog itself, `tabIndex=-1`, no outline), a Tab / Shift+Tab trap on the topmost modal only (new pure `src/components/focusTrap.ts`), and focus return to the opener on close (`isConnected` guard).
- `FilterSelect.tsx`: `aria-label={label}`, so the five toolbar filters have accessible names.
- `Editor.tsx:343`: `autoFocus` → `data-autofocus={isNew || undefined}` — a new item's name field is focused explicitly by Modal.

## Acceptance criteria
- [x] Regression tests fail on `main` and pass after — against an `origin/main` copy: 9/11 `Modal.test.tsx`, the FilterBar aria-label test and both `Editor.focus.test.tsx` tests fail (12 failed); all pass here (review.md). Note: the name-field symptom itself (UAT-7) does not reproduce in jsdom — React `autoFocus` already focuses it on main — so the browser check is in Ming verification below.
- [~] Expected behaviour at 390px and in dark mode (R9) — no visual styling added; the one-off Playwright check could not run because sign-in needs real credentials. Steps are under Needs Ming's decision.
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 2014 passed, 7 failed, 288 skipped on the agent's Windows machine; all 7 in the five files that already fail on `main` there (incl. the flaky tagPhoto "in-flight cap"). Please confirm CI is green.
- No textual conflict with the open branches T-029, T-032, BUG-014, BUG-015 (`git merge-tree`).

## Needs Ming's decision
- **Behaviour change:** opening an *existing* item no longer focuses its name field (the dialog gets focus; this also stops the phone keyboard opening when you only view an item). One attribute to revert if you want the old behaviour.
- **Out-of-plan test change:** `src/features/outfits/OutfitsModal.test.tsx` `baseTimers()` helper primes and clears timers around its measurement, because jsdom's `focus()` schedules a one-shot `setTimeout(0)` under fake timers (reviewer verified it is not a leak; assertions unchanged).
- **Ming verification (browser, after deploy or on a local build):**
  1. Click "Thêm món đồ", type `Áo test`: it lands in "Tên món đồ" (UAT-7).
  2. Tab / Shift+Tab ~40 times with the editor open: focus stays in the dialog and never lands on the hidden file inputs.
  3. Escape: focus returns to "Thêm món đồ".
  4. Open an item, "Xoá", Tab inside the Confirm, Escape: focus returns to the Editor's delete button.
  5. "Hôm nay mặc gì?", Import, Export, AI settings: each is a named dialog (`aria-modal=true`).
  6. 390px, light and dark, editor opened by keyboard: no focus ring around the whole modal; the name input shows its normal focus style.
  7. Screen reader on a real device (VoiceOver / NVDA) announces the dialog name.

## Follow-ups
1. Confirm as `alertdialog` with `aria-describedby` and initial focus on cancel.
2. Body scroll lock while a modal is open (plus `overscroll-behavior: contain`).
3. Backdrop closes only when mousedown and mouseup are both on the backdrop.
4. Focus fallback when the opener has been removed (e.g. after a delete).
5. Duplicate: move focus to the name field when the Editor turns into a new item.
6. Check and label the selects at `OutfitsModal.tsx:188` and `ImportPhotosTab.tsx:119`.
7. The window Escape listener can fire during IME composition or with an open `<select>`.
8. Optional `inert` on the app root while a modal is open.
9. A Playwright setup with stubbed sign-in, so jsdom-invisible UI bugs can get their one-off scripted check (blocked twice now).
- Nits: `tabbables` reads attributes only (a CSS-hidden last element can let one Tab escape before the next pulls focus back); `Editor.focus.test.tsx` lacks the `// @vitest-environment jsdom` header.

Links: [plan.md](work/tickets/BUG-016/plan.md) · [review.md](work/tickets/BUG-016/review.md) · [impl-log.md](work/tickets/BUG-016/impl-log.md) · [consult-frontend-developer.md](work/tickets/BUG-016/consult-frontend-developer.md) · [consult-ux-architect.md](work/tickets/BUG-016/consult-ux-architect.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
