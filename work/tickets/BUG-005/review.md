Verdict: PASS

## Attempt 1 — 2026-11-17
Verdict: PASS

Reviewed commit `ba18d32` only (the branch also carries BUG-002/003/004 record/plan commits; they are not part of this review).

### Checks (run by reviewer)
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- format:check: pass ("All matched files use the correct format", 270 files, exit 0)
- test: pass (Test Files 105 passed | 10 skipped; Tests 1261 passed | 205 skipped). Matches impl-log.
- build: pass (`vite build`, built in 434ms)

### Regression evidence (bug ticket, D42)
- Reviewer ran the new tests against the pre-fix product code (`git archive ba18d32^` into a scratch copy, plus the two
  test files from `ba18d32`, `npx vitest run`): **4 failed | 1 passed**. The regression test
  `Header.test.tsx › AI settings button shows the "ai" icon, not the sun-like "settings" icon (BUG-005)` failed with
  `AssertionError: expected null to be 'ai'`. Matches the impl-log "before" output.
- After the fix (branch HEAD): all 5 tests in the two files pass (part of the full run above).
- Even with only `data-icon` added, the regression test would read `"settings"` from `Header.tsx` and still fail, so
  it pins the actual fix, not just the test hook.
- One-off Playwright check re-run by the reviewer (implementer's harness, which renders the real `Header` with
  `src/index.css`; output to a separate folder): `data-icon=ai` in all 4 cases; `scrollWidth` 390 at 390px and 1280 at
  1280px (no horizontal overflow).

### Acceptance criteria
- [x] 1. Regression test fails before, passes after — evidence: above; `src/features/layout/Header.test.tsx` (BUG-005 test).
- [x] 2. Button shows an icon that reads as "AI", clearly different from the theme toggle — evidence:
      `src/components/Icon.test.tsx › "ai" draws its own glyph, different from "sun" and "settings"` (passes; no
      `<circle>`, innerHTML differs from both); screenshots
      `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-005/header-{390,1280}-{light,dark}.png`
      viewed: "AI" reads clearly in all four, next to the moon (light) / sun (dark) toggle, same weight and colour as
      the neighbouring icons.
- [x] 3. Accessible label stays "Cài đặt" and click calls `onSettings` — evidence: BUG-005 test finds the button by
      `SETTINGS_COPY.open` and asserts `onSettings` called once; `src/features/layout/Header.tsx:41` (`aria-label`,
      `onClick`) unchanged in the diff.
- [x] 4. No other top-bar icon changed — evidence: `Header.tsx` diff is only line 42 (`settings` → `ai`); `Icon.tsx`
      diff only adds the `ai` entry (`Icon.tsx:79-86`) and `data-icon={name}` (`Icon.tsx:105`); `sun`/`moon`/`settings`
      paths untouched; test `theme toggle keeps its sun/moon icon` passes.
- [x] 5. 390px and dark mode (R9) — evidence: 390 light/dark screenshots; glyph uses the shared `stroke="currentColor"`;
      no overflow at 390px.
- [x] 6. All checks pass — evidence: Checks above.

### Scope
Changed files: `src/components/Icon.tsx`, `src/components/Icon.test.tsx` (new), `src/features/layout/Header.tsx`,
`src/features/layout/Header.test.tsx`, `work/tickets/BUG-005/impl-log.md`. All in the plan's file list. No out-of-plan
files.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1–R5 not touched (no data access, secrets, storage or derived values). R6: no new UI copy; "AI"
is drawn as paths, the aria-label stays `SETTINGS_COPY.open`. R7: diff matches the plan. R8: regression and unit tests
added, checks green. R9: verified by screenshots at 390px and in dark mode.

### Nits (do not block)
- `Header.test.tsx` `baseProps` uses module-level `vi.fn()` instances shared across tests; harmless here (no assertions
  on them), but per-test mocks would be safer if later tests assert on `onAdd` etc.
- The theme-toggle test hard-codes `"Đổi giao diện"` instead of the copy constant used elsewhere; fine for a test, but
  the constant would survive a copy change.

### Ming verification after merge
- Look at the top bar on the real phone and on desktop after deploy (light and dark): the button left of sign-out shows
  "AI" and no longer looks like the sun. Attach the four screenshots above to the PR.

### Follow-ups (out of scope)
- The `settings` entry in `src/components/Icon.tsx` is now unused (no remaining `name="settings"` in `src/`); remove it
  or redraw it as a real gear.
