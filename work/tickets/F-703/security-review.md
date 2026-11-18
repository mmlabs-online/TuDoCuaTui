# Security review — F-703

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-18

**Overall result: PASS. No 🔴 blockers; 3 🟡 non-blocking notes.** The auditor read the files on disk and did not
run the tests.

### Findings
**D48: the AI only gets the prepared JPEG.** Met.
- `src/data/repo.http.ts:84-88`: `withPrepared` runs only when there is an `upload`, and `upload` is always
  `(await prepare(...)).blob`; the original `File` or data URL never reaches the hook.
- `src/data/photoPrep.ts:79-106`: `prepareWith` always re-renders through `deps.render` (canvas encode), so the
  output carries no EXIF/GPS, even for a small JPEG.
- `src/data/photoImport.ts:155` sends that same `jpeg` to `opts.tag`; `src/features/import-export/usePhotoImport.ts:80`
  passes it to `tagger.tag` unchanged.

**The hook cannot change the item id, owner or uploaded bytes.** Met.
- `repo.http.ts:82`: `id` is fixed before the hook; the item PUT (line 90) and the photo PUT (line 97) both use it.
- `upload` is a `const` Blob computed before the hook (Blobs are immutable). The photo-removal branch (line 98)
  runs only when `upload` is null, which is exactly when the hook is not called.
- The client never sends an owner: the server sets `user_id` from the session and guards the upsert with
  `where items.user_id = excluded.user_id` (`server/items.js:94-103`).
- Covered by `src/data/repo.http.test.ts:556-568`.

**R1: data access only through WardrobeRepo and the existing AI client.** Met. No new `fetch`; saves go through
`useWardrobe.save` → `repo.save` (`src/data/useWardrobe.ts:77-79`); tagging uses the existing `createHttpAiTagger`
(`/api/ai/tag-photo`, authenticated fetch), created once at `src/App.tsx:46-49`; settings loading uses the
existing `AiSettingsClient.get`, now in `src/features/items/useAiLoad.ts`.

**AI values only reach the item through the allowed-id mappers; no HTML rendering of AI text.** Met.
- `photoImport.ts:155` always runs `suggestionToFields` (`src/features/items/aiFill.ts:34-53`), which maps
  category, colours and seasons only through `own(CATEGORY_FROM_DB/COLOR_FROM_DB/SEASON_FROM_DB, id)` (unknown ids
  and prototype keys ignored), trims free text and checks the name against `NAME_MAX`.
- `applyAiToBatchItem` (`photoImport.ts:54-57`) patches only `FillKey` fields; location, status, id and photo are
  untouched. The server caps AI text length (`server/ai/tagging.js:8-10`).
- No `dangerouslySetInnerHTML` in `features/import-export`; error text comes from `aiErrorText(code)`, with `code`
  on the server allow-list or `internal`/`network` (`src/data/aiTagging.ts:82-85`).

**No request storm against the AI limits.** Met.
- Photos are tagged sequentially, each awaited before the next save (`photoImport.ts:170-179`).
- At most one tag per photo per attempt, including inside the 503 retry loop: stored `aiFields` reused (line 147);
  `filled`/`nothing`/`skipped` not re-tagged (line 148); `photoFailed` skips tagging (line 146).
- After `rate_limited`, `provider_rate_limited` or any settings/key/model error, AI is off for the rest of the run
  (`AI_BATCH_OFF`, lines 36-48, 163).
- The checkbox is off by default (`usePhotoImport.ts:42`); `tag` is passed only when `aiOn && tagger`, and `tagger`
  is null unless availability is `ready` (`ImportModal.tsx:55`).
- A server `ai_busy` answer is an `AiSettingsError`, not an `ApiError`, so it cannot trigger the photo 503 retry;
  the server refuses busy requests before charging quota (`server/ai/tagPhoto.js:40-42`).

**No API key or secret in client code.** Met. The tagger sends only the bearer token via `createAuthedFetch`; the
provider key stays on the server; no new `VITE_*` variables or key literals.

### Non-blocking notes (🟡)
1. 🟡 `photoImport.ts:153-155` with `repo.http.ts:88-97`: one AI call can be wasted at the photo-quota stop. Tagging
   runs before the item and photo PUTs, so when the 50-uploads-per-day limit is already used, the first photo is
   tagged (1 AI call charged), its item created, then the photo PUT fails with `photo_quota_exceeded`. At most 1
   extra call per batch; the photo-less item is existing F-603 behaviour. Optional follow-up: skip AI when the
   photo quota is known to be used up.
2. 🟡 `photoImport.ts:160` and `usePhotoImport.ts:48`: aborting during a tag call can cost an extra AI call (the
   server may already have charged it, and the photo is tagged again on the next run). A retry within about 5 s of
   the abort may get `ai_busy` (503) for its first photo, shown as AI skipped (not charged). Bounded to 1 call per
   abort; follow-up list only.
3. 🟡 `photoImport.ts:161-163`: `network` and `internal` are not in `AI_BATCH_OFF`, so each later photo tries once
   more. Still sequential and at most 1 call per photo (≤ 50 per batch, inside the AI limit). Noted so it is clear
   this is deliberate.

### Risks
- `withPrepared` is a general hook on `WardrobeRepo.save`; its "cannot change id or bytes" guarantee depends on the
  order of `repo.http.ts:82-88`. The test at `repo.http.test.ts:556` pins that order, so keep it.

### Open questions
None affecting security. The AI name replacing the file name (assumption A1) has no security impact.
