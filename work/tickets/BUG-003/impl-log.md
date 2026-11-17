## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/index.css` | Replaced the `.hero-collage` rule in the `@media (max-width: 650px)` block (right 20px, bottom 10px, width 200px, scale 0.68, transform-origin right bottom). Root cause fix. |
| `work/tickets/BUG-003/impl-log.md` | Implementer log (D42 records the one-off check here). |

### Tests added / changed
- One-off Playwright regression check `bug003-hero-collage.cjs` (browser-only, outside the repo, D42): asserts both visible `.collage-card` boxes lie inside `.intro` (±4px) and do not intersect hero text or Import/Export buttons, at 390/490/650px, light and dark. Script and fixtures: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003/

Before the fix (pre-fix `src/index.css`, exit 1):
```
light 390 inside:FAIL clear:PASS 254,253,373,395 | 327,236,440,373 intro 370 409
light 490 inside:FAIL clear:PASS 354,253,473,395 | 427,236,540,373 intro 470 409
light 650 inside:FAIL clear:PASS 514,253,633,395 | 587,236,700,373 intro 630 409
dark  390/490/650: identical, all inside:FAIL
```
After the fix (exit 0):
```
light 390 inside:PASS clear:PASS 206,282,307,403 | 268,268,364,385 intro 370 409
light 490 inside:PASS clear:PASS 306,282,407,403 | 368,268,464,385 intro 470 409
light 650 inside:PASS clear:PASS 466,282,567,403 | 528,268,624,385 intro 630 409
dark  390/490/650: identical, all PASS
```
Screenshots (after): /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003/after-shots/hero-{light,dark}-{390,490,650}.png

### Checks (actual output summary)
- typecheck: pass (tsc app + server)
- format:check: pass (273 files)
- test: 107 files passed, 10 skipped; 1268 tests passed, 205 skipped
- build: pass (built in 434ms)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Sticky top bar overlaps the hero title on scroll (already listed as out of scope in the ticket).
- BUG-004 also edits `src/index.css`; re-run the check after both land.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +5 / -4 lines in src/index.css

## Attempt 2 (REWORK: re-review on compiled CSS)

Scratch dir (all files, builds, screenshots): `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/`

### Files touched
- `src/index.css`: added two narrow-phone steps right after the existing `@media (max-width: 650px)` block (hero collage only):
  `@media (max-width: 430px) { .hero-collage { right: 14px; transform: scale(0.56); } }` and
  `@media (max-width: 380px) { .hero-collage { right: 10px; transform: scale(0.48); } }`.
  Required because at 360-414px the 0.68 scaled collage covered the paragraph and the Export button (review issue 1).
  Nothing above 650px changed (490/650px card boxes are identical to HEAD); BUG-002 `.grid-more` and BUG-004 toolbar rules untouched.

### Regression check (issue 2)
Harness: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/hero-check.cjs <vite-build-dir> <fonts on|off> <outdir>` (derived from the reviewer's hero-check.cjs). It loads the
**compiled** CSS from `pnpm exec vite build --outDir <scratch>`, real Hero.tsx markup (4 `.collage-card` with img + label; Import/Export as
`button.btn.btn-secondary` with 18px svg + text), at 360/375/390/414/490/650px, light and dark. Asserts (a) every visible card within
`.intro` (+-4px) and (b) no card box intersects any `.hero-copy > *` or `.mobile-import .btn` box; exits 1 on failure.
| Build | Result | Output |
|---|---|---|
| `a6bf7a2^` (`build-pre`) | RESULT FAIL, 12/12 combos (collage-2 outside `.intro` by 40-60px) | `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/pre.txt`, `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/pre/` |
| HEAD `bc1d00c` (`build-head`) | RESULT FAIL, 8/12 (overlap at 360/375/390/414 light+dark: card 1 over paragraph, and over Export at 360-390) | `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/head.txt`, `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/head/` |
| After fix (`build-after`) | RESULT PASS, 12/12 clear, exit 0 (fonts on); also PASS with Google Fonts blocked | `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/after.txt`, `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/after/`, `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/after-off/` |
Card 1 left edge after the fix: 236 (360), 251 (375), 246 (390), 270 (414) vs paragraph box right edge 228/238/241/241 and Export right 224.
Screenshots viewed: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/after/hero-on-light-390.png`, `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/after/hero-on-dark-360.png` (both cards inside the hero card,
title, paragraph and Import/Export unobstructed). All 12: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/out/after/hero-on-{light,dark}-{360,375,390,414,490,650}.png`.

### Checks (`/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/checks.txt`)
- typecheck: pass; format:check: pass (274 files); test: 108 files passed, 1269 tests passed (205 skipped, 10 files skipped); build: `built` ok.
- BUG-004 toolbar check (`bug004-toolbar.cjs` on `build-after`): exit 0, 32 PASS, 0 FAIL (`/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-003-r2/bug004.txt`).

### Out-of-plan files / follow-ups
- None. Scope self-check: only `src/index.css` (+12 lines) and this log.
