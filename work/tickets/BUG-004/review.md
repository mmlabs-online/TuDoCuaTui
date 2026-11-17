Verdict: PASS

## Attempt 1 — 2026-11-17
Verdict: PASS

Reviewed commit `d0203e5` only (the branch also carries BUG-005/002/003, reviewed separately).
Reviewer artefacts (outside the repo): `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/rev004/`.

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` — clean.
- format:check: "All matched files use the correct format." (274 files).
- test: Test Files 108 passed | 10 skipped (118); Tests 1269 passed | 205 skipped (1474). Matches impl-log.
- build: `✓ built`.

### Regression evidence (D42)
- **Builds re-made by the reviewer**: `vite build` of `HEAD` and of `d0203e5^` (temporary detached worktree, since removed)
  into `rev004/after` and `rev004/before`. The compiled CSS is byte-identical to the implementer's
  `bug-004/after` and `bug-004/before`, so the implementer's builds are what the code produces.
- **Playwright `bug004-toolbar.cjs`, before** (pre-fix CSS + markup): exit 1, 18 FAIL — at 390/560/650 light and dark:
  A2 FAIL (toolbar scrollWidth/clientWidth 878/342, 1048/512, 1138/602), A3 FAIL (`mask-image` gradient on `.toolbar`),
  A4 FAIL (no `.filter-row`); A1 PASS in the plain harness, as the plan predicted.
- **After**: exit 0, 32 PASS / 0 FAIL — A1–A4 at 390/560/650 × light/dark (390px: search box 24–366 = content box,
  toolbar 342/342, mask none, five selects 44px high, hit-testable, last select right 338 ≤ 366−28) and A5 at
  651/800/1000/1280 × light/dark (identical rects/display before vs after; at 651–1000 Vị trí lưu trữ and Màu hidden).
- **Reporter's inset reproduced** (extra reviewer variant `rev004/inset.cjs`: `.app-shell` padding +8px per side, i.e. the
  safe-area case): before, 390px → search box 32–374 vs content 32–358, toolbar clientWidth 326 — exactly Ming's
  numbers → A1 FAIL; after → search box 32–358 = toolbar 326, A1/A2 PASS. So the fix holds for the real phone case,
  not only the harness.
- **Unit test** `src/features/items/FilterBar.test.tsx › keeps the search box and the filter row as separate children of .toolbar`:
  run by the reviewer against the pre-fix `FilterBar.tsx` → FAIL (received `label.searchbox` + 5×`label.filter-select `);
  on HEAD → PASS.

### Acceptance criteria
- [x] Regression test reproduces the bug, fails before and passes after — evidence: Playwright before/after runs above
      (390, 560, 650px) and the FilterBar unit test before/after.
- [x] All five filter selects are still reachable on mobile — evidence: A4 PASS at 390/560/650 × light/dark (each select
      `scrollIntoView` → within `.filter-row`, `elementFromPoint` hits it; last select scrolls clear of the 28px fade).
- [x] Light and dark at 390/560/650 — evidence: A1–A4 in both themes; reviewer looked at
      `rev004/shots-after/panel-after-{390,560,650}-{light,dark}.png`: search box full panel width, placeholder visible,
      filter chips in their own row below, faded at the right edge only at 390/560; dark mode readable. Before
      screenshots show the search box running off the right edge. Implementer must attach the six after-screenshots to the PR.
- [x] Desktop/tablet (> 650px) unchanged — evidence: A5 PASS at 651/800/1000/1280 × light/dark; `.filter-row { display: contents }`
      (`src/index.css:307-309`) keeps the six grid items, and the re-indexed hide selectors (`src/index.css:1125-1126`)
      hide the same two selects as before.
- [x] All checks pass — see Checks.

### Scope
Changed files: `src/features/items/FilterBar.tsx` (wrapper div only, rest re-indent), `src/index.css` (4 hunks exactly as
the plan: base `.filter-row`, ≤1000px re-index, ≤650px toolbar/searchbox/filter-row, mask moved `.toolbar`→`.filter-row`),
`src/features/items/FilterBar.test.tsx` (new), `work/tickets/BUG-004/impl-log.md`. All in the plan. The dropped
`.searchbox` `background: var(--surface)` is still applied by the base rule at `src/index.css:1726-1731`.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R6: no copy changed. R7: categories row untouched. R8: regression check + unit test. R9: 390px and
dark verified. R1–R5 not touched.

### Nits (do not block)
- 💭 `FilterBar.test.tsx` renders with a filters object literal; if `Filters` gains a field the test needs updating
  (typecheck will flag it, so low risk).

### Ming verification after merge
- On a real phone (light and dark), the search box fits the panel and the filter row swipes sideways on its own.

### Follow-ups (out of scope)
- BUG-003 hero collage overlaps the hero text at ≤ 414px in the compiled CSS — see Cross-check below.

## Cross-check: BUG-003
Question: impl-log says BUG-003's `bug003-hero-collage.cjs` reports `clear:FAIL` at 390px against the compiled CSS
and passes only against raw `src/index.css`; is that a harness artefact?

**Answer: no, it is real. The compiled CSS is what production ships; the raw-CSS run is the misleading one** (raw
`src/index.css` linked via `file://` cannot resolve `@import "tailwindcss"`, so there is no preflight — e.g. no
`box-sizing: border-box`, default margins on `p`/`h1` — and the layout differs from production).

Reviewer check `rev004/hero/hero-check.cjs`: compiled CSS (`vite build` of HEAD), real `Hero.tsx` markup (cards with
`<img>` + label, Import/Export as `button.btn.btn-secondary` with the 18px `Icon` svg + text), real Google Fonts loaded
(Be Vietnam Pro / Fraunces) and also with fonts blocked; results are the same in light and dark.

| Width | Card 1 (`.collage-1`) vs hero paragraph "Hôm nay có 62 món lâu chưa mặc…" | Card 1 vs Export button |
|---|---|---|
| 360 | box 43×37px; over the text by 15×34px | box 40×44px; over the button text by 28×18px |
| 375 | box 38×37px; over the text by 28×34px | box 25×44px; over the text by 13×18px |
| **390** | **box 26.5×37px; over the text by 13.4×34px** (card x=215, text line ends x=228) | box 9.9×44px (button border/background only; text ends x=212, clear) |
| 414 | box 2.5px (element box only, text clear) | clear |
| 490 / 560 / 650 | clear | clear |

The screenshot `rev004/hero/hero-on-light-390.png` shows the yellow card covering the end of "chưa mặc" on the first
line of the paragraph; at 375px (`hero-on-dark-375.png`) "mặc" is mostly hidden. The Export button (z-index 7) sits on
top of the card corner at 390px, so its label stays readable there, but at 360–375px the card reaches under the
button text. The title (h1) and Import button are clear at every width.

- Not caused by BUG-004: the run against the pre-BUG-004 compiled CSS (`d0203e5^`) gives identical numbers and an
  identical 390px screenshot; BUG-004 does not touch the hero rules.
- Caused by BUG-003: the same check against the compiled CSS from before BUG-003 (`a6bf7a2^`) is clear at every width
  (there the cards sat at the right edge and were clipped — the original bug). BUG-003's new placement
  (`src/index.css` ≤650px `.hero-collage { right: 20px; bottom: 10px; width: 200px; transform: scale(0.68); transform-origin: right bottom }`)
  pulls card 1 left into the text column on phones ≤ ~414px.
- BUG-003's own ticket Expected says "the title, text and Import/Export buttons stay readable and unobstructed", which
  the compiled build does not meet at 360–390px. **BUG-003 needs a follow-up fix** (e.g. a new BUG ticket, or rework
  before its PR merges): keep card 1 right of the paragraph/buttons at ≤ 414px (smaller scale or narrower collage
  on narrow phones, or limit `.hero-copy` / the paragraph width), and change the regression check to load the
  compiled CSS with the real button markup (icon + text) at 360, 375, 390 and 414px.
