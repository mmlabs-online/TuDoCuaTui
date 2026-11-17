## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| src/components/Icon.tsx | New `ai` glyph (paths, no text) and `data-icon={name}` on the svg (test hook). |
| src/features/layout/Header.tsx | Settings button uses `<Icon name="ai" />` (only that line). |
| src/features/layout/Header.test.tsx | BUG-005 regression test + theme-toggle test. |
| src/components/Icon.test.tsx (new) | Unit tests for the `ai` glyph and `data-icon`. |

### Tests added / changed
- src/features/layout/Header.test.tsx › AI settings button shows the "ai" icon, not the sun-like "settings" icon (BUG-005) — regression
- src/features/layout/Header.test.tsx › theme toggle keeps its sun/moon icon
- src/components/Icon.test.tsx › "ai" draws its own glyph, different from "sun" and "settings"
- src/components/Icon.test.tsx › sets data-icon to the icon name

### Regression test before / after
- Before the fix (tests written first, product code unchanged): 4 failed | 1 passed. The regression test failed with `AssertionError: expected null to be 'ai'` (svg had no data-icon and drew `settings`).
- After the fix: all 5 tests in the two files pass.

### One-off Playwright check (D42, outside the repo, not committed)
Harness renders the real `Header` (all buttons, `onSettings` set) through a throwaway Vite config in the scratchpad; script `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-005/shot.cjs`. Result: settings button svg has `data-icon=ai` in all 4 cases, no horizontal overflow (scrollWidth equals viewport width at 390 and 1280). Looked at the 390 dark and 1280 light shots: "AI" reads clearly and differs from the sun/moon toggle.
- /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-005/header-390-light.png
- /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-005/header-390-dark.png
- /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-005/header-1280-light.png
- /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-005/header-1280-dark.png

### Checks (actual output summary)
- typecheck: pass (tsc --noEmit && tsc -p tsconfig.server.json, no errors)
- format:check: pass ("All matched files use the correct format", 270 files)
- test: pass (105 files passed, 10 skipped; 1261 tests passed, 205 skipped)
- build: pass (vite build, built in 415ms)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The `settings` entry in Icon.tsx is now unused; remove it or redraw it as a real gear.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: product code +10 / -1 (Icon.tsx +9, Header.tsx +1/-1); tests +35 (Header.test.tsx) and 20 new lines (Icon.test.tsx).
