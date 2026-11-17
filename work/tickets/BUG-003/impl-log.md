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
