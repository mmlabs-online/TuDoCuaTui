Status: READY

# Plan — T-010: Settings screen: AI provider, API key and model

Replaces the 2026-11-12 BLOCKED plan. Its questions Q1–Q3 were answered "ok" (ticket notes 2026-11-12), the
backend shipped as T-018 + T-018.2 (MERGED, PRs #42, #45), and this ticket is now **UI only: no file under `server/`,
`db/` or `src/shared/ai/` changes.**

## Feature summary
Ticket goal: "Ming opens Settings, picks Claude or Gemini, pastes an API key, picks a model and tests it — all in the app."

Ticket scope:
- "A Settings entry (header/account area) visible in Supabase mode only." (read as **API mode only**, D30)
- "Provider select (Claude / Gemini), model select filtered by provider (from T-009's allowlist), key field
  (write-only, `type="password"`, shows only the masked hint once saved), Save / Delete key / Test buttons."
- "Vietnamese copy in the feature's copy file (R6); 390px and dark mode (R9)."
- Out of scope: "Server storage (T-009), tagging (F-701), editor autofill (F-702)."

`work/decisions.md`:
- D21: "Each user picks provider, model and enters their own API key in Settings; the key is stored **encrypted
  server-side** … never returned to the browser (masked hint only)".
- D30 (amends D21): "AI is available in **API mode only**; local mode and the Figma Make preview are unchanged. …
  KEK … unset: AI routes answer 503 `server_misconfigured` … Rate limits are in memory (save 30/h, test 20/h)."
- D31: "TuDo signs in with mmlabs Identity … Cloudflare Access stays until Identity sign-in and owner scoping are
  verified in production (M-21)". Today `/api` is behind Access; T-019.7 will add the bearer later.
- D33: "`ai_settings` is one row per user, bring-your-own-key … AI rate limits per user." Ticket note 2026-11-13:
  "the UI contract stays `{settings}`".

Ticket notes (2026-11-12): "REST `/api/ai-settings` (GET/PUT), `/key` (DELETE), `/test` (POST, T-018.2);
`{settings: AiSettingsView|null}`. Generic `/api` codes (`invalid_json`, `unsupported_media_type`,
`forbidden_origin`, `db_unavailable`) are in `AI_ERROR_STATUS`. An expired Access session shows up as a
redirect/network error on fetch, not a 401: show 'đăng nhập lại'."

Backend contract as merged (read from `server/api.js`, `server/ai/routes.js`, `server/ai/validate.js`,
`server/ai/store.js`):
| Call | Body | 200 response | Notable errors |
|---|---|---|---|
| `GET /api/ai-settings` | — | `{settings: AiSettingsView \| null}` | `server_misconfigured` 503, `db_unavailable` 503 |
| `PUT /api/ai-settings` | exactly `{provider, model, apiKey?}` (unknown keys → `bad_request`) | `{settings: AiSettingsView}` | `invalid_provider`, `invalid_model`, `invalid_key_format`, `key_required` (provider changed while a key is saved and no new key sent), `rate_limited` 429 |
| `DELETE /api/ai-settings/key` | — | `{settings: AiSettingsView \| null}` (idempotent) | as GET |
| `POST /api/ai-settings/test` | exactly `{}` | `{ok: true}` | `not_configured` 409, `key_unreadable` 409, `invalid_key` 422, `key_forbidden` 422, `model_unavailable` 422, `provider_rate_limited` 429, `provider_unavailable` 502, `invalid_model` 400, `rate_limited` 429 |

Writes are rejected with `forbidden_origin` when `Sec-Fetch-Site` is cross-site/same-site; JSON bodies need
`Content-Type: application/json`. Errors are `{error: {code, requestId?}}`. `AiSettingsView` is
`{provider, model, keyHint ("••••abcd" | null), hasKey, modelSupported, updatedAt}` (`src/shared/ai/catalog.ts`).
Note: `AI_ERROR_STATUS` lives in `src/shared/ai/errors.ts` (not `src/data/errors.ts`, which does not exist).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Saving shows the masked key; reloading never shows the full key | `AiSettingsModal.test.tsx` › "save shows the masked hint and empties the key field" and › "a fresh mount shows only the hint" (fake client returns `keyHint: "••••wxyz"`; the typed key string appears nowhere in `document.body.innerHTML` after save or after remount). `aiSettings.test.ts` › "save sends apiKey only when given" and › "never stores the key" (no `localStorage`/`sessionStorage` writes). Code read: the key lives only in component state, input is `type="password"`, `autoComplete="off"`. |
| 2 | Changing provider changes the model list; invalid combinations cannot be saved | `form.test.ts` (pure): `modelsFor`, `nextModelOnProviderChange`, `canSave` cases (Gemini has no models → cannot save; model not in the provider's allowlist → cannot save; malformed key → cannot save; provider changed while a key is saved and key empty → cannot save). Modal test › "Gemini is listed but disabled (sắp có)" and › "Save is disabled for an invalid combination". |
| 3 | Clear Vietnamese errors (invalid key, test failed, network); key field cleared after save | `copy.test.ts` › "every AiErrorCode has a non-empty Vietnamese message" (iterates `AI_ERROR_STATUS` keys + `AI_CLIENT_ERROR_CODES`). `aiSettings.test.ts` › fetch throws → `network`; `opaqueredirect` → `unauthorized`; non-JSON or unknown code → `internal`; `{error:{code:"invalid_key"}}` 422 → `invalid_key`. Modal tests › "test failure shows 'Kiểm tra thất bại' + the invalid_key message", › "network error shows the network message", › "invalid_key_format on save keeps the field and shows the message", plus AC 1's "key field cleared after save". |
| 4 | Hidden in local mode; works at 390px and in dark mode; tests pass | `App.test.tsx` › "local mode has no settings button" and › "API mode shows the settings button and opens the AI settings modal" (stubbed `fetch` answering `/api/ai-settings` with `{settings:null}`). 390px/dark: reviewer checks the modal uses only the existing `.modal`, `.modal-header`, `.field`, `.modal-footer`, `Btn` classes and CSS variables (no hard-coded colours, no fixed widths over 390px). Checks green: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
On the deployed app (API mode, behind Cloudflare Access, `TUDOCUATUI_AI_KEK` set per T-018.2/M-16):
1. Phone at ~390px, light and dark: open Settings from the header, the modal fits without horizontal scroll.
2. Save a real Claude key + model → the field empties and shows `••••` + last 4; reload → still only the hint.
3. Press "Kiểm tra" → success message; replace with a wrong key → "Key không hợp lệ…" message.
4. "Xoá key" → hint disappears; Test then shows the "chưa có key" message.
Note: after T-019.3 (D33) a key saved now is cleared and must be entered again (T-018.2 plan, accepted cost).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/aiSettings.ts` | create: `AiSettingsClient` interface (`get`, `save`, `deleteKey`, `test`), `createHttpAiSettings(fetchFn?, base?)`, `localAiSettings` stub (every call rejects with `not_available`), `AiSettingsError {status, code: AiErrorCode, requestId?}` | R1: components never call `fetch`; one client per mode |
| `src/data/aiSettings.test.ts` | create | R8 |
| `src/features/settings/form.ts` | create: pure helpers `modelsFor(provider)`, `nextModelOnProviderChange(provider, current)`, `initialForm(view \| null)`, `canSave(form, saved)`, `isDirty(form, saved)`, `canTest(form, saved)`, `keyError(raw)` | Pure logic first (planner rule 6, R8) |
| `src/features/settings/form.test.ts` | create | R8 |
| `src/features/settings/copy.ts` | create: `SETTINGS_COPY` (title, labels, buttons, hints, success texts) and `errors: Record<AiErrorCode, string>`, `aiErrorMessage(code, requestId?)` | R6: one copy file per feature |
| `src/features/settings/copy.test.ts` | create | R8, AC 3 |
| `src/features/settings/AiSettingsModal.tsx` | create: the screen, takes `client: AiSettingsClient` and `onClose` | the screen |
| `src/features/settings/AiSettingsModal.test.tsx` | create | AC 1–3 |
| `src/features/layout/Header.tsx` | modify: optional `onSettings?: () => void`; render an `icon-btn` with `aria-label={SETTINGS_COPY.open}` only when given | entry point |
| `src/components/Icon.tsx` | modify: add a `settings` (gear) path | entry icon |
| `src/App.tsx` | modify: `settingsOpen` state; pass `onSettings` to `Header` only when `wardrobe.mode === "api"`; render `<AiSettingsModal client={httpAiSettings} …>` when open (~8 lines) | wiring, R1 hidden in local mode |
| `src/App.test.tsx` | modify: two tests (AC 4) | AC 4 |
| `src/index.css` | modify **only if needed**: a few `.ai-settings-*` rules using existing CSS variables (status line, key hint) | R9 |

No changes to `server/**`, `db/**`, `src/shared/ai/**` (parity with `server/ai/*.js`), `src/data/repo*.ts`,
`.env.example`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `aiSettings.test.ts` › get returns `settings` (view and `null`) | contract |
| › save sends `PUT /api/ai-settings` with `{provider, model}` and adds `apiKey` only when non-empty; `Content-Type: application/json`, `redirect: "manual"`, `credentials: "same-origin"`, `cache: "no-store"` | contract, R3 |
| › deleteKey sends `DELETE /api/ai-settings/key`; test sends `POST /api/ai-settings/test` with body exactly `"{}"` | contract (strict `{}`) |
| › fetch throws → `AiSettingsError` code `network`, status 0 | AC 3 |
| › `res.type === "opaqueredirect"` → code `unauthorized` | expired Access session (ticket note) |
| › error JSON `{error:{code:"invalid_key"}}` 422 → `invalid_key`; `{error:{code:"internal",requestId:"r1"}}` → requestId kept | AC 3 |
| › unknown code (e.g. `conflict`, `not_found`), non-JSON body or 200 without `settings` → `internal` | T-018 review note: generic DB codes not in `AI_ERROR_STATUS` |
| › never writes `localStorage`/`sessionStorage` (spy) | R3 |
| › `localAiSettings` rejects every call with `not_available` and never calls fetch | R1 |
| `form.test.ts` › `modelsFor("claude")` = 3 ids; `modelsFor("gemini")` = [] | AC 2 |
| › `nextModelOnProviderChange` keeps the model if allowed, else `defaultModelOf` (null for Gemini) | AC 2 |
| › `initialForm(null)` = Claude + default model; `initialForm(view)` keeps saved values; `modelSupported:false` view → default model | AC 2 |
| › `canSave` false: no model, model not allowed, key fails `validateApiKeyFormat`, provider differs from saved while `saved.hasKey` and key empty, nothing changed and key empty; true otherwise | AC 2 |
| › `keyError`: empty → none; `"  sk-ant-…(20+ chars)  "` → none (trimmed); 19 chars, inner space, non-ASCII (`"khóa…"` with Vietnamese diacritics) → `invalid_key_format` | edge cases |
| › `canTest` true only when `saved.hasKey` and form not dirty | Test uses the saved key |
| `copy.test.ts` › every key of `AI_ERROR_STATUS` and every `AI_CLIENT_ERROR_CODES` entry has a non-empty message; `aiErrorMessage("internal","r1")` contains `r1`; unknown code → generic message | AC 3, R6 |
| › no message contains `AI_KEK` or `ai_settings` | R3 boundary test stays green |
| `AiSettingsModal.test.tsx` › loading, then empty state with Claude + default model when `settings:null` | load |
| › save shows the masked hint and empties the key field; typed key not in the DOM | AC 1, AC 3 |
| › a fresh mount with a saved view shows only the hint (placeholder/hint text), key input empty | AC 1 |
| › Gemini option disabled with "(sắp có)"; Save disabled for invalid combination | AC 2 |
| › Test success message; Test disabled while form dirty; test failure shows "Kiểm tra thất bại" + `invalid_key` message | AC 3 |
| › network error on load shows message + "Thử lại" which re-calls `get` | AC 3 |
| › `invalid_key_format` from the server keeps the typed key and shows the message | AC 3 |
| › Delete key: asks for confirmation, calls `deleteKey`, hint disappears | scope |
| › `server_misconfigured` on load shows the "chưa cấu hình" message and hides the form | D30 |
| › `modelSupported:false` shows a "model không còn hỗ trợ, chọn model khác" note | contract |
| `App.test.tsx` › local mode has no settings button | AC 4, R1 |
| › API mode shows the settings button and opens the AI settings modal | AC 4 |

## Approach
1. **Client (`src/data/aiSettings.ts`).** Mirror `repo.http.ts`'s `call()` (headers, `redirect: "manual"`,
   `credentials: "same-origin"`, `cache: "no-store"`), but throw `AiSettingsError` with an `AiErrorCode` from
   `src/shared/ai/errors.ts`: thrown fetch → `network`; `opaqueredirect` → `unauthorized`; `isServerErrorCode(code)`
   → that code; anything else → `internal`. Validate the 200 shape (`"settings" in json`; `ok === true` for test).
   Export a module-level `httpAiSettings = createHttpAiSettings()`. The key is only in the PUT body; nothing is cached
   or stored. Do not import `ApiError`/`API_ERROR_COPY`: AI copy stays in the settings feature (R6).
   Do not write the string `ai_settings` (underscore) or `AI_KEK` anywhere in `src/` non-test code: the R3 boundary
   test (`src/shared/ai/boundary.test.ts`) fails on them. URL paths use `ai-settings` (hyphen), which is fine.
2. **Pure form helpers (`form.ts`)** built on `AI_MODELS`, `defaultModelOf`, `isAllowedModel`,
   `validateApiKeyFormat` from `src/shared/ai`. Form = `{provider, model, key}`; `saved` = `AiSettingsView | null`.
3. **Copy (`copy.ts`).** `errors` typed `Record<AiErrorCode, string>` so typecheck forces completeness. Required
   wording (others at implementer's discretion, same tone as `API_ERROR_COPY`):
   - `invalid_key`: "Key không hợp lệ hoặc đã bị thu hồi"
   - `invalid_key_format`: "Key không đúng định dạng (20–256 ký tự, không có khoảng trắng)"
   - `network`: "Không kết nối được máy chủ — kiểm tra mạng hoặc tải lại trang để đăng nhập lại"
   - `unauthorized`: "Phiên truy cập đã hết hạn — tải lại trang để đăng nhập lại"
   - `key_required`: "Đổi nhà cung cấp thì cần nhập key mới"
   - `not_configured`: "Chưa có key — lưu key trước khi kiểm tra"
   - `key_unreadable`: "Không đọc được key đã lưu — hãy nhập lại key"
   - `server_misconfigured`: "AI chưa được cấu hình trên máy chủ"
   - `rate_limited`: "Thao tác quá nhiều lần, thử lại sau ít phút"
   - `not_available`: "Tính năng AI chỉ có khi dùng máy chủ"
   - `internal`: "Lỗi máy chủ" (+ " (mã {requestId})" when present)
   - test prefix "Kiểm tra thất bại: ", success "Key hoạt động", saved "Đã lưu cài đặt AI", deleted "Đã xoá key".
   - Labels: title "Cài đặt AI", eyebrow "CÀI ĐẶT", "Nhà cung cấp", "Model", "API key", Gemini option
     "Gemini (sắp có)", key hint "Đã lưu: {hint}. Để trống nếu giữ key cũ.", buttons "Lưu", "Kiểm tra", "Xoá key",
     open button aria-label "Cài đặt".
4. **Modal (`AiSettingsModal.tsx`).** Uses `Modal`, `.modal-header` (as `ExportModal`), `Field`, native `select`
   and `input`, `Btn`, and `Confirm` with custom `title/body/confirmLabel` for delete. On mount: `client.get()`.
   States: loading (Skeleton or text), error (message + "Thử lại"), form. Provider select lists both providers;
   options with no models are `disabled`. Model select from `modelsFor(provider)`. Key input `type="password"`,
   `autoComplete="off"`, `spellCheck={false}`, inline `keyError` via `Field error`. Save → `client.save` (key
   trimmed, omitted when empty) → set `saved`, reset form from it, `setKey("")`, show saved status. Test enabled by
   `canTest` → `client.test()` → status line (`role="status"` for success, `role="alert"` for errors). One in-flight
   action at a time (buttons disabled while busy). Messages render inside the modal (the toast sits behind the
   backdrop). Key state is dropped on unmount.
5. **Entry (`Header.tsx`, `Icon.tsx`, `App.tsx`).** Gear `icon-btn` next to the theme toggle (visible on mobile,
   unlike `.desktop-btn`), rendered only when `onSettings` is passed; App passes it only in API mode (R1: local mode
   and Figma Make preview unchanged; no AI fetch in local mode).
6. **Tests** as listed; run Checks.

Rules: R1 (client module + local stub, entry hidden in local mode), R3 (key only in the PUT body, never read back,
never stored, cleared after save; boundary test stays green), R6 (all copy in `src/features/settings/copy.ts`), R7
(no server changes), R8 (pure logic tested), R9 (existing responsive modal classes, CSS variables only), R10 (no
Figma Make files).

## Specialist input used
No `consult-*.md` in this ticket folder. Adopted from T-018's `consult-software-architect.md`: R-3 (endpoint contract,
`503 server_misconfigured` → "AI chưa được cấu hình trên máy chủ") and the Access-expiry note ("T-010 should map that
to 'đăng nhập lại', not 'lỗi mạng'"). Adopted from T-018 `review.md`: codes outside `AI_ERROR_STATUS` (`conflict`,
`not_found`, `invalid_input`) are shown as `internal`.

## Assumptions
- **A1 — Gemini disabled.** `AI_MODELS.gemini` is empty, so Gemini is shown as a disabled option "Gemini (sắp có)"
  rather than hidden. It becomes selectable automatically when models are added to the catalog.
- **A2 — Test uses the saved key only.** The server's `/test` takes exactly `{}` (no key in the body), so Test is
  enabled only when a key is saved and the form has no unsaved changes; the UI says "Lưu trước khi kiểm tra" otherwise.
- **A3 — Entry point.** A gear icon in the header (there is no account menu yet). T-019.7 may move it into an account
  menu; not this ticket.
- **A4 — No dev escape hatch.** `pnpm dev` runs in local mode (`detectMode` with `dev=true`), so the modal cannot be
  opened by hand locally; behaviour is verified by component tests with a fake client, and 390px/dark on the device
  by Ming after merge. A dev override is a follow-up (T-018.2 review note), not this ticket.
- **A5 — Auth today vs later.** Requests rely on the Cloudflare Access cookie (`credentials: "same-origin"`). When
  T-019.7 adds the Identity bearer it will add the header in one place (`createHttpAiSettings`); D33's per-user
  storage (T-019.3) does not change this UI contract.
- **A6 — Delete key keeps provider/model.** "Xoá key" calls `DELETE /api/ai-settings/key` only; provider/model
  remain saved (the server's behaviour).
- **A7 — Hotspots.** `src/App.tsx` (already 252 lines; this adds ~8) and `src/features/layout/Header.tsx` are also
  planned for edits by T-019.7 (sign-in/out) and T-019.10 (BACKLOG under in-progress umbrella T-019). Whichever lands
  second rebases.
- **A8 — Size.** Estimated ~350–400 changed lines including tests, within one cycle; no split.

## Blocking questions
None.

## Split proposal
None.
