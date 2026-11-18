# T-027.1: Make the bulk photo import runner stop and retry sensibly

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | ui, data |
| Gate | none |
| Depends on | F-703 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-18 |
| Claimed by | claude@2026-11-18T02:08:05Z |
| PR | — |

## Goal
A bulk photo import stops early instead of failing every remaining file the same way, and never wastes uploads,
AI calls or duplicate items. Follow-ups from F-603, F-603.2 and F-703 (split of T-027).

## Feature reference
Not a feature-list item: hardening of F-603 (bulk photo import) and F-703 (AI in bulk import). Sources:
`work/tickets/F-603/security-review.md` (🟡 1–2), `work/tickets/F-603/review.md` (follow-ups),
`work/tickets/F-703/security-review.md` (🟡 1–2).

## Scope
- Stop the batch on `401` (session expired) and on a network error, like `rate_limited`, keeping the remaining
  files listed for retry, with a Vietnamese message.
- After a `429` stop, keep "Thử lại" disabled until `Retry-After` has passed (show the wait).
- A `503` with no `Retry-After` (Drive not configured, `server/photos.js:148`) does not wait 5 s per file: stop
  the batch after the first such answer with a clear message.
- Picking or dropping the same file twice (same name, size and lastModified) adds it once.
- With AI on, do not spend an AI call on a photo whose upload is known to fail (the photo quota is already used
  up in this batch).

## Out of scope
- Server limits and error codes; the photo worker (T-027.2); UI polish (T-027.3).

## Acceptance criteria
- [ ] A `401` or network error stops the batch; remaining files stay pending and can be retried (unit tests).
- [ ] After a `429` stop, "Thử lại" is disabled until `Retry-After` seconds have passed (unit test with fake timers).
- [ ] A `503` without `Retry-After` stops the batch instead of waiting per file; a `503` with `Retry-After` keeps today's wait-once behaviour (unit tests).
- [ ] Adding the same file twice results in one job (unit test).
- [ ] Once the photo quota is hit, no further AI calls are made in that batch (unit test).
- [ ] All checks pass.

## Technical notes
- Files: `src/data/photoImport.ts`, `src/features/import-export/usePhotoImport.ts`, `ImportPhotosTab.tsx`, `copy.ts`, tests.
- Diff may touch `src/data/repo.http.ts` only if needed: then route to `security-ai-generated-code-auditor` at review.

## Test plan
- Unit: runner and hook with fakes. Manual: none beyond Ming's usual phone check.

## Notes / answers from Ming

## Handoff
