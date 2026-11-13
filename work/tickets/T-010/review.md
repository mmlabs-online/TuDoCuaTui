## Attempt 1 — 2026-11-13
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (tsc + tsconfig.server.json) exit 0, no errors
- format:check: "All matched files use the correct format." (193 files)
- test: 794 passed, 102 skipped (896); matches impl-log
- build: `vite build` OK (index JS 258.46 kB, CSS 47.82 kB)

### Acceptance criteria
- [x] Saving shows the masked key; reloading never shows the full key — evidence: `AiSettingsModal.test.tsx` › "save shows the masked hint and empties the key field" (asserts `document.body.innerHTML` does not contain the typed key) and › "a fresh mount shows only the hint"; `aiSettings.test.ts` › "save sends apiKey only when given…" and › "never writes to localStorage or sessionStorage"; key only in component state, input `type="password"` `autoComplete="off"` (`AiSettingsModal.tsx` key `<input>`). Playwright (saved view): modal shows "Đã lưu: ••••wxyz. Để trống nếu giữ key cũ." with an empty key field.
- [x] Changing provider changes the model list; invalid combinations cannot be saved — evidence: `form.test.ts` (modelsFor, nextModelOnProviderChange, initialForm, canSave incl. Gemini-no-models, disallowed model, malformed key, provider change with saved key and empty key); modal test › "lists Gemini as disabled and disables Save for an invalid combination".
- [x] Clear Vietnamese errors (invalid key, test failed, network); key field cleared after save — evidence: `copy.ts` `AI_ERRORS: Record<AiErrorCode,string>` (typecheck-enforced completeness); `copy.test.ts` (every code non-empty, requestId, no server-only names); `aiSettings.test.ts` network / opaqueredirect→unauthorized / server codes / unknown→internal; modal tests › "test failure shows the prefix and the message", › "network error on load shows the message and Thử lại calls get again", › "invalid_key_format from the server keeps the typed key"; save clears key via `initialForm(view)`.
- [x] Hidden in local mode; works at 390px and in dark mode; tests pass — evidence: `App.test.tsx` › "local mode has no settings button", › "api mode shows the settings button and opens the AI settings modal"; `App.tsx` passes `onSettings` only when `wardrobe.mode === "api"`. Reviewer Playwright run on `vite preview` build at 390x844 (stubbed `/healthz` + `/api/**`): local mode gear count 0; API mode light/dark, empty and saved states: `documentElement.scrollWidth` 390, modal 0–390px with no internal overflow (scrollWidth 388 = clientWidth), text and inline error readable in both themes; new CSS uses only `--muted`, `--border`, `--surface`, `--danger` (defined for light and dark).

Ming verification after merge (not reviewer's): plan.md "Ming verification after merge" items 1–4 (real device 390px light/dark, real Claude key save/reload, Kiểm tra success and wrong-key message, Xoá key then Test shows "chưa có key").

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no `fetch` in components; `src/data/aiSettings.ts` client + `localAiSettings` stub; gear and modal gated on API mode. R3: key only in PUT body, never cached/stored; no `ai_settings`/`AI_KEK` strings in client code (boundary test green). R6: all copy in `src/features/settings/copy.ts` (header aria-label from it). R7: all changed files are in the plan's file list; no `server/`, `db/`, `src/shared/ai/` changes. R8: pure logic (form, copy, client) tested. R9: verified above. R10: no Figma Make files touched.

### Nits (do not block)
- `AiSettingsModal.tsx`: the key format error shows from the first typed character (and for whitespace-only input); showing it on blur or once length ≥ 20 would be friendlier.
- `AiSettingsModal.tsx`: a status message (e.g. "Đã lưu cài đặt AI") stays visible after the user edits the form again until the next action.
- `localAiSettings` is exported but unused by the app (App never renders the modal in local mode); fine as a planned stub.

### Follow-ups (out of scope)
- Dev escape hatch to open the modal in `pnpm dev` (plan A4; T-018.2 review note).
