Status: READY

# Plan — F-702: "✨ Tự điền từ ảnh" in the editor (real AI)

UI-only ticket (`Gate: none`, Areas `ui`). No server, migration or auth change: the endpoint, limits and error codes
already ship with F-701 / F-701.1. Text in the ticket that later decisions replaced is listed as **C1–C5**.
Non-blocking choices are assumptions **A1–A14**. Nothing blocks planning.

## Feature summary
- `docs/feature-list.md` E7, F-702:
  > "#### F-702 · "✨ Tự điền từ ảnh" in the editor · P1 · M3 · S · depends on F-701
  > - Fills empty fields only and never overwrites what the user typed; adds an undo option."
- Ticket goal: "The editor's "Tự điền từ ảnh" calls F-701 and fills only empty fields, never overwriting what Ming
  typed, with undo." Scope: "Fill empty fields only; one-tap undo; loading state; Vietnamese errors (incl. "chưa cài
  đặt AI" → link to Settings)."
- Ticket ACs: "Only empty fields are filled; existing input is never overwritten; undo restores the previous values." /
  "Without settings/key, the button explains how to set it up." / "390px and dark mode; tests pass."
- Ticket note 2026-11-14 (F-701), the contract this plan follows:
  > "the endpoint is `POST /api/ai/tag-photo`: raw JPEG body (`Content-Type: image/jpeg`, at most 2 MB), answer
  > `{ suggestion: { name, category, colors, seasons, material, brand, tags } }` with DB ids (`null`/`[]` when unknown;
  > map with `*_FROM_DB`; fill empty fields only). `resizeImage` before posting, debounce the button, show a disclosure
  > line near it (e.g. "Ảnh sẽ được gửi tới Claude bằng key của bạn"), and map `not_configured` to the Settings link."
  > Codes: `not_configured`, `invalid_key`, `key_forbidden`, `invalid_model`, `key_unreadable`, `rate_limited`
  > (100/24 h), `provider_rate_limited`, `provider_unavailable`, `provider_bad_response`, `invalid_photo`,
  > `unsupported_media_type`, `payload_too_large`, `request_timeout`, `ai_busy`, `server_misconfigured`, `db_unavailable`.
- Ticket note 2026-11-17: "Re-plan against `POST /api/ai/tag-photo` with the identity bearer token; providers Claude +
  Gemini."
- **D21** (2026-11-10): "AI supports **Claude and Gemini**. Each user picks provider, model and enters their own API key
  in Settings; the key is stored **encrypted server-side** …, never returned to the browser (masked hint only)".
- **D30** (2026-11-12, amends D21): "AI is available in **API mode only**".
- **D33** (2026-11-13): "`ai_settings` is one row per user, bring-your-own-key … AI rate limits per user."
- **D44** (2026-11-17): "The localStorage/demo-items mode is removed: the app always runs against the Node API with real
  data and Identity sign-in … Amends R1 and R10, and the local-mode / Figma Make preview clauses of D9, D21 and D30."
- F-701.1 plan A4 (approved): "the F-702 disclosure line should name the saved provider rather than "Claude"".
- `server/README.md:135` (shipped contract): "answers `{ suggestion: { name, category, colors, seasons, material, brand,
  tags } }`. Values are DB ids … anything unknown becomes `null` or `[]`, never `"other"`. It uses the provider, model
  and key saved in `ai_settings` … Limits: 100 calls per 24 h per user … 1 in flight per user … `ai_busy` (503,
  `Retry-After: 5`)."

### Text superseded by decisions (flag only; the orchestrator may update the ticket)
| # | Text says (where) | Plan does | Superseded by |
|---|---|---|---|
| C1 | "Replace the mock autofill in Supabase mode (T-001's `showMockAi`) with a call to `tag-item-photo`" (scope) | The mock is already gone (`src/App.test.tsx:58` asserts no "Tự điền từ ảnh" button). Add a real button that calls `POST /api/ai/tag-photo` | D23, D30, F-701 A6 |
| C2 | "Local mode / Figma Make preview unchanged (D9)" (scope) | Nothing to keep: there is no local mode or Figma Make (R1, R10 retired) | D44 |
| C3 | "AI exists in **Supabase mode only**" / "API mode only" (feature reference, note 2026-11-12) | The app is always in API mode; the AI section always renders when the editor has an AI client | D30, D44 |
| C4 | "key … used only by Edge Functions" (feature reference, D21 text) | The key stays on the Node server; the browser sends only the photo with the Identity bearer | D23, D30, D33 |
| C5 | Example disclosure "Ảnh sẽ được gửi tới Claude bằng key của bạn" (note 2026-11-14) | The line names the provider saved in Settings (Claude **or** Gemini) | D21, F-701.1 A4 |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Only empty fields are filled; existing input is never overwritten. | `src/features/items/aiFill.test.ts › fillEmpty …` (table per field: empty → filled; non-empty, whitespace-only, existing colours/seasons/tags → untouched; category only when fillable). `src/features/items/Editor.test.tsx › AI fill › fills only empty fields` (an item with name "Áo của tôi" and colour "Đen" keeps both; empty brand/material/seasons/tags get the suggestion; `update` is never called for name/colors). |
| 2 | Undo restores the previous values. | `aiFill.test.ts › undoFill …` (restores filled keys; keeps a field the user edited after the fill). `Editor.test.tsx › AI fill › "Hoàn tác" restores the previous values` (after fill, clicking "Hoàn tác" calls `update` with the old values and hides the undo button). |
| 3 | Without settings/key, the button explains how to set it up (incl. "chưa cài đặt AI" → link to Settings). | `aiFill.test.ts › aiAvailability` (`null` view, `hasKey:false` → `no_key`). `Editor.test.tsx › AI fill › no settings: button disabled, explains setup, "Mở cài đặt" calls onOpenSettings`; `› not_configured from the server shows the setup hint and the Settings link`. `src/App.test.tsx › AI fill › "Mở cài đặt" opens the AI settings modal over the editor, closing it reloads the settings`. |
| 4 | Calls F-701 correctly: resized JPEG, identity bearer, debounced, loading state, Vietnamese errors. | `src/data/aiTagging.test.ts` (POST `/api/ai/tag-photo`, `Content-Type: image/jpeg`, blob body, `redirect:"manual"`, `credentials:"same-origin"`, `cache:"no-store"`, bearer added and 401 retried through `createAuthedFetch`; every server code → `AiSettingsError` with that code; malformed 200 → `internal`). `Editor.test.tsx › AI fill › resizes the photo before posting` (`resizeImage` mocked; the tagger receives its blob), `› a second tap while pending sends nothing` (one `tag` call), `› shows the loading label and aria-busy`, `› each error code shows its Vietnamese message`. |
| 5 | The disclosure line names the configured provider (Claude or Gemini). | `Editor.test.tsx › AI fill › disclosure names Claude` / `› disclosure names Gemini` (text `Ảnh sẽ được gửi tới Claude bằng key của bạn` / `… Gemini …`); `› no request is possible while the provider is unknown` (settings load error → button disabled, retry shown). |
| 6 | 390px and dark mode. | Styles use only existing theme variables (`--muted`, `--danger`, `--surface`) and the existing `.ai-btn` / `.photo-column` rules, which already have 390px and coarse-pointer rules (`src/index.css:1931`, `:2670`, `:2753`); reviewer inspects the CSS diff. If the dev token proxy is available, `pnpm dev` at 390px in light and dark: the AI block wraps without horizontal scroll. Real-phone check is in *Ming verification*. |
| 7 | Tests pass; checks green; R1 holds. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. `git diff --stat main -- server/ db/` is empty. `grep -n "fetch(" src/features` finds no new call (data access only via `src/data/aiTagging.ts`). |

## Ming verification after merge
- After a release containing F-702 is deployed, on the phone (390px class), light and dark mode:
  1. With a **Claude** key saved: "Thêm món đồ" → take/pick a photo → the line under the button reads "Ảnh sẽ được gửi
     tới Claude bằng key của bạn" → tap "✨ Tự điền từ ảnh" → empty fields fill with Vietnamese values; a field typed
     before the tap is unchanged; "Hoàn tác" restores the form.
  2. Switch Settings to **Gemini** (M-27 key): the line names Gemini; repeat step 1 on an existing item that has a
     stored photo.
  3. "Xoá key" in Settings, reopen an item: the button is disabled, the hint explains setup, "Mở cài đặt" opens
     Settings on top of the editor.
- This is the only end-to-end check against the real providers; each tap spends one of the user's 100 daily calls and
  the user's own provider quota. Note D45: `pnpm dev` runs against production data, so a dev check also uses Ming's
  real key.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/aiTagging.ts` | create | `TagSuggestion` type (DB ids, as the server sends) and `createHttpAiTagger(fetchFn?, base = "/api", auth = {})` → `{ tag(image: Blob, signal?: AbortSignal): Promise<TagSuggestion> }`. The only place that calls the endpoint (R1: components never `fetch`). Errors are `AiSettingsError` (A6). Defensive parse of the 200 body. |
| `src/data/aiTagging.test.ts` | create | AC 4 (request shape, auth, error mapping, parse). |
| `src/features/items/aiFill.ts` | create | Pure logic: `suggestionToFields(s)` (ids → labels via `*_FROM_DB`), `fillEmpty(item, fields, {categoryFillable})` → `{patch, previous}`, `undoFill(item, record)` → patch, `aiAvailability(load, hasPhoto)`, `photoSourceFor(item, storedSrc)`, `aiErrorText(code, requestId)`. |
| `src/features/items/aiFill.test.ts` | create | AC 1, 2, 3, 5 (pure). |
| `src/features/items/useAiFill.ts` | create | Hook used by `Editor`: loads settings via `client.get()` on mount and when `settingsRev` changes; `run()` (in-flight guard, abort on unmount, stale-photo guard, `urlToBlob` → `resizeImage` → `tagger.tag`), `undo()`, state for the UI. Keeps `Editor.tsx` small. |
| `src/features/items/Editor.tsx` | modify | New optional prop `ai?: EditorAi` (A3); AI block in `.photo-column` under `.photo-source-actions` (button, disclosure, status/error, "Mở cài đặt", "Hoàn tác"); `categoryTouched` flag set by the category `<select>` `onChange` (A2). Nothing else in the form changes. |
| `src/features/items/Editor.test.tsx` | modify | New `describe("AI fill")` (AC 1–5). Existing tests unchanged (they omit `ai`). |
| `src/features/items/copy.ts` | modify | `EDITOR_COPY.ai`: button, loading label, disclosure template, setup hint, "Mở cài đặt", "Hoàn tác", filled/nothing-to-fill notices, no-photo hint, load-error + retry, editor overrides for `not_configured` and `rate_limited` (R6, A7). |
| `src/App.tsx` | modify | `aiTagger = useMemo(() => createHttpAiTagger(undefined, undefined, {getToken, onAuthLost}), [])`; `aiSettingsRev` state incremented when the Settings modal closes; pass `ai={{settings: aiClient, tagger: aiTagger, settingsRev, onOpenSettings: () => setSettingsOpen(true)}}` to `Editor`. Hotspot (A13). |
| `src/App.test.tsx` | modify | Replace `the editor has no mock AI button` (line 58) with `the editor shows the AI button` (fetch stub answers `/api/ai-settings` with a Claude view); add `"Mở cài đặt" opens the AI settings modal over the editor …` (AC 3). |
| `src/index.css` | modify | A few rules for the AI block (`.ai-fill`, `.ai-fill-note`, `.ai-fill-error`, `.ai-fill-actions`) next to the existing `.photo-column .ai-btn` rules; text colours matching `.photo-column` (light ink on the photo column, `#ffc9a3` for errors like `.remove-photo`); `width:100%` / wrapping under the existing 390px media block. |
| `work/tickets/F-702/impl-log.md` | create | Implementer log. |

**Not touched:** `server/**`, `db/**` (contract is fixed by F-701/F-701.1), `src/data/aiSettings.ts` (only its
`AiSettingsError` and `AiSettingsClient["get"]` are imported), `src/data/photos.ts` (`resizeImage`/`urlToBlob` reused
as is), `src/data/mappers.ts`, `src/shared/ai/**` (no new codes), `src/features/settings/**` (its `aiErrorMessage` and
`SETTINGS_COPY.providerOptions` are imported, not edited), `src/features/auth/**` (High path), `package.json`,
`work/backlog.md` (D16), `work/decisions.md`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `aiTagging.test.ts › posts the blob to /api/ai/tag-photo` | Exactly one fetch: url `/api/ai/tag-photo`, `method:"POST"`, headers include `Content-Type: image/jpeg` and `Accept: application/json`, `body` is the same `Blob`, `redirect:"manual"`, `credentials:"same-origin"`, `cache:"no-store"`, the caller's `signal` passed through. |
| `aiTagging.test.ts › returns the suggestion` | 200 `{suggestion:{name:"Áo sơ mi trắng", category:"top", colors:["trang"], seasons:["summer"], material:null, brand:null, tags:["đi làm"]}}` → that object. |
| `aiTagging.test.ts › malformed 200 → internal` | Body not JSON; `{}`; `{suggestion:null}`; `{suggestion:[]}`; `colors` not an array → `AiSettingsError` code `internal`. Wrong-typed single fields (e.g. `name: 5`, `tags:[1,"x"]`) are normalised (`null` / non-strings dropped), not thrown. |
| `aiTagging.test.ts › server error codes` | One case per code from the ticket note (409 `not_configured`, 422 `invalid_key`, 422 `key_forbidden`, 400 `invalid_model`, 409 `key_unreadable`, 429 `rate_limited`, 429 `provider_rate_limited`, 502 `provider_unavailable`, 502 `provider_bad_response`, 400 `invalid_photo`, 415 `unsupported_media_type`, 413 `payload_too_large`, 408 `request_timeout`, 503 `ai_busy`, 503 `server_misconfigured`, 503 `db_unavailable`) → `AiSettingsError` with `status` and `code`; unknown code → `internal`; `requestId` kept for 500 `internal`. |
| `aiTagging.test.ts › auth` | With `getToken`: `Authorization: Bearer t1`; a 401 is retried once with the refreshed token (same body); 401 twice → `onAuthLost` called and `AiSettingsError(401, "unauthorized")`. Network rejection → `network`. An aborted signal rejects with the abort error, not `network` (so the hook can ignore it). |
| `aiFill.test.ts › suggestionToFields` | `top` → "Áo", `ao_dai` → "Áo dài", `null` / unknown / retired `bag` → no category; colours `["trang","xyz","trang"]` → `["Trắng"]` (unknown dropped, deduped); seasons `["winter"]` → `["Đông"]`; strings trimmed, `""` → absent; name over `NAME_MAX` (120 code points) → absent, a 120-code-point Vietnamese name with diacritics kept; NFC (decomposed "Áo" → precomposed); tags: trimmed, empty dropped, tags containing `,` dropped (the editor joins tags with ", "), deduped; prototype keys (`__proto__`, `constructor`) in the ids are not mapped (own-property lookup). |
| `aiFill.test.ts › fillEmpty` | Per field: `name` filled only when `name.trim()===""` (whitespace-only counts as empty); `brand`/`material` the same; `colors`/`seasons`/`tags` only when the array is empty; `category` only when `categoryFillable` is true; a field with no suggestion is never in the patch; `previous` holds exactly the old values of the patched keys; `status`, `size`, `location`, `price`, `purchaseDate`, `notes`, `photo` never appear in the patch; nothing to fill → empty patch. |
| `aiFill.test.ts › undoFill` | Restores every patched key whose current value still equals the filled value (arrays compared by elements); a key the user edited after the fill is left alone; returns an empty patch when everything was edited. |
| `aiFill.test.ts › aiAvailability` | `loading` → `loading`; load error `server_misconfigured` → `misconfigured`; other load error → `load_error`; view `null` or `hasKey:false` → `no_key`; `modelSupported:false` → `model_unsupported`; ready + no photo → `no_photo`; ready + photo → `ready` with the provider. Order: misconfigured / load error / no key win over no photo (the setup hint shows even without a photo). |
| `aiFill.test.ts › photoSourceFor` | `data:` and `blob:` photos → themselves; `/api/photos/<uuid>` → the loaded `blob:` URL from `usePhotoUrl`, or `null` while pending / failed; `""` → `null`. |
| `aiFill.test.ts › aiErrorText` | `not_configured` and `rate_limited` use the editor copy; every other code falls back to `aiErrorMessage` (settings copy); `internal` with a requestId appends "(mã …)". `needsSettings(code)` is true for `not_configured`, `key_unreadable`, `invalid_key`, `key_forbidden`, `invalid_model`, `model_unavailable` only (A5). |
| `Editor.test.tsx › AI fill › disclosure names Claude` / `› … Gemini` | Fake `settings.get` resolves a Claude / Gemini view with a key; a data: photo; the line `Ảnh sẽ được gửi tới Claude bằng key của bạn` (resp. Gemini) is shown and the button is enabled. |
| `Editor.test.tsx › AI fill › no settings: button disabled, explains setup, "Mở cài đặt" calls onOpenSettings` | `get` → `null`; button disabled; setup hint visible; clicking "Mở cài đặt" calls `onOpenSettings` once; `tag` never called. Same for `hasKey:false`. |
| `Editor.test.tsx › AI fill › no photo` | Key set, `photo:""`: button disabled, hint "Thêm ảnh …" visible. |
| `Editor.test.tsx › AI fill › resizes the photo before posting` | `vi.mock("@/data/photos")`: `urlToBlob` receives the data: URL, `resizeImage` its blob, `tag` the resized blob. |
| `Editor.test.tsx › AI fill › fills only empty fields` | Item `{name:"Áo của tôi", colors:["Đen"], …}`, `isNew:false`; suggestion with name, category, colours, seasons, brand, material, tags → `update` called for seasons, brand, material, tags only; never for name, colors or category. |
| `Editor.test.tsx › AI fill › new item: category filled unless the user picked one` | Blank item: category set from the suggestion; after a change on the category select, a later fill leaves category alone. |
| `Editor.test.tsx › AI fill › "Hoàn tác" restores the previous values` | After a fill, "Hoàn tác" calls `update` with the previous values and disappears. |
| `Editor.test.tsx › AI fill › a second tap while pending sends nothing` | `tag` held pending; two clicks → one call; button shows the loading label with `aria-busy="true"` and is disabled. |
| `Editor.test.tsx › AI fill › each error code shows its Vietnamese message` | `tag` rejects with `AiSettingsError` for `not_configured` (setup hint + "Mở cài đặt"), `invalid_key` ("Mở cài đặt" shown), `ai_busy`, `provider_unavailable`, `network` (no settings link) → the expected copy in a `role="alert"` element; the form is untouched. |
| `Editor.test.tsx › AI fill › nothing to fill` | All target fields already filled → notice "AI không có gì để điền thêm" (exact copy in `EDITOR_COPY.ai`), no undo button. |
| `Editor.test.tsx › AI fill › result for a replaced photo is ignored` | Photo changes (re-render with another data: URL) while `tag` is pending → when it resolves, `update` is not called for any field. |
| `Editor.test.tsx › AI fill › unmount aborts the request` | Unmount while pending → the signal given to `tag` is aborted; no state update warning. |
| `Editor.test.tsx › AI fill › settings load error` | `get` rejects (`network`) → button disabled, message + "Thử lại"; "Thử lại" calls `get` again; on success the button is enabled. `server_misconfigured` → message only, no retry, no settings link. |
| `Editor.test.tsx › AI fill › settingsRev change reloads settings` | Re-render with a higher `settingsRev` → `get` called again. |
| `App.test.tsx › the editor shows the AI button` | Replaces line 58: with a fetch stub for `/api/ai-settings` (`{settings: <Claude view>}`), opening a card shows "Tự điền từ ảnh". |
| `App.test.tsx › "Mở cài đặt" opens the AI settings modal over the editor; closing it reloads the settings` | Stub answers `{settings:null}` first; click "Mở cài đặt" → "Cài đặt AI" visible and the editor stays mounted; close settings → `/api/ai-settings` fetched again. |

## Approach
1. **Client (`src/data/aiTagging.ts`).** Mirror `src/data/aiSettings.ts`: `createAuthedFetch({fetchFn, ...auth})`;
   `tag(image, signal)` posts `image` as the body with `Content-Type: image/jpeg`, `Accept: application/json`,
   `cache:"no-store"`, `credentials:"same-origin"`, `redirect:"manual"`, `signal`. `catch`: abort → rethrow as is;
   `ApiError` 401 → `AiSettingsError(401,"unauthorized")`; else `AiSettingsError(0,"network")`. Non-2xx → code via
   `isServerErrorCode`, `requestId` kept. 2xx → `parseSuggestion(json)`: `suggestion` must be a plain object, else
   `internal`; read the 7 fields with own-property checks; strings or `null`; arrays filtered to strings. The server is
   trusted for ids, but the browser re-checks types (cheap, keeps `aiFill.ts` total).
2. **Pure logic (`src/features/items/aiFill.ts`).** Functions as listed in *Tests to write*. `fillEmpty` works on
   labels (output of `suggestionToFields`) and returns `{patch, previous}` so undo needs no extra state. Lookups into
   `CATEGORY_FROM_DB` / `COLOR_FROM_DB` / `SEASON_FROM_DB` use `Object.prototype.hasOwnProperty.call` (R6: labels only
   via `src/data/mappers.ts`). Never writes "Loại khác" for an unknown category (F-701 A8).
3. **Hook (`useAiFill.ts`).** State: `load` (`"loading"` | view | `{code}`), `busy`, `notice` (`filled n` /
   `nothing`), `error` (`{code, requestId}`), `record` (last fill for undo). `run()`:
   - return if `busyRef.current` (debounce: a ref, as `savingRef` in `App.tsx:81`) or availability is not `ready`;
   - `photoAtStart = item.photo`; `ctl = new AbortController()` (aborted on unmount);
   - `blob = await urlToBlob(src)`; `{blob: jpeg} = await resizeImage(blob)`; `s = await tagger.tag(jpeg, ctl.signal)`;
   - if unmounted or `latestItem.photo !== photoAtStart` → drop silently;
   - `fields = suggestionToFields(s)`; `{patch, previous} = fillEmpty(latestItem, fields, {categoryFillable})`;
     apply each key through `update`; set `record` (or `notice:"nothing"` when the patch is empty);
   - errors: `AiSettingsError` → `error`; `resizeImage`/`urlToBlob` failure → `invalid_photo`; abort → ignored.
   `latestItem` is read from a ref updated every render, so typing during the request is respected (filling happens
   against the form as it is when the answer arrives). `undo()` applies `undoFill(latestItem, record)` and clears
   `record`. A new photo or a new fill clears `record`.
4. **Editor UI.** In `.photo-column` after `.photo-source-actions` (only when `ai` is passed):
   - `<Btn className="ai-btn" aria-busy={busy} disabled={state !== "ready" || busy}>` with `<Icon name="sparkle" />`
     and "Tự điền từ ảnh" / "Đang phân tích ảnh…";
   - `ready`: `<small className="ai-fill-note">` "Ảnh sẽ được gửi tới {SETTINGS_COPY.providerOptions[provider]} bằng key
     của bạn";
   - `no_key` / `model_unsupported` / settings-fixable errors: hint + `<button type="button">Mở cài đặt</button>` →
     `ai.onOpenSettings()`;
   - errors in `role="alert"`, notices in `role="status"`, "Hoàn tác" as a button while `record` exists.
   - `categoryTouched`: `useState(false)`, set in the category select's `onChange`. `categoryFillable = isNew &&
     !categoryTouched && item.category === blankItem().category` (A2).
5. **App wiring.** One tagger per mounted App (same pattern and comment as `aiClient`, `App.tsx:40-44`).
   `aiSettingsRev` increments in the Settings modal's `onClose`. The Settings modal already renders after the editor in
   the tree, so it stacks on top, and `Modal`'s stack makes Escape close only the top one (`Modal.tsx:3-28`).
6. **CSS.** Additive rules only; reuse `.photo-column .ai-btn` and the 390px block (`index.css:2670`); dark mode needs no
   extra rule if only theme variables / the photo-column ink colours are used. Check both themes in `pnpm dev` if the
   dev proxy is available.
7. **Rules.**
   - R1: the only network call is in `src/data/aiTagging.ts` through `createAuthedFetch` (bearer, 401 retry); the editor
     never calls `fetch`. No local/demo branch (D44). `urlToBlob` on `data:`/`blob:` is allowed by the CSP
     (`connect-src … blob: data:`, T-022).
   - R2: no schema change. R3: nothing secret reaches the browser; the key never leaves the server; only the resized
     photo is sent, to our own `/api`. R4 (as amended by D27/D34): the photo goes only to `/api/ai/tag-photo` and, from
     there, to the provider named in the disclosure. R5: nothing derived stored.
   - R6: all copy in `EDITOR_COPY.ai` (provider names from `SETTINGS_COPY.providerOptions`); ids ↔ labels only via
     `mappers.ts`. R7: follow-ups go to `impl-log.md`. R8: every new pure function has unit tests. R9: 390px + dark
     (AC 6). R10: retired.

## Specialist input used
None (no `consult-*.md` for F-702). Inputs taken from approved plans instead: F-701 A5 (disclosure, `resizeImage`,
debounce, `not_configured` → Settings), F-701 A8 (unknown → `null`/`[]`, never "other"), F-701.1 A4 (name the saved
provider).

## Assumptions
- **A1 (what "empty" means).** Strings (`name`, `brand`, `material`) are empty when `trim()` is `""`; arrays (`colors`,
  `seasons`, `tags`) when they have no elements. `status`, `size`, `location`, `price`, `purchaseDate`, `notes`,
  `photo` are never touched (the server does not suggest them).
- **A2 (category).** The category `<select>` always holds a value (blank items start at "Áo", `blankItem.ts:7`), so it
  is never literally empty. Default: category is filled only for a **new** item whose category is still the blank
  default and was not changed in the select during this editor session; existing items never get their category
  replaced. Edge accepted: a duplicate of an "Áo" item (`App.tsx:195-207`, same Editor instance) counts as fillable;
  undo covers it. Alternative (never fill category) is a one-line change if Ming prefers.
- **A3 (`ai` prop optional).** `Editor` renders the AI block only when `ai` is passed. `App` always passes it, so every
  real editor has the button; the optional prop keeps the existing Editor tests unchanged. It is not a mode switch.
- **A4 (provider must be known before sending).** The button stays disabled until `GET /api/ai-settings` has answered
  with a view that has a key and a supported model, so the disclosure always names the real provider (C5). A failed
  load shows a retry instead of sending blind. Settings are loaded once per editor open (one small GET) and again after
  the Settings modal closes (`settingsRev`).
- **A5 (Settings link for more than `not_configured`).** The ticket requires it for `not_configured`; the plan also shows
  it for `key_unreadable`, `invalid_key`, `key_forbidden`, `invalid_model`, `model_unavailable`, where Settings is the
  only fix. Same link, no new screen.
- **A6 (error type).** The tagger throws the existing `AiSettingsError` (status + `AiErrorCode`) instead of a new class,
  so `aiErrorMessage` and `isServerErrorCode` are reused without touching `src/shared/ai`. Renaming it to a neutral name
  is a follow-up, not in this diff.
- **A7 (copy).** Proposed Vietnamese strings (final wording in `EDITOR_COPY.ai`): button "✨ Tự điền từ ảnh" (icon
  `sparkle` + text "Tự điền từ ảnh"), loading "Đang phân tích ảnh…", disclosure "Ảnh sẽ được gửi tới {provider} bằng
  key của bạn", setup hint "Chưa cài đặt AI — chọn nhà cung cấp và nhập API key trong Cài đặt", link "Mở cài đặt",
  no photo "Thêm ảnh để dùng tự điền", filled "Đã điền {n} mục", nothing "AI không có gì để điền thêm", undo "Hoàn tác",
  load error "Không tải được cài đặt AI" + "Thử lại". Overrides: `not_configured` → the setup hint (the Settings copy
  says "lưu key trước khi kiểm tra", which fits only the Settings modal); `rate_limited` → "Đã hết lượt dùng AI, thử lại
  sau" (the shared copy says "sau ít phút", wrong for a 24 h window). All other codes use `aiErrorMessage`.
- **A8 (resize).** Always `resizeImage` (1200 px, JPEG 0.82, ~150–300 KB), also for stored photos, which come from the
  photo loader as a `blob:` URL (`usePhotoUrl`, D34). The button is disabled while a stored photo is still loading or
  failed to load. No HEIC handling here (F-202.1).
- **A9 (concurrency).** One request per editor at a time (ref guard + disabled button). Server `ai_busy` (1 in flight per
  user) shows its message; no automatic retry.
- **A10 (stale answers).** An answer is dropped if the editor closed or the photo changed while it was pending; the
  request is aborted on unmount (the server aborts the provider call on client disconnect, F-701).
- **A11 (quota and data use).** Each tap spends one of the user's 100 calls per 24 h and their own provider quota; the
  disclosure line is the only notice. F-701.1 A4 noted that Google may use free-tier Gemini inputs; a data-use notice is
  **not** added here (not in the feature list or ticket). The implementer lists it as a follow-up in `impl-log.md` so
  the orchestrator can raise a `debt` issue or a decision for Ming.
- **A12 (size).** About 330 production lines (`aiTagging.ts` ~70, `aiFill.ts` ~100, `useAiFill.ts` ~90, `Editor.tsx`
  ~45, `copy.ts` ~25, `App.tsx` ~10, CSS ~25) and ~450 test lines. Above the ~400-line guide only because of tests (as
  in F-701/F-701.1); one implement/review cycle, no split.
- **A13 (hotspots, rule 7).** `src/App.tsx` is edited (props to `Editor`, one memo, one state). Open tickets: T-019
  (IN_PROGRESS, umbrella, holds only its plan) and T-026 (DONE; plan states no `src/App.tsx` change). No open ticket
  edits `Editor.tsx`, `copy.ts`, `index.css` or `App.test.tsx`; F-202.1 / F-603 (BACKLOG) will later touch the editor
  photo area and may rebase.
- **A14 (dev check).** `pnpm dev` uses the dev token proxy against production data (D45); a real tap there spends Ming's
  key. The reviewer relies on the unit tests; real-provider checks are Ming's (above).

## Blocking questions
None.

## Split proposal
None.
