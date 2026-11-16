## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| scripts/confirm-verify.cjs | New D42 regression check (Playwright, global install via NODE_PATH, no dependency). |

`src/index.css` not touched: the after-run passed.

### Runs
- After: HEAD `9c422d0` (branch claude/magical-cori-2ssw8l), `pnpm build` + `pnpm preview --port 5199`. Exit **0**, `failures: []`, `info: []` (no unmocked /api calls; delete-ai-key reached through mocked API mode, no fallback used).
- Before: detached worktree at `7d6df33`, built, preview on 5198, this branch's script with `--base http://localhost:5198`. Exit **1**. Worktree removed, servers stopped.
- Failure lines (before, verbatim, representative; full list in `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug001-before/summary.json`, 60 lines):
  - `[danger-bg] discard light 390: rgba(0, 0, 0, 0)`
  - `[contrast] discard light 390: 1.02`
  - `[danger-bg] delete-item light 390: rgba(0, 0, 0, 0)`
  - `[contrast] delete-item light 1280 hover: 1.02`
  - `[danger-bg] delete-ai-key dark 390: rgba(0, 0, 0, 0)`
  - `[danger-bg] discard dark 1280 hover: border rgb(242, 107, 58)`
  - `[tap-390] discard light 390: confirm {"left":201.67,"right":295.56,"top":772,"bottom":811,"w":93.89,"h":39}`
  All three dialogs fail `danger-bg` in both themes, idle and hover; `contrast` fails in light only (as planned; in dark the light text on the transparent dark surface still reads). `tap-390` also fails pre-fix (button height 39, below 44; the 44px minimum came with T-024).
- `unchanged` block (cancel button and header `.btn-primary`, per theme) is **identical** before and after: light cancel transparent/`rgb(26, 26, 26)`, primary `rgb(26, 26, 26)`/`rgb(255, 253, 248)`; dark cancel transparent/`rgb(255, 248, 235)`, primary `rgb(255, 248, 235)`/`rgb(26, 26, 26)`.
- After values: background and border `rgb(164, 69, 62)`, text `rgb(255, 255, 255)`, contrast >= 4.5, idle and hover.
- Screenshots (scratchpad, not committed): `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug001-after/<dialog>-<light|dark>-<390|1280>.png` (+ `-1280-hover.png`); before: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug001-before/` same names.

### Tests added / changed
- scripts/confirm-verify.cjs › checks `danger-bg`, `contrast`, `tap-390`, `unchanged` record

### Checks (actual output summary)
- typecheck: exit 0 (tsc app + server)
- format:check: All matched files use the correct format (260 files)
- test: 100 files passed | 10 skipped; 1254 tests passed | 205 skipped
- build: built OK

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- None.

### Scope self-check
- Could the diff be smaller? No (one script, 245 lines).
- Diff size: +245 / -0 lines (new file); nothing committed, per instruction.
