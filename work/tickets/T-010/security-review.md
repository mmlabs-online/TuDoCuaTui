# Security review — T-010

## Attempt 1 — 2026-11-13 (security-ai-generated-code-auditor, read-only)

**Verdict:** no 🔴. The key goes only into the PUT body; never in browser storage, never logged, never shown back, cleared after save. Local mode never calls the API; no `VITE_*` secret (R3). Two low-severity 🟡; neither blocks PASS. Code and tests read only; nothing run.

### Findings

**🟡 1. The typed key is written into the page's HTML while the user types** — `src/features/settings/AiSettingsModal.tsx:163-170`: controlled password input (`value={form.key}`); React mirrors the value into the `value="…"` attribute, readable by extensions / DOM observers / CSS attribute selectors during typing (low risk today, no injection path). The test at `AiSettingsModal.test.tsx:55` checks only after save. Fix (optional): uncontrolled field via `ref`, read on Save, `ref.current.value = ""` after success; keep only "empty / format valid" in state for `canSave` / `keyError`. Otherwise follow-up (R7).

**🟡 2. `autoComplete="off"` does not stop password managers on a password field** — `AiSettingsModal.tsx:165`. Chrome/Safari/managers ignore `off` on `type="password"`; they may offer to save the API key as the site password or autofill the Access/Identity password. Fix: `autoComplete="new-password"`, optionally `data-1p-ignore` and `data-lpignore="true"`; clear on close if uncontrolled.

**🟢 3. Never in browser storage, never logged** — no `localStorage`/`sessionStorage`/`console.` in `src/data/aiSettings.ts` or `src/features/settings/*`; `aiSettings.test.ts:99-108` spies on `Storage.prototype.setItem`; `AiSettingsError` (`aiSettings.ts:6-15`) carries status, code, requestId only.

**🟢 4. Kept in memory only as long as needed** — reset after save (`AiSettingsModal.tsx:76-77`) and delete (`:96-97`); dropped on modal unmount (`App.tsx:251-252`); kept after a failed save on purpose (test `:115`); no closure/cache/module variable; `httpAiSettings` (`aiSettings.ts:105`) is stateless.

**🟢 5. Never shown back** — only `saved.keyHint` (`AiSettingsModal.tsx:173`, `copy.ts:13`), masked server-side (`server/ai/routes.js:29`); tests `AiSettingsModal.test.tsx:55`, `:62`.

**🟢 6. Request settings correct** (`aiSettings.ts:38-48`) — relative same-origin URL, key only in the PUT body when non-empty (`:81`); `credentials: "same-origin"`, `cache: "no-store"`, `redirect: "manual"` → redirect mapped to `unauthorized` (`:52`); `Content-Type` only with a body; test sends exactly `{}`; covered `aiSettings.test.ts:34-66`.

**🟢 7. Raw server text never reaches the screen** — allowlisted codes only (`isServerErrorCode`, `shared/ai/errors.ts:37-39`); everything else → `internal` (`aiSettings.ts:53-74`); messages from a fixed table (`copy.ts:34-65`); only `requestId` shown, escaped. Nit: could cap/check requestId format.

**🟢 8. Local mode makes no AI calls (R1)** — button only when `wardrobe.mode === "api"` (`App.tsx:101`), modal guarded (`App.tsx:251`), `Header.tsx:37-41`; `localAiSettings` rejects without fetching (`aiSettings.ts:95-103`, test `:111-125`). App always passes `httpAiSettings`; the `api` check makes that safe.

**🟢 9. R3** — only `VITE_APP_VERSION`, `DEV`, `PROD`; `src/shared/ai/boundary.test.ts` still guards `AI_KEK`, `ai_settings`, `service_role`, `VITE_SUPABASE`; new files use `ai-settings`.

**🟢 10. No name, no form** — no `name`/`id`, not inside a `<form>`; `spellCheck={false}` set.

### Recommendations
- Apply 🟡1 and 🟡2 in this ticket (a few lines each) or list them as follow-ups. Optional test: no `value` attribute while typing.

### Risks
- T-019.7: keep the Identity bearer in the header built in `createHttpAiSettings`, never the URL; re-check `redirect: "manual"` → `unauthorized`.
- T-019.3 (D33): server must never return another user's `keyHint`.

### Open questions
- Should password-manager save prompts be suppressed deliberately (🟡2)?
