Verdict: PASS

## Attempt 1 — 2026-11-17

### Checks (run by reviewer)
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0)
- format:check: pass ("All matched files use the correct format", 273 files)
- test: pass (Test Files 107 passed | 10 skipped; Tests 1268 passed | 205 skipped) — matches impl-log
- build: pass (`✓ built in 469ms`)

### Acceptance criteria
- [x] Regression check reproduces the bug: fails before the fix, passes after — evidence: one-off Playwright check
      `bug003-hero-collage.cjs` (D42, script outside the repo). Reviewer re-ran it in fresh dirs
      (`scratchpad/bug-003/rev-before/`, `rev-after/`). Pre-fix CSS = `git show a6bf7a2^:src/index.css` (byte-identical
      to the implementer's `before.css`) → exit 1, all 6 rows `inside:FAIL` (390: `.collage-2` 327–440 vs card edge
      370; 490: 427–540 vs 470; 650: 587–700 vs 630). Current `src/index.css` (identical to a6bf7a2) → exit 0, all 6 rows
      `inside:PASS clear:PASS`. Outputs match impl-log exactly.
- [x] Both collage cards and labels inside the hero card in light and dark at 390/490/650 — evidence: script rows
      (390: cards 206–307 / 268–364, bottoms 403 / 385, intro right 370, bottom 409), and the reviewer viewed the
      after screenshots light-390, dark-390, dark-490, light-650 plus before light-390: before, "Yêu thích" is cut off at
      the card edge; after, both cards and the "Mới mua" / "Yêu thích" labels sit fully inside the card in both themes.
- [x] Title, text and Import/Export buttons unobstructed — evidence: `clear:PASS` on all 6 rows; screenshots show the
      cards below the "Hôm nay có … món lâu chưa mặc" line and right of the buttons.
- [x] Screenshots light/dark × 390/490/650 exist for the PR —
      `scratchpad/bug-003/after-shots/hero-{light,dark}-{390,490,650}.png` (reviewer copies in `rev-after/`).
      Orchestrator: attach/link them in the PR body.
- [x] Only the ≤ 650px hero collage rule changes; > 650px unchanged — evidence: `git show a6bf7a2 -- src/index.css`
      touches only `.hero-collage` inside `@media (max-width: 650px)` (`src/index.css:2239-2247`). Reviewer also ran a
      before/after comparison of bounding boxes, computed `transform`, `transform-origin` and `display` of `.intro`,
      `.hero-collage`, `.collage-card`, `.hero-copy`, `.mobile-import` at 651/700/800/1000/1001/1280/1440 px, light and
      dark: 14 combos, 0 differences.
- [x] All checks pass — see above.

### Ming verification after merge
- On a real phone (light and dark), open the main screen with ≥ 2 items with photos: both collage photos ("Mới mua",
  "Yêu thích") are fully visible inside the hero card and do not cover the text or Import/Export buttons.

### Scope
Commit a6bf7a2 changes `src/index.css` (+5/−4, the one planned rule) and `work/tickets/BUG-003/impl-log.md`. Both in the
plan's file list. No out-of-plan files. (Other `src/index.css` changes on the branch, e.g. `.grid-more`, belong to
BUG-002 and were not reviewed here.)

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. CSS only: no data access (R1), no migrations (R2), no secrets (R3), no photo paths (R4), no
derived values (R5), no copy (R6), within plan (R7), no pure logic so no unit test needed; regression evidence per
D42 (R8), verified at 390px and dark mode (R9).

### Nits (do not block)
- 💭 The fixture's Import/Export buttons have no `<Icon>` (the real `Btn` renders one), so real buttons are ~20px
  wider each. The cards start at x≥206 at 390px, while the buttons end at ≈177 in the fixture, so the margin
  still holds. Ming's on-phone check covers the remaining fidelity gap (fonts, real photos).

### Follow-ups (out of scope)
- Sticky top bar overlapping the hero title on scroll (already noted in the ticket).
- BUG-004 also edits `src/index.css` in the ≤ 650px blocks: re-run `bug003-hero-collage.cjs` after both land.
