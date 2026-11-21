Status: READY

# Plan — BUG-010: Chrome autofills the saved account password into the AI "API key" field

## Scope summary
Scope reference is the bug report in `work/tickets/BUG-010/ticket.md`:

> **Expected**
> - The API key field is empty. The hint "Đã lưu: ••••XXXX. Để trống nếu giữ key cũ." stays true.
> - The browser does not fill or offer the account password in this field.

> **Scope**
> - Stop the password manager from treating the API key input as the login password, e.g. `autoComplete="new-password"` plus a distinct `name` such as `ai-api-key`, or a text input with CSS masking.
> - Optional hardening inside the same file: do not treat an untouched autofilled value as a new key.

> **Out of scope**
> - The server-side key storage and the key test endpoint.
> - Other password inputs (sign-in, sign-up, reset), which are correct as login fields.

`work/decisions.md` D42: "Every bug fix ships with a regression test that fails before the fix (Playwright when jsdom cannot see the bug) ... until then a browser-only bug gets a unit-level regression test where one can reproduce it, plus a one-off Playwright check (the session's preinstalled Playwright, script outside the repo) whose result is recorded in impl-log and review."

### Root cause: confirmed and extended
- Confirmed: `src/features/settings/AiSettingsModal.tsx:164-165` renders `type="password"` with `autoComplete="off"`, which Chrome ignores for saved logins.
- Extended: the filled value does not stay in the DOM. It enters React state through `onChange` (`:169`), is validated (`:104`, which produced the UAT error), and is sent as `apiKey` on Save (`:70-74`). Changing only the attribute leaves this path open if a browser ignores the hint.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "A regression test reproduces the bug: it fails on `main` before the fix and passes after" | `AiSettingsModal.test.tsx` › "API key input is not a login password field". impl-log records the red run on the unchanged modal (failing on `autocomplete` being `off`) and the green run after the fix. |
| 2 | "With a saved site password in Chrome, opening the modal leaves the key field empty and shows no error" | One-off Playwright check below, recorded in impl-log as `PASS` **only if its positive control autofilled**. Otherwise it is recorded as `NOT VERIFIED` and this criterion moves to Ming (next section). The reviewer must not count `NOT VERIFIED` as a pass. |
| 3 | "All checks pass" | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, all run in the native WSL copy (see Tests to write). |

Hardening, verified by unit tests: an untouched or autofilled value is never validated or sent (tests 2-6 below).

## Ming verification after merge
1. **Always (Playwright cannot see native browser UI):** in Ming's own Chrome and Edge, open "AI" settings, click "Dán API key", and confirm that no dropdown offers the saved login. If one appears, do not select it; report it. Chrome's "Suggest strong password" is noise, not a failure, but note it.
2. **Only if the Playwright result is `NOT VERIFIED`:** with a saved site password, open the modal and confirm that no key field is filled and no format error shows; click "Dán API key" and confirm the field is empty. Do not enter a real key for this check.

The orchestrator adds whichever items apply to `work/ming-todo.md`; the implementer and this plan do not.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/settings/AiSettingsModal.tsx` | Reveal control, input attributes, `:autofill` guard, reset on load/save/delete | The fix and the hardening | No |
| `src/features/settings/AiSettingsModal.test.tsx` | Regression and hardening tests; update helpers and affected existing tests | AC1, R8 | No |
| `src/App.test.tsx` | Line 808 only: wait for the "Dán API key" button instead of a password input | That test asserts a password input exists as soon as this modal opens, which is the behaviour being removed | No |

`form.ts` and `copy.ts` do **not** change. `form.ts` stays pure: the guard needs a DOM element, and the gating is modal state. The reveal button reuses `COPY.keyPlaceholder` ("Dán API key"), so no new copy is needed (R6).

## Tests to write
All in `src/features/settings/AiSettingsModal.test.tsx`. **Write test 1 first and run it against the unchanged modal.**

| Test (file › name) | Covers |
|---|---|
| 1. › "API key input is not a login password field" | **Regression; must fail before the fix.** Clicks the reveal button *if present* (so that on `main` it fails on the attribute, not on a missing button), then asserts `autocomplete="new-password"` and `name="ai-api-key"`. |
| 2. › "opening the modal renders no password input and no key error" | No `input[type=password]` and no `AI_ERRORS.invalid_key_format` until the user clicks reveal; the saved-key hint is still shown. |
| 3. › "saving a model change without revealing the field sends no apiKey" | The UAT leak path: `client.save` receives exactly `{ provider, model }`. |
| 4. › "a value the browser marks as autofilled is ignored" | After reveal, stub `matches(":autofill")` true and fire a change with a fake 25-character password: field returns to `""`, no error, Save stays disabled. |
| 5. › "Save refuses a field that became autofilled and sends nothing" | Type a valid key, then stub `:autofill` true, click Save: `client.save` not called, input removed, error shown, value absent from `document.body.innerHTML`. |
| 6. › "a typed key is trimmed and sent; clearing it keeps the saved key" | Empty and padded values: `  KEY  ` sends `KEY`; typing then clearing plus a model change sends no `apiKey`. |
| 7. › "the field collapses after a successful save and after delete" | Reveal state resets on every `initialForm` path. |
| 8. › "a browser without :autofill support can still enter a key" | `matches` throwing `SyntaxError` does not block typing or saving. |

Updates to existing tests:
- `type` helper: click the reveal button if present, then fire the change.
- Lines 41 and 114: wait for the reveal button instead of `keyInput()`.
- Lines 54 and 61: assert the input is absent (`keyInput()` is `null`) instead of `.value === ""`.
- Line 147 ("server_misconfigured hides the form"): **also assert the reveal button is absent**, otherwise this test would pass vacuously after the change.
- Stub with `vi.spyOn(el, "matches")`; never add a real credential to a fixture.

**Where checks run:** pnpm works only under WSL. Sync this worktree to a **native WSL copy** (on the Linux filesystem, not `/mnt/c`, excluding `node_modules`), run `pnpm install --frozen-lockfile` there, then run `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Re-sync before each run so the results describe the final diff. The red run uses the same copy: `pnpm exec vitest run src/features/settings/AiSettingsModal.test.tsx -t "API key input is not a login password field"`.

### One-off real-browser check (AC2)
Script and fixture live **outside the repo** in the session scratch area or the WSL temp directory. Playwright is not added to the repo (D42).

Hard limits: a **throwaway profile** from `mkdtemp`, deleted afterwards; a **fake** credential (`bug010@example.test` and a generated 25-character, no-space password, long enough to pass key validation and so exercise the leak path); a local origin only. **Never** use Ming's browser profile or saved passwords, the UAT Edge profile, production sign-in, or any real API key. Log booleans and lengths, never field values.

1. **Fixture:** a local Vite page on one `127.0.0.1` origin with (a) a login form, (b) a **control** page with the pre-fix markup (`type="password" autoComplete="off"`, no `name`), (c) the real `AiSettingsModal` with an in-memory fake client that records `save` payloads, importing `src/index.css`.
2. **Seed** the fake credential into the throwaway profile only: submit the login form, or write to that profile's own store (e.g. Linux Chromium with `--password-store=basic`). Time-box to 30 minutes. Playwright cannot click the native save bubble, so seeding may fail.
3. **Positive control (gate):** open the control page, perform a real click (Chrome can withhold the value until a user gesture), and require `matches(":autofill") === true`.
   - Control **did not fill**: record `AC2: NOT VERIFIED (autofill could not be reproduced in a throwaway profile)`. Do not claim a pass. AC2 falls to Ming after merge.
4. **Only if the control filled**, on the modal page:
   - On open: no password input, no format error.
   - Click reveal, wait 2 s, click elsewhere in the modal: `value.length === 0`, `matches(":autofill") === false`, no error.
   - Change the model and Save: the recorded payload has no `apiKey`.
5. **Regardless of the gate:** type a fake key after reveal and confirm it is accepted; check the reveal button and input at a 390px viewport in light and dark mode (R9).

## Approach
1. Add test 1, sync to WSL, record the red run.
2. In `AiSettingsModal.tsx`, add `keyEditing` state (default `false`) and an `inputRef`.
3. While `keyEditing` is false, render **no password input**. Render `<Btn type="button" onClick={...}>{COPY.keyPlaceholder}</Btn>` inside the `Field`. A browser cannot fill an input that does not exist, and no autofill mechanism clicks this button. `form.key` can therefore only be non-empty after an explicit user action.
4. On click, set `keyEditing` true and mount:
   ```tsx
   <input ref={keyRef} type="password" name="ai-api-key" autoComplete="new-password"
     autoFocus spellCheck={false} value={form.key} placeholder={COPY.keyPlaceholder}
     onChange={(e) => { if (isAutofilled(e.target)) return;
       setForm((f) => ({ ...f, key: e.target.value })); }} />
   ```
   Returning without a state update makes React restore the controlled value (`""`).
5. Add a module-level guard for the window after reveal:
   ```ts
   const isAutofilled = (el: HTMLInputElement | null) => {
     try { return !!el?.matches(":autofill"); } catch { return false; }
   };
   ```
6. At the start of the `save` body, if `isAutofilled(keyRef.current)`: clear `form.key`, set `keyEditing` false, show `aiErrorMessage("invalid_key_format")`, and return **without calling `client.save`**.
7. Set `keyEditing` false wherever `setForm(initialForm(view))` runs (`:46`, `:77`, `:97`). A failed save keeps the field and the typed key (existing test at `:118`).
8. Update the tests, run all checks in WSL, run the browser check, and record results in impl-log.

### Why this design
The primary guarantee rests on **DOM structure and an explicit click**, not on how a browser reports autofill:
- A `touched` flag set in `onChange` does not work. The UAT error itself proves autofill reached `onChange`, since `form.key` has no other writer.
- `isTrusted`, `inputType`, focus and key events are not a dependable signal for autofill, and Chrome may hold back a filled value until the first user gesture, so clicking the field could itself deliver it.
- Paste-only entry was rejected: mobile keyboards can insert clipboard text without a `paste` event, which would break R9.
- `:autofill` is only a **second layer** for the time after reveal. Safety before reveal does not depend on it.

**Residual risk (do not claim "impossible"):** after the user clicks reveal, a password-manager extension that fills without setting `:autofill` is indistinguishable from typed input. That needs an explicit click, a browser or extension ignoring `new-password`, and then a click on Save. The server cannot tell either, and server changes are out of scope.

Rules: R1 (no data-access change), R6 (reused copy), R7 (files listed above), R8 (tests above), R9 (browser check step 5). No High path.

## Specialist input used
From `consult-frontend-developer.md`:
- **Adopted R1 in part:** `type="password"`, `name="ai-api-key"`, `autoComplete="new-password"`, `spellCheck={false}`. Skipped `id`, `autoCorrect`, `autoCapitalize` (not needed: `Field` is a wrapping `<label>`, and password inputs get no autocorrect).
- **Rejected R2's mechanism, kept its goal:** `keyTouched` set in `onChange` is defeated by the production evidence above. Clearing the DOM value in an effect is racy.
- **Adopted R3 in part:** the attribute test. Replaced its "native setter with no event" test, because production autofill *did* reach `onChange`.
- **Overrode R4 (per the orchestrator's instruction):** no UAT Edge profile, no real sign-in; throwaway profile, fake credential, local page, with a positive control.
- **Option 2 (text input + CSS masking):** rejected, for the masking, keyboard and accessibility costs the consult lists.
- **Open questions:** Q1 include hardening: yes. Q2 third-party `data-*` attributes: skip (default). Q3 Ming's Edge profile: no.

## Assumptions
- The small UX change (one click on "Dán API key" before entering a key) is acceptable under the ticket's hardening scope. It keeps the "leave empty to keep the old key" contract.
- `src/App.test.tsx:808` is treated as a test of this modal; it is the only edit outside the modal's own files.
- Hotspots: no ticket on the board is `IN_PROGRESS`, `REVIEW` or `DONE`, so no rebase is expected. `src/App.test.tsx` is a commonly edited file, but the change is one line.
- The ticket lists Areas `ui, security`, so the `security-ai-generated-code-auditor` review trigger applies by area even though no listed path changes.
- Browser behaviour described here (Chrome withholding values, autofill event order) was not run during planning. The design does not depend on it, and the Playwright control tests the part that matters.

## Blocking questions
None

## Split proposal
None
