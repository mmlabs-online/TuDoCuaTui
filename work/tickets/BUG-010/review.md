## Attempt 1 — 2026-11-21
Verdict: PASS

Reviewed `13377dc` against `origin/bug/BUG-010` (`03c2bf3`). The branch is stacked on PR #96.

### Checks (run by reviewer)
Fresh native WSL copy from `git archive`, `pnpm install --frozen-lockfile`, only `.env.example` copied. The copy was removed afterwards.
- `pnpm format:check` — exit 0.
- `pnpm typecheck` — exit 0 (app and server).
- `pnpm test` — **intermittent, not caused by this diff.** Three full runs on HEAD: 2 failed, 1 green (137 files passed, 11 skipped; 1937 tests passed, 222 skipped). Both failures were the same single test: `server/ai/tagPhoto.test.ts` › "413 for a streamed body over 2 MB without a length" (`write ECONNRESET`). The same test failed 2 of 12 isolated runs on the unchanged base `origin/bug/BUG-010`, and 1 of 5 on HEAD. The diff changes no file under `server/`.
- `pnpm build` — exit 0.

### Acceptance criteria
- [x] Regression test fails before the fix and passes after — evidence: with the base `AiSettingsModal.tsx` restored, `AiSettingsModal.test.tsx` › "API key input is not a login password field" fails with `expected 'off' to be 'new-password'`; with the fix, the whole file passes.
- [x] With a saved site password, opening the modal leaves the key field empty and shows no error — evidence: real browser, throwaway profile, fake credential, local fixture: on open there are 0 password inputs and 0 key errors. The same seeded profile did fill the login page (username 19 chars, password 25 chars, `:autofill` true), so the credential was live. With no input in the DOM there is nothing to fill. **Limit:** my positive control on the pre-fix modal did **not** autofill (Chromium and Chrome), so I did not reproduce the before/after contrast that impl-log records. This criterion rests on the DOM structure, not on that contrast.
- [x] All checks pass — evidence: above, with the pre-existing `tagPhoto` flake disclosed.

### Independent verification
Real-browser results use a throwaway profile, a fake credential and a token-free fixture on `127.0.0.1`.

| Question | Result |
|---|---|
| Can an autofilled value be saved or validated before an explicit user action? | No path found. `form.key` is written only by the input's `onChange` (`AiSettingsModal.tsx:193-196`) and reset by `initialForm`; the input mounts only after the button's `onClick` (`:183`, `:199`). Model change + Save sent keys `provider, model` only. |
| Empty keeps the old key | Holds. Reveal without typing, change model, Save: no `apiKey`. Typing then clearing is covered by the unit test. Provider change with an empty key keeps Save disabled. |
| Reveal state after load | Collapsed on open and after load. |
| Reveal state after save / delete | Collapsed after both. |
| Reveal state after failed save | Stays open, typed key kept (40 chars). |
| Reveal state after provider change | Stays open, typed key kept, and Save sends it for the new provider. |
| Pointer on the button inside `<label>` | Reveals once, input empty. |
| Pointer on the label text "API key" | Also reveals and focuses the input. This is an explicit user click, so it is acceptable. |
| Keyboard | Tab from Model reaches the button. Enter and Space each reveal and focus the input, and neither inserts a character. |
| 390px, light and dark (R9) | Button and input 340x44, inside the viewport, no horizontal overflow; screenshots checked. |

**Not verified:** the `:autofill` second layer against a real browser fill. My build with `autocomplete="off"` showed an empty field, but because the positive control did not fill, that result proves nothing. The layer is covered by stubbed unit tests only.

### Issues
#### Issue 1 — 🟡 should-fix — accessibility
- **Where**: `src/features/settings/AiSettingsModal.tsx:199`
- **Expected**: the button's accessible name contains its visible text "Dán API key".
- **Actual**: the browser accessibility tree names it "API key", because the wrapping `<label>` of `Field` wins. A screen reader does not announce the action.
- **Fix instruction**: add `aria-label={COPY.keyPlaceholder}` to the reveal `Btn`, then find it by role and name in the tests. Does not block this ticket.

### Rules (CLAUDE.md)
No violations found. R6: reused `COPY.keyPlaceholder`. R7: the changed source files match the plan's file list, with no High path. R8: tests added. R9: checked above.

### Blockers from review agents
None at the time of writing. `security-review.md` appeared in the worktree during this review and was not read; the orchestrator owns copying any 🔴 finding here.

### Nits (do not block)
- After a successful save the focused input or button goes away and focus falls to `body`, so a keyboard user restarts tabbing.

### Ming verification after merge
1. In Chrome and Edge, open "AI" settings, click "Dán API key", and confirm no dropdown offers the saved login. If one appears, do not select it; report it. "Suggest strong password" is noise, but note it.
2. **Added by this review:** save a **fake** key of valid format on a non-production account or local build, and confirm Chrome shows no "Save password?" or "Update password?" prompt. If one appears, dismiss it and report it. The field is now `new-password` and disappears after a successful request, which may look like a password change to the browser. Automation cannot see this native prompt, and accepting it could overwrite the saved login.

### Follow-ups (out of scope)
- Fix or quarantine the flaky `server/ai/tagPhoto.test.ts` › "413 for a streamed body over 2 MB without a length". It fails on the base branch too and makes `pnpm test` unreliable as a gate.
