## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check` — pass ("All matched files use the correct format", 357 files).
- `pnpm typecheck` — pass (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- `pnpm test` — 7 failed / 2014 passed / 288 skipped (161 files, 5 failed). All 7 are in the known pre-existing Windows
  failures on `main`: `server/ai/tagPhoto.test.ts` (3, incl. the flaky "in-flight cap" the impl-log mentions),
  `server/api.test.ts` (1), `server/index.cli.test.ts` (1), `server/scoping.test.ts` (1),
  `src/features/auth/boundary.test.ts` (1). None touches a file in this diff. The implementer's 6 vs my 7 is the
  flaky tagPhoto case they reported; not a mismatch.
- `pnpm build` — pass (vite build; `.outline-none{--tw-outline-style:none;outline-style:none}` is in the built CSS).

### Regression evidence (bug rule) — reproduced by the reviewer
Ran the new test files against `origin/main`'s source (a `git archive origin/main` copy in the scratchpad with only
the new/changed test files and the new `focusTrap.ts` copied in): **12 failed, 60 passed**.
- `Modal.test.tsx`: 9 of 11 fail on `main` ("renders an aria-modal dialog and traps focus" fails at
  `getByRole("dialog", { name: "Tiêu đề" })`); the 2 that pass on `main` are guard cases, as impl-log says.
- `FilterBar.test.tsx` › "each filter select has an aria-label" fails on `main` (no combobox named "Trạng thái").
- `Editor.focus.test.tsx`: both fail on `main` at the dialog query.
- `OutfitsModal.test.tsx` with the new `baseTimers()` passes on `main` too (the helper change is neutral there).

Judgement on the name-field symptom (UAT-7, "typing after Thêm món đồ goes nowhere"): not reproduced at unit level,
and the planned Playwright check was not run (sign-in needs real Identity credentials or the dev token proxy via
`scripts/with-secrets.sh`, which is a human step). I accept the evidence as sufficient for this ticket because:
1. The ticket's confirmed root cause (`Modal.tsx` with no ARIA and no focus management; unlabeled filter selects) is
   fully covered by tests that fail on `main` and pass on the branch.
2. For the name-field part, `main` already focuses the field (React `autoFocus`, which calls `element.focus()` in the
   commit in real browsers as in jsdom). No code path explains the symptom; the most likely cause is the UAT tooling
   (DOM inspection through an automated, possibly unfocused tab). The branch replaces it with an explicit
   `focus()` from `Modal`, and `Editor.focus.test.tsx` › "new item focuses the name field" pins the requirement.
3. The one-off check is moved to "Ming verification" in impl-log with concrete steps (1-6). These must be carried
   into the PR body (see below). If Ming's step 1 still fails in production, that is a new bug with a different
   root cause, not a reason to hold this fix.

### Acceptance criteria
- [x] Regression test fails on `main`, passes after — evidence: reviewer run above (12 fail on `main`); all pass on
      the branch in the full `pnpm test` run.
- [x] `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the title — `Modal.tsx:66-72` and the heading layout
      effect at `Modal.tsx:21-28`; tests "renders an aria-modal dialog and traps focus", "keeps an existing heading
      id", `Editor.focus.test.tsx` (named "Món đồ mới" / "Áo thun"). All existing modal suites stay green.
- [x] Focus moves into the modal; name field for a new item — `Modal.tsx:29-36`; tests "focuses the data-autofocus
      element on open", "focuses the dialog when nothing is marked", "keeps focus that a child already moved
      inside" (covers `AiSettingsModal.tsx:189` autoFocus), `Editor.focus.test.tsx` (both).
- [x] Tab stays inside, topmost only — `Modal.tsx:46-58`; tests "Shift+Tab on the first element goes to the last",
      "Tab with focus outside pulls focus into the topmost dialog", "only the topmost of two stacked modals traps";
      `focusTrap.test.ts` (5).
- [x] Focus returns to the opener — `Modal.tsx:39-44`; tests "restores focus to the opener on close", "does not throw
      or move focus when the opener is gone", "a stacked modal returns focus to the control in the modal below".
- [x] Filter selects have `aria-label` — `FilterSelect.tsx:18`; `FilterBar.test.tsx` new test.
- [x] No visual change; 390px / dark (R9) — diff review: no `index.css` change; only `outline-none` added on the
      non-interactive dialog container (layered utility, beats the UA ring; no `.modal` outline rule to conflict).
      Real-browser 390px/dark screenshots are in Ming verification step 6 (not run, see above).
- [x] Existing behaviour kept (Escape topmost only, backdrop mousedown, dirty check) — existing `App.test.tsx`,
      `ImportModal.test.tsx` and stacked-Escape tests green; Escape path at `Modal.tsx:48` unchanged in effect.
- [x] All checks pass — see Checks.

### Points judged explicitly
1. **Regression evidence** — sufficient; see the section above.
2. **Out-of-plan `src/features/outfits/OutfitsModal.test.tsx`** — justified under `Out-of-plan files` (R7 met). I
   verified the cause with a scratch probe under `vi.useFakeTimers()`: each jsdom `HTMLElement.focus()` schedules
   one `setTimeout(…, 0)` (bare `div.focus()` 0→1 timers; 4 Modal mount/unmount cycles 2→4→6→8 timers), and
   `vi.advanceTimersByTime` drains them all to 0. They are one-shot jsdom internals, not a leak; `Modal.tsx` itself
   creates no timer. Without the helper change, the two weather tests fail on the branch with "expected 3 to be 2"
   (reproduced). The fix keeps both assertions unchanged, and they are still differential: an uncleared weather
   timer would still leave the count at base+1. Sound, if coupled to jsdom internals (nit 1).
3. **Existing item no longer autofocuses the name field** — accepted. The ticket only asks for the name field on a
   new item; the plan records this as an explicit assumption with a default and the one-attribute reversal
   (`data-autofocus` without `isNew`); it is tested ("existing item focuses the dialog, not the name field"); and it
   stops the soft keyboard opening when merely viewing an item on a phone. It is a user-visible behaviour change, so
   the PR body must state it for Ming (below). Known gap already listed as follow-up 5: Duplicate turns the open
   Editor into a new item without remounting, so focus does not move to the name field then.

### Issues
None blocking.

### Rules (CLAUDE.md)
No violations found. R6: no new UI copy (names come from existing `h2`s and the existing `label` prop). R7: every
changed file is in the plan or justified. R8: new pure logic (`focusTrap.ts`) has unit tests. R1/R2/R3/R4/R5: not
touched. No High path changed.

### Blockers from review agents
None (no review trigger applies).

### For the PR body
- Behaviour change: opening an existing item now focuses the dialog, not "Tên món đồ" (new item still focuses it).
- Ming verification (from impl-log): steps 1-7, including the UAT-7 typing check, Tab/Shift+Tab 40x with the
  editor open, Escape focus return, Confirm over Editor, named dialogs for the other four modals, 390px light/dark
  screenshots, and the screen reader / phone checks from the plan.

### Nits (do not block)
1. `OutfitsModal.test.tsx:556-562`: the priming render + `vi.clearAllTimers()` depends on jsdom scheduling a timer per
   `focus()`. A sturdier alternative later would be counting only timers created by the weather code (spy on
   `setTimeout` with a filter), but the current form is correct.
2. `focusTrap.ts`: `tabbables` is attribute-based, so a CSS-hidden (`display:none`) tabbable at the end of the list
   lets one Tab escape before the window listener pulls focus back on the next Tab. Ming verification step 2 covers
   the Editor; worth a follow-up only if it shows up.
3. `Editor.focus.test.tsx` has no `// @vitest-environment jsdom` header unlike the sibling new files; it works via
   the config default, so only a consistency point.

### Follow-ups (out of scope)
- The 8 follow-ups in impl-log (alertdialog Confirm, scroll lock, mousedown+mouseup backdrop, opener-gone fallback,
  Duplicate focus, `OutfitsModal.tsx:188` / `ImportPhotosTab.tsx:119` select labels, Escape during IME composition,
  optional `inert` on the app root) — the orchestrator files them as `debt` issues.
- A stubbed-auth Playwright harness (or a test-only route) so jsdom-invisible UI bugs can get the one-off scripted
  check without real credentials; this is the second ticket where sign-in blocked it.
