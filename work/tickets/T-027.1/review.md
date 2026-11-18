## Attempt 1 — 2026-11-18
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean (exit 0).
- format:check: exit 0 ("Finished in 31ms on 300 files").
- test: 6 sequential full runs plus 2 concurrent full runs, all `Test Files 119 passed | 11 skipped (130)`,
  `Tests 1550 passed | 221 skipped (1771)`. Matches impl-log.
- build: `✓ built in 331ms`.

### Acceptance criteria
- [x] A `401` or network error stops the batch; remaining files stay pending and can be retried — evidence:
  `photoStopFor` at `src/data/photoImport.ts:81-90` (401 → `unauthorized`, `status 0 && code "network"` →
  `network`), used in the runner catch at `photoImport.ts:220-231`. Tests `› 401 stops the batch and keeps the rest
  pending` (`["done","pending","pending"]`, 2 saves), `› 401 on the photo step keeps the saved item (photoFailed)`,
  `› network error stops the batch and keeps the rest pending`, `› a second run after a network stop finishes the
  rest with the same ids` (ids `id1,id2,id2,id3`), UI `› network stop shows its message and "Thử lại" re-runs`. AI
  errors stay `AiSettingsError`/`"internal"` inside `withPrepared` (`photoImport.ts:191-199`), which never throws, so
  they cannot reach `photoStopFor`.
- [x] After a `429` stop, "Thử lại" is disabled until `Retry-After` has passed — evidence:
  `usePhotoImport.ts:49-62` (`retryAt`, 1 s interval cleared on cleanup and once the time has passed, also on
  unmount via the effect cleanup), `run()` guard `usePhotoImport.ts:85`, button `ImportPhotosTab.tsx:211-215`
  (`disabled`, label `Thử lại sau …`). Test `› 429 stop keeps "Thử lại" disabled until Retry-After has passed`
  (fake timers: "2 phút" → click does not call `importPhotos` → "1 phút" → "Thử lại (1)" enabled and re-runs);
  `› 429 without Retry-After leaves "Thử lại" enabled`; existing 429 test now asserts the disabled
  "Thử lại sau 2 giờ" button.
- [x] A `503` without `Retry-After` stops the batch; with `Retry-After` keeps wait-once — evidence:
  `photoImport.ts:89` and `:232-233` (wait only reached with a `retryAfterSec`, still capped at 30 s). Tests
  `› 503 without Retry-After stops the batch without waiting` (item step → `pending`, photo step → `photoFailed`,
  `wait` not called, 1 save), existing `› 503 waits Retry-After and retries once`, `› second 503 fails the file and
  continues`, `› wait is capped at 30 s`.
- [x] Adding the same file twice results in one job — evidence: `photoFileKey`/`newPhotoFiles`
  `photoImport.ts:96-108` (name + size + lastModified, also de-dupes within one pick), used inside the functional
  `setJobs` update `usePhotoImport.ts:67-80`. Tests `› newPhotoFiles drops files already picked and repeats within
  one pick` (different size / lastModified / NFC vs NFD name kept) and UI `› picking the same file twice lists it
  once` (pick, pick twice, drop → "1 ảnh đã chọn").
- [x] Once the photo quota is hit, no further AI calls in that batch — evidence: `quotaHeld` `photoImport.ts:160,
  185, 216`; hook memory `usePhotoImport.ts:97, 114`. Tests `photoQuotaHit: no tag call until an upload succeeds`,
  `… a file saved before any upload succeeds gets ai "off" without a tag call`, `… tagging resumes after the first
  successful upload`, UI `› after a photo-quota stop the retry passes photoQuotaHit` (`[false,true,true,false]`).
  Within a single run, a quota stop returns immediately, so no later file is tagged in that run either.
- [x] Each stop shows its own Vietnamese message from `copy.ts` — `copy.ts:73-83`, `ImportPhotosTab.tsx:186-196`;
  test `it.each` `unauthorized / network / unavailable stop shows its message`.
- [x] All checks pass — see above.

### Changed existing tests (were they weakened?)
- `› creates and revokes one object URL per file (also on failure)` and `› item failure retry reuses the
  pre-assigned id`: the failing error changed from `ApiError(0,"network")` to `ApiError(500,"internal")`. A network
  error now stops the batch by design, so it can no longer stand for "this file fails and the batch continues"; the
  assertions (one URL per file revoked; same id on retry) are unchanged. Legitimate update.
- `› abort stops before the next file and during a 503 wait`: the 503 now carries `Retry-After: 5`, the only 503
  that still waits. Assertions unchanged. Legitimate.
- `› wait is capped at 30 s and defaults to 5 s without Retry-After`: the "defaults to 5 s" half is removed because
  that path no longer exists; it is replaced by the stronger `› 503 without Retry-After stops the batch without
  waiting`. Legitimate.
- `ImportPhotosTab › 429 shows imported count and wait time`: now asserts the disabled "Thử lại sau 2 giờ" button
  (stronger than before). Legitimate.

### Visual (390px, light/dark)
Screenshots `429-dark.png` and `503-light.png` in the implementer's scratch folder checked: stop message wraps
inside the panel, disabled "Thử lại sau 2 phút" is visibly muted in dark mode, enabled "Thử lại (4)" in light mode,
no overflow, footer clear. R9 OK.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: runner still calls only `deps.save` (repo), no `fetch`; R6: all new copy in
`import-export/copy.ts`; R7: only the six planned files changed (plus ticket docs); R8: every new pure function and
runner path has unit tests; `repo.http.ts`/`authFetch.ts`/server untouched, so no security-auditor routing needed.

### Nits (do not block)
- `ImportPhotosTab.tsx:187-195`: the plan said "a lookup by `stopped.code`"; the code is a 5-level nested ternary.
  Behaviour is identical; T-027.3 (polish) can turn it into a map.
- The 429 stop message keeps the static wait from the first answer ("thử lại sau 2 phút") while the button counts
  down; acceptable, but T-027.3 could drop the duplicate wait from the message.

### Ming verification after merge
- Phone check of the Photos tab at 390px light/dark: stop messages and the disabled "Thử lại sau …" button.
- Optional: with Drive credentials unset on a dev server, a 3-photo batch stops at once with the "unavailable"
  message instead of taking ~15 s.

### Follow-ups (out of scope)
- `src/features/items/Editor.test.tsx` flakiness (implementer saw one transient failure): **not reproduced** in 6
  sequential and 2 concurrent full `pnpm test` runs on this branch; this diff does not touch the editor. If CI on
  `main` fails intermittently, capture the failing test name/message from the CI log before opening a ticket.
- A 401 that goes through `onAuthLost()` signs the user out and unmounts the modal, so the "remaining files stay
  listed" guarantee only holds for the `getToken` → null path (plan assumption); consider keeping the picked list
  across re-login if this matters in practice.
