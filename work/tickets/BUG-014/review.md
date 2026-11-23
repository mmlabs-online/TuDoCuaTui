## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check` — pass ("All matched files use the correct format.", 353 files)
- `pnpm typecheck` — pass (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- `pnpm test` — 7 failed | 1998 passed | 288 skipped (5 files failed | 139 passed | 14 skipped). The 7 failures are the known Windows-only failures that already exist on main: server/ai/tagPhoto.test.ts (3), server/api.test.ts (1), server/index.cli.test.ts (1), server/scoping.test.ts (1), src/features/auth/boundary.test.ts (1). This diff touches none of them, and the result matches impl-log exactly.
- `pnpm build` — pass (built in 732ms)

### Acceptance criteria
- [x] A regression test reproduces the bug, failing on `main` and passing after the fix. Evidence: I swapped in `origin/main`'s `src/features/items/Editor.tsx` and ran `pnpm vitest run src/features/items/Editor.test.tsx -t "wear bar"`. Result: `× −1 is disabled at 0 wears` with `AssertionError: expected false to be true`, 1 failed | 2 passed. I then restored the file (`git checkout HEAD --`, tree clean). With the fix, `Editor.test.tsx` gives 55 passed (55). This matches impl-log.
- [x] "−1" is disabled at 0 wears and no request is sent. Evidence: `Editor.tsx:330` `disabled={item.wearCount <= 0}`. The test "−1 is disabled at 0 wears" checks `btn.disabled === true` and that `onWorn` is not called after a click. `onWorn` is the only path to `POST /items/:id/wear`. `wearCount` is typed `number` and defaults to `?? 0` in `mappers.ts:163` and `repo.http.ts:120`, so it is never null or undefined. Two more tests guard against disabling too much: "−1 is enabled above 0 wears and calls onWorn(-1)" and "Mặc hôm nay stays enabled at 0 wears".
- [x] All checks pass. Evidence: see Checks above. The only failures are the known Windows failures from main.
- [x] R9 at 390px and in dark mode. Evidence: no CSS change. The existing global `button:disabled` rule (opacity 0.6, cursor not-allowed, `src/index.css:42-45`) applies in both themes. This is a code-level check, as the plan says.

Ming verification after merge (not verified by reviewer, carry into the PR):
- On the released build, open an item with "Đã mặc 0 lần". "−1" looks dimmed, and clicking it sends no `/api/items/:id/wear` request (DevTools Network). After one "Mặc hôm nay", "−1" is enabled and undoes the wear. This is the UAT-5 re-check.

### Issues
None.

### Scope
The changed files are `src/features/items/Editor.tsx` (+3/−1, `disabled` prop only, wrapped by oxfmt) and `src/features/items/Editor.test.tsx` (+32, new `describe("wear bar")`). Both are in the plan. The other changes are ticket files under `work/tickets/BUG-014/`. No High path was touched.

### Rules (CLAUDE.md)
No violations found. R5: reads the derived `wearCount` and stores nothing. R6: no new copy. R7: the diff stays inside the plan. R8: regression test plus companion tests.

### Blockers from review agents
None (no review trigger applies).

### Nits (do not block)
- On desktop, `.btn:hover` still draws its ring on the disabled "−1". This happens on every disabled `.btn` today and is already noted in the plan's Assumptions.

### Follow-ups (out of scope)
- Disable "−1" and "Mặc hôm nay" while a wear request is in flight, to stop the double-click race at count 1. Server-side it is a harmless no-op.
