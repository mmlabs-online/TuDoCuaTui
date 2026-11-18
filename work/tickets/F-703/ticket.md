# F-703: Tag photos with AI during bulk import

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P1 |
| Size | S |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | ui, data |
| Gate | none |
| Depends on | F-701, F-603, F-603.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-18 |
| Claimed by | claude@2026-11-18T01:26:24Z |
| PR | — |

## Goal
When Ming imports a batch of photos, the AI can fill each new item's details (category, colours, seasons, material,
brand, tags) as it is imported, so the batch needs less manual editing afterwards.

## Feature reference
`docs/feature-list.md` F-703 · AI in bulk photo import · P1 · M3 · S · depends on F-701, F-603:
> A checkbox in the import modal; when on, each photo is tagged during import.

Related: F-701 (`POST /api/ai/tag-photo` with the user's AI settings, per-user limit `tag: 100 / 24 h` in
`server/ai/rateLimit.js`, one tag call in flight per user), F-702 (editor "✨ Tự điền từ ảnh": fills empty fields
only, `src/features/items/aiFill.ts`), T-001 (the AI checkbox in the Photos tab is hidden until M3), D48 (every
upload goes through `preparePhoto`).

## Scope
- Show the AI checkbox in the "Ảnh hàng loạt" tab (off by default). When AI is not configured for the user,
  the checkbox is disabled with a link to "Cài đặt AI" (same rule as F-702).
- When it is on, each photo is tagged before its item is saved, and the suggestion fills the new item's fields
  using the F-702 rule (only fields that are still empty or at the batch default; ids only through the existing
  mappers).
- A tagging failure never blocks the import: the item is still created with the batch defaults, and the file's
  row shows that AI was skipped. On `rate_limited` (AI daily limit) the rest of the batch continues without AI and
  a Vietnamese message says so.
- Progress shows when a photo is being tagged.

## Out of scope
- Changing the AI server, providers, limits or prompts (F-701 / F-701.1).
- Re-tagging items that already exist; undo for the whole batch.

## Acceptance criteria
- [ ] The Photos tab shows an AI checkbox, off by default; it is disabled with a settings link when AI is not configured.
- [ ] With the checkbox on, each imported item gets the AI suggestion for its empty fields (unit tests with a fake tagger).
- [ ] With the checkbox off, no tag call is made (unit test).
- [ ] A tag error or `rate_limited` does not stop or fail the import; affected items are created without AI and the user is told in Vietnamese.
- [ ] Each photo is tagged once per import attempt; a retry does not create a duplicate item.
- [ ] 390px and dark mode.

## Technical notes
- Files: `src/data/photoImport.ts` (optional tag step), `src/data/useWardrobe.ts`, `src/features/import-export/usePhotoImport.ts`, `ImportPhotosTab.tsx`, `ImportModal.tsx`, `copy.ts`, `src/data/aiTagging.ts` (reuse), `src/features/items/aiFill.ts` (reuse the fill rule).
- Tag the prepared JPEG (`preparePhoto` output) rather than the original file, so each photo is decoded once (F-603.2 worker) and the AI never sees EXIF/GPS.
- Open question for the planner: the item name comes from the file name (`IMG_2031`). Should an AI name replace it? Proposed default: yes, because a file name is not something the user typed.
- AI limit is 100 tag calls per rolling 24 h per user, while the photo upload limit is 50 per day, so a full photo batch fits inside the AI limit.

## Test plan
- Unit: runner with a fake tagger (on/off, success, error, `rate_limited`, retry), fill rule, tab and modal states.
- Manual: Ming imports about 10 photos with AI on, on a phone, and checks the filled fields.

## Notes / answers from Ming

## Handoff
