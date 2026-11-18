Status: READY

# Plan — F-703: Tag photos with AI during bulk import

## Feature summary
`docs/feature-list.md`, E7:
> #### F-703 · AI in bulk photo import · P1 · M3 · S · depends on F-701, F-603
> - A checkbox in the import modal; when on, each photo is tagged during import.

Related lines this plan relies on:
- F-702: "Fills empty fields only and never overwrites what the user typed".
- F-603: "The name comes from the file name, and a default location and status are chosen once for the batch."
  "Process sequentially with progress; failed files are listed with a retry option."
- `work/decisions.md` D48: "EXIF/GPS is removed by re-encoding every photo in the browser (`preparePhoto`) … Every
  upload path (editor, F-603 bulk import, F-702) must go through `preparePhoto`."
- D30 / D33: AI is API-only, bring-your-own-key per user, rate limits per user (`server/ai/rateLimit.js`:
  `tag: { max: 100, windowMs: 24 h }`; `server/ai/tagPhoto.js`: one tag call in flight per user, else
  `503 ai_busy`; a rejected call does not consume quota).
- Ticket scope: checkbox off by default in "Ảnh hàng loạt"; disabled with a "Cài đặt AI" link when AI is not
  configured (same rule as F-702); F-702 fill rule; a tagging failure never blocks the import; on `rate_limited`
  the rest of the batch continues without AI with a Vietnamese message; progress shows when a photo is tagged.

T-001 history: T-001 hid the mock checkbox behind `showMockAi`; T-025 (D44) then deleted it outright
(`aiTitle`/`aiHint` copy and the `<label className="check-row">` block are gone; `.check-row` CSS in
`src/index.css:813` is still there). The test `ImportModal.test.tsx › photos tab › Photos tab shows no AI checkbox`
is the only trace; this ticket replaces it.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The Photos tab shows an AI checkbox, off by default, when AI is ready. | `ImportModal.test.tsx › photos AI › ready: checkbox enabled, unchecked, shows the provider disclosure` |
| 2 | Not configured (no key / model unsupported): checkbox disabled with a "Mở cài đặt" link that opens Settings; server misconfigured: disabled with the server message; load error: disabled with "Thử lại"; no `ai` prop: no checkbox. | `ImportModal.test.tsx › photos AI › no key: disabled + settings link calls onOpenSettings`, `› model unsupported: disabled + link`, `› misconfigured: disabled, no link`, `› load error: retry reloads settings`, `› without ai prop there is no checkbox` (replaces the old "shows no AI checkbox" test) |
| 3 | With the checkbox on, each new item gets the AI suggestion for its empty fields (F-702 rule; ids → labels only through `suggestionToFields`/mappers); location and status keep the batch defaults. | `photoImport.test.ts › AI › fills empty fields from the suggestion and keeps batch location/status`, `› applyAiToBatchItem …` unit tests |
| 4 | With the checkbox off, no tag call is made. | `photoImport.test.ts › AI › no tag option: tag is never called and save gets no hook`; `ImportModal.test.tsx › photos AI › unchecked: importPhotos receives no tag` |
| 5 | Each photo is decoded once: the JPEG from `preparePhoto` inside `repo.save` is the one sent to the tagger and uploaded (D48 unchanged). | `repo.http.test.ts › save › withPrepared receives the prepared JPEG once and its result is the row that is PUT`; `› withPrepared is not called without a new photo`; code read: runner never calls `preparePhoto`/`resizeImage` |
| 6 | A tag error does not stop or fail the import: the item is created with the batch defaults and the row shows AI was skipped (Vietnamese). | `photoImport.test.ts › AI › tag error: item still saved without AI, job.ai = "skipped"`; `ImportPhotosTab.test.tsx › AI › skipped file shows "Không dùng được AI" and the reason` |
| 7 | `rate_limited` (AI daily limit) turns AI off for the rest of the batch; the import continues; a Vietnamese message says so. Settings-level errors do the same with their own message. A photo-upload `rate_limited` (ApiError) still stops the batch as before. | `photoImport.test.ts › AI › AI rate_limited: later photos are not tagged, all saved, aiStopped = "rate_limited"`, `› invalid_key turns AI off for the batch`, `› photo ApiError rate_limited still stops the batch`; `ImportPhotosTab.test.tsx › AI › shows the AI-off banner` |
| 8 | Each photo is tagged at most once per import: a 503 save retry and a "Thử lại" run reuse the stored suggestion; a retry never creates a duplicate item (same `itemId`). | `photoImport.test.ts › AI › 503 retry reuses the suggestion (tag called once)`, `› item PUT fails after tagging: retry run reuses the suggestion, same id`, `› photoFailed retry is not re-tagged` |
| 9 | Progress shows when a photo is being tagged. | `ImportPhotosTab.test.tsx › AI › shows "Đang nhờ AI xem ảnh k/N: name" while the tag call is pending` |
| 10 | 390px and dark mode. | Uses existing `.check-row`, `.ai-fill-note`, `.ai-fill-link`, `.csv-error`, `.photo-warning` classes only (no new CSS, or a minimal rule with dark tokens). One-off check in `pnpm dev` at 390px, light and dark, recorded in impl-log. |

## Ming verification after merge
- Import about 10 photos on a phone with AI on; the new items have category/colours/seasons/material/brand/tags
  filled and an AI name where the AI gave one; location and status are the batch defaults.
- With no AI key saved, the checkbox is disabled and "Mở cài đặt" opens Settings over the import modal.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/repo.ts` | Add `SaveOptions = { withPrepared?: (jpeg: Blob, item: Item) => Promise<Item> }`; `save(item, opts?: SaveOptions)`. | One decode for tag + upload (AC 5) |
| `src/data/repo.http.ts` | In `save`, after `prepare(...)` and only when `upload` is non-null and `opts?.withPrepared` is set: `item = await opts.withPrepared(upload, item)` before building the row. `id`, `upload` and photo handling keep using the values computed before the hook. | AC 3, 5 |
| `src/data/useWardrobe.ts` | `save(item, opts?)` forwards `opts` to `repo.save`; `importPhotos` unchanged otherwise. | Runner reaches the hook through `deps.save` |
| `src/data/photoImport.ts` | Optional AI step (see Approach): `PhotoImportOptions.tag?`, `onTagging?`; `PhotoJob.ai?`, `aiError?`, `aiFields?`; result `aiStopped?`; pure `applyAiToBatchItem`, `AI_BATCH_OFF` set. | AC 3, 4, 6, 7, 8 |
| `src/features/items/useAiLoad.ts` (new) | Extract the settings-load effect from `useAiFill` (`{ load, retry }` from `settings.get()`, reload on `rev`). | Editor and import modal use the same availability rule (ticket: "same rule as F-702") without duplicating the effect |
| `src/features/items/useAiFill.ts` | Use `useAiLoad`; no behaviour change. | Above |
| `src/features/import-export/usePhotoImport.ts` | Accept `tagger?: AiTagger \| null` (non-null only when ready); state `aiOn` (default false), `tagging` flag in `current`, `aiStopped`; `run` passes `tag` only when `aiOn && tagger`. | AC 1, 4, 9 |
| `src/features/import-export/ImportModal.tsx` | Optional prop `ai?: EditorAi`; `useAiLoad` + `aiAvailability(load, true)`; pass `tagger` to `usePhotoImport` only when `kind === "ready"`; pass availability + `onOpenSettings`/`retry` to the tab. | AC 1, 2 |
| `src/features/import-export/ImportPhotosTab.tsx` | Checkbox row (in the `editing` block, below the defaults), availability notes, tagging progress text, per-row AI label, summary AI lines and banner. | AC 1, 2, 6, 7, 9 |
| `src/features/import-export/copy.ts` | New `photos.ai` strings (below). | R6 |
| `src/App.tsx` | Pass `ai={{ settings: aiClient, tagger: aiTagger, settingsRev: aiSettingsRev, onOpenSettings: () => setSettingsOpen(true) }}` to `ImportModal`. | Wiring |
| `src/data/photoImport.test.ts` | New `describe("AI")` cases. | R8 |
| `src/data/repo.http.test.ts` | `withPrepared` cases. | R8 |
| `src/features/import-export/ImportModal.test.tsx` | Replace "shows no AI checkbox" with `describe("photos AI")`. | AC 1, 2, 4 |
| `src/features/import-export/ImportPhotosTab.test.tsx` | `describe("AI")` for progress, row labels, banner. | AC 6, 7, 9 |
| `src/index.css` | Only if needed: a small rule for the AI row label / disabled checkbox row, with dark-mode tokens. | AC 10 |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `photoImport.test.ts › applyAiToBatchItem › fills name/category/colors/seasons/material/brand/tags on a batch item` | Fill rule on a fresh batch item |
| `… › AI name replaces the file-name name; no AI name keeps the file name` | Name assumption A1 |
| `… › never touches location, status, price, size, notes, purchaseDate` | Batch defaults kept |
| `… › unknown ids are dropped; Vietnamese values NFC-trimmed (via suggestionToFields)` | Mappers only |
| `… › returns the count of filled keys (0 → "nothing")` | Row state |
| `photoImport.test.ts › AI › no tag option: tag is never called and save gets no hook` | AC 4 |
| `… › fills empty fields from the suggestion and keeps batch location/status` | AC 3 |
| `… › tag receives the prepared JPEG passed by save` (fake `save` that calls `opts.withPrepared(fakeJpeg, item)`) | AC 5 |
| `… › tag error (provider_unavailable): item saved without AI, ai = "skipped", aiError set, next photo still tagged` | AC 6 |
| `… › AI rate_limited: later photos get ai = "off" without a tag call, every item saved, aiStopped = "rate_limited"` | AC 7 |
| `… › invalid_key turns AI off for the batch (aiStopped = "invalid_key")` | AC 7 |
| `… › photo ApiError rate_limited still stops the batch (stopped.code) and is not mistaken for the AI one` | AC 7 |
| `… › 503 save retry reuses the suggestion (tag called once)` | AC 8 |
| `… › item PUT fails after tagging: second run reuses aiFields, same itemId, tag called once` | AC 8 |
| `… › photoFailed retry is not re-tagged and keeps the saved fields` | AC 8 |
| `… › "off" jobs are tagged on the next run` | AC 8 / A4 |
| `… › abort during tag: item is saved without AI, no "skipped" error shown` | Modal close mid-tag |
| `… › onTagging(i, true/false) brackets the tag call` | AC 9 |
| `repo.http.test.ts › save › withPrepared receives the prepared JPEG once and its result is the row that is PUT` | AC 5 |
| `… › withPrepared is not called without a new photo` | AC 5 |
| `… › withPrepared cannot change the id or the uploaded bytes` | D48 guarantee |
| `ImportModal.test.tsx › photos AI › without ai prop there is no checkbox` | AC 2 |
| `… › ready: checkbox enabled, unchecked, shows the provider disclosure` | AC 1 |
| `… › no key: disabled + settings link calls onOpenSettings` / `model unsupported` / `misconfigured` / `load error: retry reloads settings` | AC 2 |
| `… › checked: importPhotos receives a tag function; unchecked: no tag` | AC 4 |
| `… › settingsRev bump reloads availability` | Settings closed after saving a key |
| `ImportPhotosTab.test.tsx › AI › shows tagging progress while tag is pending` | AC 9 |
| `… › row labels: filled / nothing / skipped / off` | AC 6 |
| `… › skipped file lists its reason (aiErrorText)` | AC 6 |
| `… › shows the AI-off banner for rate_limited, and a settings link for a settings error` | AC 7 |
| `… › checkbox is hidden while running` | Batch setting fixed during a run |
| `Editor.test.tsx` (existing, unchanged) | `useAiLoad` extraction keeps editor behaviour |

## Approach
1. **One decode (AC 5, D48).** The runner does not prepare anything. `repo.save(item, { withPrepared })` prepares
   the photo exactly as today (R1, D48 untouched), then — only when there is a new photo and a hook — calls
   `withPrepared(jpeg, item)` and builds the item row from the returned item. The same `jpeg` Blob is then
   uploaded. So the tagger and the upload get the same EXIF-free JPEG, decoded once by the F-603.2 worker. The
   repo keeps `id` and `upload` from before the hook, so the hook can change only field values. Prepare failures
   (bad photo / HEIC) throw before the hook: no AI call is spent on a file that cannot be imported. If the hook
   throws, save rejects before anything is written (same as a prepare error); the runner's hook never throws.
2. **Runner AI step (`photoImport.ts`).** `PhotoImportOptions` gains `tag?: (jpeg: Blob, signal?: AbortSignal)
   => Promise<TagSuggestion>` and `onTagging?: (index: number, on: boolean) => void`. Per run, a local
   `aiOff: string | null`. For job `i` the runner passes `deps.save(item, { withPrepared })` when `opts.tag` is set
   (else `deps.save(item)` with no second argument). `withPrepared(jpeg, item)`:
   - job `state === "photoFailed"` → return `item` (it is the saved item with its fields).
   - job has `aiFields` → return `applyAiToBatchItem(item, aiFields).item` (reuse; no call).
   - job `ai` is `filled`/`nothing`/`skipped` without `aiFields` → return `item`.
   - `aiOff` set → patch `ai: "off"`, return `item`.
   - else `onTagging(i, true)`; `opts.tag(jpeg, signal)`; on success `fields = suggestionToFields(s)`,
     `{ item: next, filled } = applyAiToBatchItem(item, fields)`, patch `{ ai: filled ? "filled" : "nothing",
     aiFields: fields }`, return `next`. On error: if the signal aborted, return `item` unchanged; else `code =
     e instanceof AiSettingsError ? e.code : "internal"`, patch `{ ai: "skipped", aiError: code }`, and if
     `AI_BATCH_OFF.has(code)` set `aiOff = code`; return `item`. `finally onTagging(i, false)`.
   AI errors are `AiSettingsError`, never `ApiError`, so the existing stop logic (`apiError()` → photo
   `rate_limited` / `photo_quota_exceeded`) is unchanged. Result: `{ jobs, stopped?, aiStopped?: aiOff }`.
3. **"Empty" for a batch item (`applyAiToBatchItem(item, fields)`).** Calls F-702's `fillEmpty({ ...item, name: "" },
   fields, { categoryFillable: true })` and returns `{ item: { ...item, ...patch }, filled: keys(patch).length }`.
   A batch item is `blankItem()` + file-derived name + batch location/status, so: name (file-derived, A1),
   category (still the `blankItem()` default "Áo", the editor's `categoryFillable` rule for a new untouched item),
   colours, seasons, material, brand and tags are "empty". Location and status are not AI fields and keep the
   batch defaults. When the AI gives no usable name, the file name stays.
4. **Error mapping.** `AI_BATCH_OFF` = `rate_limited`, `provider_rate_limited`, `not_configured`,
   `key_unreadable`, `invalid_key`, `key_forbidden`, `invalid_model`, `model_unavailable`,
   `server_misconfigured`, `unauthorized`, `not_available` — each would fail (or burn quota on) every later photo.
   Everything else (`invalid_photo`, `request_timeout`, `provider_unavailable`, `provider_bad_response`,
   `ai_busy`, `network`, `internal`, `db_unavailable`, `payload_too_large`, unknown) skips AI for that photo only.
   No AI retries (`ai_busy` only happens if the user tags in another tab at the same time).
5. **Per-file states and copy** (`IMPORT_EXPORT_COPY.import.photos.ai`, Vietnamese, R6):
   - `title: "Dùng AI điền loại, màu, mùa…"`, `hint: "Chỉ điền các mục còn trống, bạn có thể sửa lại sau"`,
     `disclosure: (provider) => \`Ảnh sẽ được gửi tới ${provider} bằng key của bạn\``.
   - Availability notes reuse the editor's texts by calling the existing helpers: `no_key` →
     `EDITOR_COPY.ai.notConfigured` + "Mở cài đặt"; `model_unsupported` → `SETTINGS_COPY.unsupportedModel` + link;
     `misconfigured` → `aiErrorText("server_misconfigured")`; `load_error` → `EDITOR_COPY.ai.loadFailed` +
     "Thử lại"; `loading` → disabled, no note. (Copy lives in the import-export `copy.ts` for the new strings; the
     shared AI error texts stay where they are, as the editor does.)
   - `tagging: (k, n, name) => \`Đang nhờ AI xem ảnh ${k}/${n}: ${name}\`` (replaces the "Đang nhập" line while
     `onTagging` is on).
   - Row suffix after the existing state label: `filled: "AI đã điền"`, `nothing: "AI không có gì để điền"`,
     `skipped: "Không dùng được AI"`, `off: "Không dùng AI"`.
   - Summary: `summaryAi: (n) => \`AI đã điền: ${n}\``; per-file list of `skipped` jobs whose code is not in
     `AI_BATCH_OFF`: `${file.name}: ${aiErrorText(code)}`; banner when `aiStopped`:
     `rate_limited` → `"Đã hết lượt dùng AI trong 24 giờ — các ảnh còn lại vẫn được nhập nhưng không có AI."`;
     any other code → `\`${aiErrorText(code)} — các ảnh còn lại được nhập không có AI.\`` plus the settings link when
     `needsSettings(code)`.
6. **Tab / modal state when AI is not ready.** `ImportModal` loads settings with `useAiLoad(ai.settings,
   ai.settingsRev)` only when `ai` is given; `aiAvailability(load, true)`. The checkbox is rendered whenever `ai` is
   given, `disabled` unless `kind === "ready"`; `usePhotoImport` receives `tagger` only when ready, so a checked box
   with settings that became unusable (Settings closed after removing the key → `settingsRev` bump) sends no tag
   calls. The checkbox sits inside the `editing` block, so it is hidden during a run and the setting is fixed per
   run; a "Thử lại" run uses the current checkbox value. "Mở cài đặt" calls `ai.onOpenSettings`; App renders the
   Settings modal after the import modal, so it opens on top and the import state is kept.
7. `useAiLoad` extraction: move the `settings.get()` effect, `attempt` counter and `retry` out of `useAiFill`
   verbatim; `useAiFill` calls it. No behaviour change (existing Editor tests must stay green).
8. Rules: R1 (all data through `WardrobeRepo` / the AI client; no `fetch` in components), R3 (no new secret; the key
   stays server-side), R5 n/a, R6 (copy in `copy.ts`, ids → labels only via `suggestionToFields`/mappers), R7, R8
   (pure `applyAiToBatchItem` + runner + repo tested), R9 (AC 10). D48 kept by construction (step 1).
9. Checks: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`.

## Specialist input used
None (no consult files).

## Assumptions
- A1 (ticket's proposed default, not in `decisions.md`): an AI name replaces the file-derived name, because a file
  name is not something the user typed. When the AI returns no usable name the file name stays. Easy to flip in
  `applyAiToBatchItem`.
- A2: Category counts as "empty" for a batch item (it is the `blankItem()` default, as in the editor's
  `categoryFillable` rule for a new item).
- A3: `provider_rate_limited` turns AI off for the rest of the batch (each attempt consumes one of the 100 daily tag
  calls before the provider answers), same as `rate_limited`.
- A4: A file whose AI was turned off (`off`) and whose item then failed is tagged on the next "Thử lại" run; a file
  with a stored result or a per-photo AI error is not tagged again.
- A5: The checkbox is not remembered across modal openings (off by default every time, per the ticket).
- A6: `memoryRepo` in `src/test/` keeps its one-argument `save`; it is valid for the widened interface and is not
  touched.
- Hotspot: `src/App.tsx` (one prop added). No other open ticket is `IN_PROGRESS`/`REVIEW`/`DONE`.
- Size: about 200 changed production lines plus about 250 test lines; one implement/review cycle.

## Blocking questions
None

## Split proposal
None
