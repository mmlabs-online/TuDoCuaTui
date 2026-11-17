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

## Attempt 1 — re-review (compiled CSS)
Verdict: REWORK

Date: 2026-11-17. Supersedes the attempt-1 PASS above. That PASS rested on a regression check that linked the raw
`src/index.css`, whose `@import "tailwindcss"` does not resolve in the browser (no preflight, so no
`box-sizing: border-box` and default `p`/`h1` margins), and on icon-less fixture buttons. Production ships the
compiled CSS with icon + text buttons, so that run did not test the shipped layout.

### What the reviewer ran
- Built HEAD (`a3e0920`, BUG-003 rule from `a6bf7a2` unchanged): `pnpm exec vite build --outDir scratchpad/rev003b/build`
  → `✓ built in 384ms`, CSS `assets/index-CaWkBbVy.css`.
- Ran the BUG-004 reviewer's harness (`rev004/hero/hero-check.cjs`, copied to `scratchpad/rev003b/`) against that CSS.
  It uses the real `Hero.tsx` markup (`src/features/layout/Hero.tsx:28-51`: four `.collage-card` with `<img>` + label,
  Import/Export as `button.btn.btn-secondary` from `src/components/Btn.tsx` with an 18px `Icon` svg + text) at
  360/375/390/414/490/560/650px, light and dark, with Google Fonts loaded and with them blocked.
- For comparison, the same harness against the compiled CSS of `a6bf7a2^` (pre-fix tree via `git archive`, built
  outside the repo).

### Results (fonts loaded; light and dark identical)
| Width | `.collage-1` vs paragraph "Hôm nay có 62 món lâu chưa mặc…" | `.collage-1` vs Export button |
|---|---|---|
| 360 | box 43×37px, **over the text 15×34px** | box 40×44px, **over the label 28×18px** |
| 375 | box 38×37px, **over the text 28×34px** | box 25×44px, **over the label 13×18px** |
| 390 | box 26.5×37px, **over the text 13.4×34px** (card x=215, text line ends x=228) | box 9.9×44px (button box only; label ends x=212) |
| 414 | box 2.5×37px (element box only, text clear) | clear |
| 490 / 560 / 650 | clear | clear |

With fonts blocked the numbers are of the same order (390: text overlap 15.3×32.6px). Screenshot
`scratchpad/rev003b/out/hero-on-light-390.png`: the yellow "Mới mua" card covers the end of "chưa mặc" on the first
paragraph line. Pre-fix CSS (`a6bf7a2^`): `clear` at every width and theme, so the overlap is introduced by `a6bf7a2`.
The title (h1) and the Import button are clear at every width.

### Acceptance criteria
- [ ] Regression check: the check in impl-log/attempt 1 ran on raw `src/index.css` with icon-less buttons, so it does
      not reproduce production. Not valid evidence.
- [ ] Expected behaviour ("the title, text and Import/Export buttons stay readable and unobstructed") at 390px:
      **not met**. Card 1 covers ~13px of the paragraph text at 390px, ~28px at 375px, and the Export label at 360–375px.
- [x] Cards inside the hero card at 490/650px: met (no change from attempt 1).
- [ ] All checks pass: not re-run in this re-review (CSS-only behaviour finding; re-run on the rework).

### Issues
1. 🔴 `src/index.css` ≤ 650px `.hero-collage` rule (`src/index.css:2247-2255`: `right: 20px; bottom: 10px; width: 200px;
   height: 190px; transform: scale(0.68); transform-origin: right bottom`). Expected: no collage card overlaps the
   hero paragraph or the Import/Export buttons (element boxes, not only the glyphs) at 360, 375, 390 and 414px, while
   both visible cards stay inside `.intro` (± a few px) at every width 360–650px. Actual: `.collage-1` overlaps the
   paragraph at 360–414px and the Export button at 360–390px (table above). Fix inside the ≤ 650px hero block only,
   e.g. a smaller scale / narrower collage for narrow phones (an extra `@media (max-width: 430px)` step is fine),
   and/or narrowing `.hero-copy` / the paragraph's `max-width`; do not change > 650px.
2. 🔴 Regression check must test what production ships: load the **compiled** CSS (`pnpm exec vite build --outDir
   <scratch dir outside the repo>`), use the real `Hero.tsx` markup (cards with `<img>` + label; Import/Export as
   `button.btn.btn-secondary` with the 18px icon svg + text), and assert at **360, 375, 390, 414, 490 and 650px, light
   and dark**: (a) every visible `.collage-card` lies within `.intro`; (b) no `.collage-card` box intersects any
   `.hero-copy > *` box or `.mobile-import .btn` box. Show it fails on `a6bf7a2^` (cards outside `.intro`) and on
   current HEAD (overlap at 360–414px), and passes after the fix; record outputs and screenshots for all 12 combos in
   impl-log. `rev004/hero/hero-check.cjs` is a usable starting point (it prints overlaps but does not assert
   containment or set an exit code).

### Ming verification after merge
- Unchanged from attempt 1 (real phone, light and dark: both collage photos visible inside the hero card and not
  covering the text or the Import/Export buttons).

### Nits (do not block)
- 💭 The 414px element-box overlap (2.5px) does not touch text, but issue 1 asks for clear boxes there too so the
  margin survives longer item counts (e.g. "Hôm nay có 120 món…") and font fallback.

### Follow-ups (out of scope)
- Sticky top bar overlapping the hero title on scroll (already noted).
