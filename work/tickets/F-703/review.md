Verdict: PASS

## Attempt 1 — 2026-11-18

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exit 0, no errors
- format:check: "All matched files use the correct format." exit 0
- test: Test Files 119 passed | 11 skipped (130); Tests 1531 passed | 221 skipped (1752), exit 0 (matches impl-log)
- build: `✓ built`, exit 0

### Acceptance criteria
- [x] 1. AI checkbox in the Photos tab, off by default when ready — evidence: `ImportModal.test.tsx › photos AI › ready: checkbox enabled, unchecked, shows the provider disclosure` (green); `usePhotoImport.ts` `useState(false)` for `aiOn`; screenshot ready-light/dark.
- [x] 2. Not configured / model unsupported / misconfigured / load error / no `ai` prop — evidence: `photos AI › no key: disabled + settings link calls onOpenSettings`, `› model unsupported`, `› misconfigured: disabled, no link`, `› load error: retry reloads settings`, `› settingsRev bump reloads availability`, `› without ai prop there is no checkbox` (replaces the old "shows no AI checkbox" test); screenshot nokey-light/dark (disabled box + "Mở cài đặt").
- [x] 3. Suggestion fills empty fields via the F-702 rule; location/status keep the batch defaults — evidence: `photoImport.ts` `applyAiToBatchItem` calls `fillEmpty(..., { categoryFillable: true })` and `suggestionToFields` (mappers only); tests `applyAiToBatchItem › fills …`, `› never touches location, status, price, size, notes, purchaseDate`, `› unknown ids are dropped …`, `runPhotoImport AI › fills empty fields from the suggestion and keeps batch location/status`.
- [x] 4. Checkbox off → no tag call — evidence: runner calls `deps.save(item)` with no second argument when `opts.tag` is absent (`photoImport.ts` save call); `usePhotoImport.ts` spreads `tag` only when `aiOn && tagger`; `ImportModal.tsx` passes `tagger` only when `availability.kind === "ready"`; tests `runPhotoImport AI › no tag option: tag is never called and save gets no hook`, `photos AI › unchecked: importPhotos receives no tag`.
- [x] 5. One decode; D48 unchanged — evidence: `repo.http.ts save`: `id` and `upload` (from `prepare(...)`) are `const`s computed before `withPrepared`; the hook only replaces `item` used for the row; the same `upload` Blob is PUT to `/photo`; the hook runs only when `upload` is non-null. Runner never calls `preparePhoto`/`resizeImage` (grep). Tests `repo.http.test.ts › withPrepared receives the prepared JPEG once …`, `› withPrepared is not called without a new photo`, `› withPrepared cannot change the id or the uploaded bytes`; `runPhotoImport AI › tag receives the prepared JPEG passed by save`.
- [x] 6. Tag error does not stop or fail the import; row shows AI skipped in Vietnamese — evidence: `withPrepared` catches every error and returns the item unchanged; tests `› tag error (provider_unavailable): … next photo still tagged`, `› a non-AI error from the tagger counts as internal …`, `ImportPhotosTab AI › skipped file lists its reason (aiErrorText)`, `› row labels`.
- [x] 7. AI `rate_limited` / settings errors turn AI off for the rest of the batch; photo-upload `rate_limited` stop unchanged — evidence: AI errors are `AiSettingsError`, swallowed in the hook, never reach the `apiError()` stop path; `AI_BATCH_OFF` set; tests `› AI rate_limited: later photos get ai = "off" without a tag call, every item saved, aiStopped set`, `› invalid_key turns AI off …`, `› photo ApiError rate_limited still stops the batch and is not mistaken for the AI one`, `ImportPhotosTab AI › shows the AI-off banner …`; screenshot finished-*-done (banner "Đã hết lượt dùng AI trong 24 giờ …").
- [x] 8. Each photo tagged at most once per attempt; retries never duplicate — evidence: hook reuses `job.aiFields`, returns early for `filled`/`nothing`/`skipped`/`photoFailed`; job `itemId` reused by `itemFor`; tests `› 503 save retry reuses the suggestion (tag called once)`, `› item PUT fails after tagging: second run reuses aiFields, same itemId, tag called once`, `› photoFailed retry is not re-tagged and keeps the saved fields`, `› "off" jobs are tagged on the next run` (A4).
- [x] 9. Progress while tagging — evidence: `ImportPhotosTab AI › shows tagging progress while tag is pending`, `› onTagging(i, true/false) brackets the tag call`; screenshot progress-*-running ("Đang nhờ AI xem ảnh 1/2: IMG_2031").
- [x] 10. 390px and dark mode — evidence: reviewer re-ran the Playwright harness (copy in `scratchpad/rv-f703/`) at 390×844 light and dark against `pnpm dev`. `pageScrollW` 390 in every state (no horizontal scroll). Running: progress y 403–433; done: summary 393–561, banner 470–506; footer top 771 — everything that matters during and after the run is above the footer with `scrollTop` 0. Ready/no-key: the AI row (checkbox, hint, disclosure or "Mở cài đặt") is fully visible above the footer even with 5 files selected. Dark tokens correct (green-ink title, border, csv-error text on the summary card).
- `useAiLoad` extraction: effect, `attempt` counter and `retry` moved verbatim (`useAiLoad.ts`); `useAiFill` returns the same shape; Editor tests unchanged (no diff in `src/features/items/Editor*`) and green.

### Ming verification after merge
- Import about 10 photos on a phone with AI on; new items have category/colours/seasons/material/brand/tags filled and an AI name where the AI gave one; location and status are the batch defaults.
- With no AI key saved, the checkbox is disabled and "Mở cài đặt" opens Settings over the import modal.

### Scope
All changed files are in the plan's file list; `src/index.css` is the plan's "only if needed" file (`.check-row` alignment; the class is used only in `ImportPhotosTab.tsx`, so no other screen is affected). `ticket.md` is the workflow state change.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: all data through `WardrobeRepo.save` and the existing AI client; no `fetch` in components. R3: no new secret; the key stays server-side. R4/D48: every upload still goes through `prepare` in `repo.http.ts`; the hook cannot change `id` or uploaded bytes. R6: new copy only in `import-export/copy.ts`; shared AI texts reused through `aiErrorText`/`EDITOR_COPY`/`SETTINGS_COPY`; ids → labels only via `suggestionToFields`. R8: pure logic (`applyAiToBatchItem`, runner AI step, repo hook) unit-tested. R9: see AC 10.

### Nits (do not block)
- `ImportPhotosTab.tsx`: two import statements from `@/data/photoImport` (`exceedsDailyLimit, PHOTO_DAILY_LIMIT` and `AI_BATCH_OFF`); could be one.
- `ImportModal.tsx` loads AI settings on every modal open, even when the user only uses the CSV/JSON tabs (one extra GET).
- impl-log says 11 `photos AI` cases; there are 10. Harmless.
- `photoImport.ts`: the `...(aiOff ? { aiStopped: aiOff as string } : {})` spread is repeated three times; a small helper would read better.

### Follow-ups (out of scope)
- Per-row AI state could show live for the current file (implementer's note).
- A1 (AI name replaces the file name) is an assumption not recorded in `decisions.md`; consider recording it.
- Edit phase with 5 files: `.import-content` measures 175–862 (taller than the 844 viewport, `scrollHeight == clientHeight`), so the end of the file list sits under the footer. The impl-log says this was already the case before this ticket; the reviewer did not check it on `main`. Worth a separate ticket to make the content area scroll.
