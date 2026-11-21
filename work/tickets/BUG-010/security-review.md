# Security review — BUG-010

## Attempt 1 (2026-11-21, security-ai-generated-code-auditor)

**Verdict: no 🔴 blockers, 5 🟡 should-fix, 3 🟢 notes.** The reported leak is closed: no password input exists until the user clicks "Dán API key", so browser autofill on open cannot reach `form.key`, validation or the save payload.

**Limits of this review**
- I had read-only file tools and no shell, so I did **not** run `git diff origin/bug/BUG-010` or any checks. I reviewed the worktree's current files against the plan and impl-log. The orchestrator should confirm the diff covers only the 3 files the impl-log lists.
- Nothing was run in a browser. Statements about Chrome and extension behaviour come from my knowledge of them unless marked confirmed.

### Findings

#### 🟡 1. The typed key is copied into the input's `value` HTML attribute (CWE-200)
- **Where:** `AiSettingsModal.tsx:191` (`value={form.key}`).
- **Confirmed in code:** React 19.2.4 `updateInput` calls `setDefaultValue` for controlled inputs with no exemption for `type="password"` (`react-dom-client.production.js:1129-1130, 1190-1193`).
- **Risk:** the key is in `outerHTML` and readable by attribute selectors, extensions and any DOM serializer. After a failed save it stays there while the field is open. This goes beyond the live input value you asked me to check. The existing `innerHTML` assertions (test lines 93, 167) only run after the input has unmounted, so they cannot catch it.
- **Fix:** make the input uncontrolled. This is safe because every form reset also unmounts it.
```tsx
<input ref={keyRef} defaultValue="" /* other props unchanged, remove value */
  onChange={(e) => {
    if (isAutofilled(e.target)) { e.target.value = form.key; return; }
    const value = e.target.value;
    setForm((f) => ({ ...f, key: value }));
  }} />
```
- **Test:** after typing, assert `keyInput().getAttribute("value")` does not contain `KEY`.

#### 🟡 2. Password-manager extensions can still fill the field after reveal (CWE-522)
- **Where:** `AiSettingsModal.tsx:184-197`.
- **Risk:** extensions such as Bitwarden, 1Password and LastPass set the value and dispatch events without `:autofill`, and may ignore `new-password`. A password of 20+ printable characters then passes `keyError`, enables Save and is sent as `apiKey`. The field is masked, so the user cannot spot it. The plan accepts this residual risk, but a cheap mitigation exists.
- **Fix:** add `data-1p-ignore`, `data-lpignore="true"`, `data-bwignore` and `data-form-type="other"`. Vendor support is unverified, so this reduces the risk and does not remove it.
- I do not recommend an `isTrusted` check in this ticket: jsdom events are untrusted, so it would need a test seam.

#### 🟡 3. Removing the input after save may trigger Chrome's "Save/Update password?" prompt (CWE-522, unverified, medium confidence)
- **Where:** `AiSettingsModal.tsx:94-96`, new `setKeyEditing(false)` after a successful fetch.
- **Risk:** Chrome can treat "successful XHR, then password field disappears" as a login submission. If Ming accepts the prompt, the **API key replaces the saved account password**, and could later be filled into the sign-in form. The impl-log confirms Playwright cannot see native UI, and the plan's Ming check covers only the dropdown.
- **Fix:** add to `work/ming-todo.md`: "Enter a fake 25-character key, click Lưu, and confirm Chrome and Edge show no save/update password bubble. If one appears, dismiss it and report it." If it reproduces, use the plan's fallback (text input with CSS masking).

#### 🟡 4. A typed key survives a provider change and goes to the new provider (CWE-201)
- **Where:** `AiSettingsModal.tsx:153-157`.
- **Risk:** type a Claude key, switch to Gemini, Save: the key is stored under Gemini. "Kiểm tra" or AI use then sends it to Google in `x-goog-api-key`. The same applies to any wrongly filled value. This behaviour predates this ticket.
- **Fix:** set `key: ""` in that `setForm`, with a test. If the orchestrator treats this as outside R7, file it as a `debt` issue.

#### 🟡 5. Production may already hold an account password as the AI key (CWE-522, operational)
- **Where:** existing data from v0.2.6 to v0.3.1. The stored hint comes from `server/ai/mask.js:7-8`.
- **Risk:** this fix does not repair earlier saves. If a 20+ character password was saved, it may already have been sent to Claude or Gemini, and its last 4 characters are displayed as the hint.
- **Fix (Ming only, never share the value with an agent):** compare each saved `••••XXXX` hint with the end of the account password. On a match, delete the AI key, **change the account password in mmlabs Identity**, and enter a real key again. Removing the stored value alone is not enough.

#### 🟢 6. `:autofill` has no prefixed fallback
`AiSettingsModal.tsx:28-34`: older Chromium throws on `:autofill`, so the guard silently returns `false`. Also try `:-webkit-autofill`, each in its own try/catch.

#### 🟢 7. The `:autofill` state during the `input` event is unverified
`AiSettingsModal.tsx:194`: the positive control read `:autofill` after the fill, not inside the event. If the flag is set later, the value enters `form.key`, and the Save guard at `:82` is the backstop. If the user edits the field first, the flag may clear and the guard would pass. This needs a fill despite `new-password`, then an edit, then Save.

#### 🟢 8. The guard's error text is slightly misleading
`AiSettingsModal.tsx:85` reports "invalid format" for a refused autofill. It leaks nothing, but the user is not told why the field was cleared. A dedicated message could be a follow-up.

### Routes checked with no issue
- **Load, save, delete:** every `initialForm` reset is paired with `setKeyEditing(false)` (`:57-58, :95-96, :116-117`), and the guard path clears the key too (`:83-84`). I found no state where a hidden input holds a non-empty `form.key`.
- **Key test call:** `client.test()` sends `{}` and the server uses only the stored key (`aiSettings.ts:92`, `routes.js:80-87`). An unsaved or filled value cannot reach it.
- **Save payload:** `apiKey` is omitted when the trimmed key is empty (`:92`).
- **Refetch race:** `aiClient` is memoized (`App.tsx:45-48`), and retry only appears in the error state, when no input is mounted.
- **Logs and errors:** `src/` non-test code has no `console.*` calls or session-replay/telemetry SDKs. Server AI logs use fixed fields, `dbLogFields` allowlists 3 fields, and client errors carry only code and request ID. The Gemini key is sent in a header, not the URL.

### Follow-ups (out of scope)
- Findings 4 and 5 if not handled in this ticket: `debt` issue and Ming todo respectively.
- Findings 2 and 3 should be rechecked in real Chrome and Edge after merge.

### Files
- `src/features/settings/AiSettingsModal.tsx`
- `src/features/settings/AiSettingsModal.test.tsx`
- `server/ai/mask.js`
- `node_modules/.pnpm/react-dom@19.2.4_react@19.2.4/node_modules/react-dom/cjs/react-dom-client.production.js`
