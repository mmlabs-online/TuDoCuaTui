## Attempt 1 — 2026-11-21

### Files touched
| File | Required because |
|---|---|
| `src/features/settings/AiSettingsModal.tsx` | The fix: no password input until the user clicks "Dán API key"; then `name="ai-api-key"`, `autoComplete="new-password"`; `:autofill` guard on change and on Save; reveal state resets after load, save and delete |
| `src/features/settings/AiSettingsModal.test.tsx` | Regression test (written first) and hardening tests 2-8; helpers and affected existing tests updated per plan |
| `src/App.test.tsx` | One line: wait for the "Dán API key" button instead of a password input (that input no longer exists on open) |

### Tests added / changed
- AiSettingsModal.test.tsx › "API key input is not a login password field" (regression). **Failed before the fix** on the unchanged modal: `AssertionError: expected 'off' to be 'new-password'` (1 failed, 12 skipped). Passes after the fix.
- › "opening the modal renders no password input and no key error"
- › "saving a model change without revealing the field sends no apiKey"
- › "a value the browser marks as autofilled is ignored"
- › "Save refuses a field that became autofilled and sends nothing"
- › "a typed key is trimmed and sent; clearing it keeps the saved key"
- › "the field collapses after a successful save and after delete"
- › "a browser without :autofill support can still enter a key"
- Updated: `type` helper (clicks reveal first), "shows loading...", "save shows the masked hint...", "a fresh mount...", "network error on load...", "server_misconfigured hides the form" (also asserts the reveal button is absent); `src/App.test.tsx` settings test.
- The reveal button is found by text (`getByText`), not by role name: because `Field` is a wrapping `<label>`, the button's accessible name is the label text ("API key"), not "Dán API key". The `matches` spies delegate every selector except `:autofill` to the real method (Testing Library calls `matches` for role queries).

### Checks (actual output summary)
Run in a native WSL copy (`~/bug010`, `pnpm install --frozen-lockfile`, `.env.example` copied, no other `.env*`), re-synced before each run; the copy was removed afterwards.
- typecheck: `pnpm typecheck` (tsc app + server) exit 0, no errors.
- format:check: "All matched files use the correct format."
- test: Test Files 137 passed | 11 skipped (148); Tests 1937 passed | 222 skipped (2159). (One earlier full run showed `ItemGrid.test.tsx` "Xem thêm" timing out at 5000 ms while 14 other tests failed from my own test bugs; it passed in the later full runs. Unrelated file, looks like a load-dependent flake.)
- build: `vite build` built in 356 ms.

### Real-browser check (AC2) — PASS
One-off Playwright (npm `playwright` 1.x, installed in a WSL temp dir outside the repo; Chromium 159 headed under WSLg; missing system libs unpacked locally, no sudo). Throwaway profile from `mkdtemp`, fake credential `bug010@example.test` plus a generated 25-character password (never logged), local Vite page on `127.0.0.1:5199` with the real `AiSettingsModal` and an in-memory fake client. No real profile, saved password, sign-in or API key. Seeding: Playwright cannot click the native save bubble, so the fake login row was written into the throwaway profile's own `Login Data` (basic password store encryption).
- **Positive control (pre-fix markup `type=password autocomplete=off`, no name):** `len=25`, `matches(":autofill")=true` before any click and after a real click; value equals the fake password. Control filled, so the gate passed.
- **Modal, on open:** 0 password inputs, 0 format errors.
- **After clicking "Dán API key", 2 s wait, click elsewhere:** `value.length=0`, `:autofill=false`, 0 errors.
- **Model change + Save:** recorded payload keys `["provider","model"]` (no `apiKey`).
- **Typing a key after reveal** (30 fake chars): accepted, no error, Save enabled.
- **390px viewport, light and dark:** reveal button 340x44 and the input 340x44 inside the viewport, no horizontal scroll; dark screenshot checked by eye. (The light/dark button screenshots were taken during the modal's entry animation, geometry was measured from the DOM.)
- Throwaway profile, generated password file, fixture and Playwright dir all deleted.
- Not covered (Playwright cannot see native UI): whether Chrome/Edge show a saved-login dropdown on the revealed field. Stays on Ming's post-merge list item 1 of the plan.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The reveal button inside the wrapping `<label>` gets the accessible name "API key" (label wins), so a screen reader does not hear "Dán API key". Fixing it needs `aria-label` or moving the button out of `Field`; left as is to stay in scope.

### Scope self-check
- Could the diff be smaller? No: the component change is the plan's design; tests are the listed ones.
- Diff size: +160 / -15 lines across 3 files (plus this log).
