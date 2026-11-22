# Consult — frontend-developer — BUG-010 (2026-11-21)

## Findings

Current code: AiSettingsModal.tsx:163-170 renders `<input type="password" autoComplete="off" spellCheck={false}>` with no `name`/`id`. Chrome/Edge ignore `autocomplete="off"` on password fields and fill the saved login. The key field also sits in a modal with no username field, so the manager treats it as a lone "password" field and fills the site's saved credential.

Option comparison (from my knowledge of browser behaviour; I did not run browsers):

1. `type=password` + `autoComplete="new-password"` + distinct `name`.
   - Chrome and Edge honour `new-password` as a "do not fill saved credentials" hint and use it to offer password generation. In practice it prevents the fill in the large majority of cases, and it is the documented way to do it.
   - It is not guaranteed. Chrome may still show a "Suggest strong password" dropdown, and may still offer "Save password?" after submit. Here there is no `<form>` submit and the value goes via fetch from a button click, which makes the save prompt unlikely. Chrome's save-prompt heuristics also fire on a password field being removed from the DOM or on navigation after XHR, so the prompt is lower risk but not zero.
   - Edge has its own password-manager heuristics and has been seen to fill despite `new-password` in rare cases.
   - Keeps native masking, mobile password keyboard, and a paste-friendly input. Firefox honours `new-password` too (it will not fill, and may offer generation).
   - Smallest change, one attribute plus `name`.

2. `type=text` + `-webkit-text-security: disc`.
   - Not detected as a password field, so no credential fill and no save prompt. But a text input can still receive generic autofill, so it needs `autoComplete="off"` and a distinct `name`.
   - `-webkit-text-security` is supported in Chrome, Edge and Safari. Firefox has supported it only since about v129 (needs testing); older Firefox shows plain text, which is a secret-exposure risk on shoulder-surf.
   - It breaks `type=password` semantics. Screen readers treat it as plain text, mobile keyboards show autocorrect or suggestions or store the key in the keyboard dictionary unless `autocapitalize=off`, `autocorrect=off`, `spellcheck=false`, `inputMode="text"` are set. Copy from the field is allowed (not blocked as with a password field), which is a minor leak risk. It also needs Tailwind or CSS plus a dark-mode check (R9).
   - More surface than option 1 for a marginal gain. Reserve it as a fallback if option 1 fails the real-browser check.

3. Defensive handling (never save an untouched autofilled value).
   - Detect autofill with `input.matches(':autofill')` (also `:-webkit-autofill`) on mount and after load. jsdom cannot see this, so it is untestable in unit tests. Chrome also does not fire `change` or `input` reliably for autofill until user interaction, and may delay fill until the first interaction, so detection is racy.
   - Robust alternative: track user-typed input. Do not hold the key in controlled state from `value`. Instead only accept the key when it came from a real `onInput`/`onPaste` user event (`e.nativeEvent.isTrusted && e.nativeEvent.inputType` set). Chrome autofill fires an input event with no `inputType`, or with `insertReplacementText`. This is fragile and browser-specific.
   - Simplest defence in depth: on mount (and after `setForm(initialForm(...))`), clear any value that appears before the user has focused or typed (`useEffect` that sets form.key "" if the input's DOM value is non-empty and `touched` is false). Pair this with the save path: `save` sends `apiKey` only when the field is `touched`. That makes it impossible for an untouched autofill to be saved, whatever the browser does.
   - Cost: a small `touched` flag plus an effect. It is a guard, not a prevention, so the field could still visibly show the password.

## Recommendations

R1 (primary, meets the ticket): change the input to `type="password" name="ai-api-key" id` (unique, e.g. `ai-api-key`) `autoComplete="new-password"` `autoCorrect="off"` `autoCapitalize="none"` `spellCheck={false}`. Keep `type=password` (native masking, no Firefox gap). Also add `data-1p-ignore`, `data-lpignore="true"`, `data-bwignore` to deter third-party managers (harmless, optional; only if you want to cover 1Password/LastPass/Bitwarden, otherwise skip as out of ticket scope).

R2 (small hardening, inside the same file, the ticket's optional item): add a `keyTouched` state set true in `onChange` and reset in `initialForm` resets (load, save, delete). In `save`, send `apiKey` only when `keyTouched && key`. In the `useEffect` that runs after load, also clear `form.key` if the DOM value is non-empty and the user has not touched the field. Also hide the format error (`keyError`) until `keyTouched`, so an autofill never shows an error straight away. This guarantees the leak path (account password stored as AI key) is closed even if Chrome fills anyway. Because `canSave` lives in form.ts, keep the touched check in the modal's `save` and `err` computation to avoid touching form.ts and its tests, unless you prefer unit-testing it in form.ts (a pure function `effectiveKey(form, touched)`).

R3 (tests, jsdom): in AiSettingsModal.test.tsx add "API key input is not a login password field": assert `autocomplete="new-password"` and `name="ai-api-key"` (this fails on main, where autocomplete is `off` and name is absent). Add a second test for R2: set the input's value programmatically with no user event (e.g. `fireEvent.change` is a user event; use `input.value = ...` through the native setter, no event) and assert `save` does not include `apiKey` and no key error is shown. Typing (userEvent.type) then Save sends the trimmed key.

R4 (verification in a real browser, record in impl-log): use Playwright with a persistent Chromium (or Edge, `channel: "msedge"`) profile, because credential autofill is off in headless default profiles. Steps: (a) start with `pnpm dev` or the prod build, sign in, and let the browser save the password (accept the prompt manually in a headed run); (b) reopen the app, click the "AI" button, and check `await input.evaluate(el => ({ v: el.value, af: el.matches(':autofill') }))` returns empty and `false`, and that no error text shows; (c) click Save with no change: `Lưu` is disabled or sends no apiKey (inspect the request body); (d) also manually click into the field in Chrome desktop and Edge desktop and check no dropdown offers the saved login; (e) check Chrome on Android if possible, since password-manager behaviour differs. Compare before and after the fix to show the regression. Do it on the same Edge profile used in the UAT, since that is where the bug was seen.

Fallback if the check shows Chrome still fills with `new-password`: switch to option 2 (text + `-webkit-text-security: disc`, `autoComplete="off"`, `name="ai-api-key"`), then test Firefox and mobile. Do not start there.

## Risks

- `autocomplete="new-password"` is a hint, not a guarantee; Edge/Chrome heuristics can change between versions. R2 is the safety net that makes the credential-leak impossible, so do both.
- The Chrome "Suggest strong password" popup may appear on focus; not a leak, only noise. Accept or note in impl-log.
- R2 changes the "empty means keep the old key" contract only when the field is touched; check the hint text "Để trống nếu giữ key cũ" remains true. Make sure clearing the field after typing still means "keep" (send no apiKey).
- A user who pastes a key through autofill-like tools (password manager extensions filling a real key) would be treated as touched only if the input event fires; extension fills usually dispatch events, so the key is accepted. A fill with no events would be dropped, which is safe but should be mentioned in the hint.
- Scope: keep the diff in AiSettingsModal.tsx and its test (R7). If you want a pure helper in form.ts, that also needs form.test.ts updates (R8).

## Open questions

1. Is the optional hardening (R2) in scope for this ticket? The ticket lists it as optional inside the same file, so I recommend yes. Default: include it.
2. Do you want the third-party manager attributes (`data-1p-ignore`, `data-lpignore`, `data-bwignore`)? Default: skip; Ming only reports Chrome/Edge.
3. Can the real-browser check run headed on Ming's Edge profile (needs a saved password and a manual run), or should Playwright with a seeded persistent profile suffice? Default: Playwright headed, Edge channel, persistent profile.

Files: src/features/settings/AiSettingsModal.tsx (lines 162-171), work/tickets/BUG-010/ticket.md. I did not open form.ts, the tests or the UAT report, so the R2/R3 details (existing test helpers, `initialForm`) need a quick check by the implementer.
