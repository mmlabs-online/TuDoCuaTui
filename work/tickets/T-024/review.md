## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed: branch `claude/magical-cori-2ssw8l` at `9fd6928`, diff `origin/main...HEAD` (merge base `f76b017`; `origin/main` is `e96531f`, a board-only commit after that base).

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`).
- format:check: "All matched files use the correct format." (259 files), exit 0.
- test: `Test Files 100 passed | 10 skipped (110)`, `Tests 1254 passed | 205 skipped (1459)`, exit 0. This matches impl-log.md.
- build: `vite build` exit 0 ("built in 402ms").
- `scripts/mobile-verify.cjs` was run three times in local mode (branch dev server on :5199, with no `.env.local`):
  - Run 1: exit 1, one failure: `[H] 390x844-dark: home toast bottom 839 > 829`.
  - Run 2: exit 0, `failures: []`, info `430x932-dark: toast without modal not observed (timing)`.
  - Run 3: exit 0, `failures: []`, the same "not observed" info at 360-light, 390-light and 430-dark.
- The flake is in the script, not the app. The toast has `animation: rise 0.25s` (`translateY(10px)` → 0, `src/index.css:535`/`1058`). The script records the toast at the first poll in which it exists (`scripts/mobile-verify.cjs:497-510`). 839 is exactly the settled bottom (829) plus the 10 px start offset. The "not observed" case only skips the assertion.
- Probe (`t024-toastprobe.cjs`): 12 save flows at 390 and 430, light and dark, after the same wear-toast preamble. Every one settles at `bottom = innerHeight − 15` (829 / 917) with no running animations from about 300 ms on, and the toast stays for about 1.7 s. The app behaviour is deterministic. See Issue 1.
- Desktop (`--desktop-only`): main baseline vs branch at 1280×800. The diffs match impl-log. Pixel-diff bounding boxes (my own, threshold 8):
  - light editor 0.00 (noise, now below threshold); light delete-confirm: red button only.
  - dark home: the active chip only. Dark editor and dark editor-new: wear-bar icon, `.upload-icon` (green-ink) and the dimmed active chip behind the backdrop.
  - dark delete-confirm: the same plus the red button. Dark import-csv: "Copy mẫu" + chip. Dark export: the dimmed chip only.
  - Every diff maps to a planned shared fix (P1 2/3/4, P3 16). Visual before/after of the dark editor confirms layout, header and footer are unchanged.
  - Desktop hard assertions passed: header 86, 4-button footer in one row, Add label visible.

### Acceptance criteria
- [x] **No horizontal overflow at 320/360/390/430 with long names.**
  - Verify check A was green in all three runs (every viewport × theme × screen, including long-names and long-editor).
  - My measurements with the long name: editor `.modal` scrollWidth/clientWidth went from 550/318 (main, 320) and 550/388 (main, 390) to 318/318 and 388/388 on the branch. Document overflow is 0 everywhere.
  - Fix: `src/index.css:2413-2419` (`minmax(0,1fr)`, `min-width:0`) and `:2596-2598` (single column ≤ 650).
- [x] **All audit P1 items fixed, contrast ≥ 4.5:1 light and dark.**
  - P1 1: see above.
  - P1 2: `.btn.btn-danger-fill` at `index.css:2420-2425`. Computed background is `rgb(164, 69, 62)` at 320/390 in light and dark (main: `rgba(0,0,0,0)`, label invisible in light). White on `#a4453e` = 6.00:1. See `before/after-*-delete-confirm.png`.
  - P1 3: dark active chip `#1a1a1a` on `#fff8eb` = 16.47:1 (`index.css:2446-2450`; old rule at 358 removed).
  - P1 4: `--green-ink` `#bfe3c5` on dark surface `#1c2a24` = 10.67:1 and on `#22342c` = 9.41:1. Light `#0f3d2e` on `#fff8eb` = 11.51:1. Defined at `index.css:1341`/`1344`, swapped on the 10 text uses listed in the plan.
  - Check E (danger fill both dialogs, chip, "Xoá bộ lọc", "Copy mẫu", light + dark; dark wear-bar icon ≥ 3) passed in all three runs.
  - P1 5: every `100vh`/`95vh` in modal rules is followed by a `dvh` line (`index.css:518-519, 1250-1251, 2307-2315, 2565-2566, 2601-2604`). Only `.app-shell` `min-height: 100vh` (`:53`) remains, as the plan allows. Check F `.modal-wide` height === innerHeight passed at all four widths.
- [x] **≤ 650 px: inputs 16px, text ≥ 12px, targets ≥ 44px.**
  - Checks B, C and D (zoomInputs, tinyText, smallTargets) were empty in runs 2 and 3, across 4 viewports × 2 themes × all app screens and the 9 auth-preview states.
  - My auth sign-in measurement: email/password 39h/11px → 44h/16px; "Đăng nhập" 39 → 44; "Quên mật khẩu?" and "Chưa có tài khoản?" 20 → 44.
- [x] **Editor at 320×568: header + footer ≤ 25%, one-row footer, form scrolls, nothing hidden.** My measurements on the branch:
  - Edit mode with long name: header 61 + footer 61 = 21.5% (main: 86 + 101 = 32.9%, footer on 2 rows). Footer is 1 row with 3 buttons. The title is clamped to 2 lines (h2 48 px vs 113 px on main).
  - New mode: 57 + 61 = 20.8%, footer 1 row.
  - Modal scrollHeight 1866 > clientHeight 566. After scrolling to the end, the last form element bottom is 482 < footer top 506.
  - Check F (`editor-320`, edit/new × normal/long, light/dark) passed in all runs.
- [x] **Desktop ≥ 1024 unchanged apart from shared fixes.** Every desktop pixel diff maps to a planned shared fix (see Checks) and the desktop hard assertions pass. One more non-zero region is the `.upload-icon` in dark editor-new: plan §1 line 615 (green-ink) is a shared P1 4 fix.
- [x] **All checks pass; local mode unchanged.** All four checks are green. No file under `src/data/**` changed. The verify script and my screenshots ran entirely in local mode (demo items, no login, no page errors).

Screenshots, before = `main` at `e96531f` in a temporary worktree (now removed), after = branch. They cover 320×568 and 390×844, light and dark, for home, editor-new, editor-edit-long, editor-edit-long-bottom, delete-confirm, import-csv and auth-signin. Files: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/t024-shots/{before,after}-{320,390}-{light,dark}-<screen>.png`.

### Issues
#### Issue 1 — 🟡 should-fix — verify script check H is flaky (tooling, not app)
- **Where**: `scripts/mobile-verify.cjs:488-510` (`save-toast` step).
- **Expected**: check H's no-modal half asserts the settled toast position on every run.
- **Actual**:
  - It measures the first frame the toast exists, which can fall during the `rise` animation. That frame gives bottom 839, a false hard failure (run 1).
  - In other runs the poll misses the toast and only logs info, so the assertion silently does not run (390-light in run 3).
- **Fix instruction**:
  - Replace the poll loop with `await page.waitForFunction(() => { const t = document.querySelector(".toast"); return t && !document.querySelector(".modal-backdrop") && t.getAnimations().every(a => a.playState === "finished"); }, null, { timeout: 3000 })`, then read the bottom.
  - Turn the "not observed" info into `fail("H", …)`.
  - This does not block PASS. Fold it into the next touch of the script.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no data-layer change; local mode verified.
- R6: the new strings `close`, `duplicate` and `addItem` are in `src/features/items/copy.ts`, `src/features/import-export/copy.ts` and `src/features/layout/copy.ts`. "Huỷ" and "Xoá" in `Editor.tsx` already existed.
- R7: every changed file is in the plan's table. `ticket.md` only carries the workflow claim, and `impl-log.md` is the agent output.
- R8: 7 new unit tests cover the markup hooks, aria-labels and the no-break space.
- R9: covered at 320–430 in light and dark.
- R10: the diff does not touch `AGENTS.md`, `.figma/` or `vite.config.ts`. In `index.html` only the viewport `content` changed, and the `figma:` comments are intact.
- Nothing under `src/features/auth/**` changed (auth fixes are CSS-only).

### Nits (do not block)
- `button.self-center.underline` (`src/index.css`, touch block) couples global CSS to Tailwind utility classes in `AuthLayout.tsx`. It matches only that one element today. The plan already lists a follow-up to give `LinkButton` a semantic class.
- `scripts/mobile-verify.cjs` usage comment says `/tmp/t024-*`, while sessions use the scratchpad. Cosmetic.
- The editor opens scrolled to the name field (existing `autoFocus`), so the photo area is above the fold on open. This is pre-existing and listed in follow-ups.

### Follow-ups (out of scope)
- BUG-001 (invisible confirm button) is fixed by this diff through `.btn.btn-danger-fill`. Close it as fixed by T-024, or note that its D42 regression test still has to exist. T-024 adds no jsdom test that fails before the fix; the only evidence is the Playwright check E.
- Fix the check H flake (Issue 1).
- Already in impl-log: `autoFocus` on phones, `role="status"` on the toast, focus trap and rings (F-1101), a semantic class for the auth LinkButton, and real-device checks (iOS safe areas and toolbar, Android keyboard) for Ming.
- Stray worktree `/tmp/claude-0/wt-main` (branch `main-wt`) predates this run. The reviewer left it untouched.
