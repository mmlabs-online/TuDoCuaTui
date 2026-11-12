# T-005.6: Orphan sweep for Drive photos

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | data, security |
| Gate | none |
| Depends on | T-005.2 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-12 |
| Claimed by | claude@2026-11-12T07:59:01Z |
| PR | — |

## Goal
Second slice of T-005.2 (split per `work/tickets/T-005.2/plan.md`): Drive files that no `item_photos` row references
(create timeouts after Google accepted the upload, crashes, failed best-effort deletes) get cleaned up safely.

## Feature reference
D27. Design: `work/tickets/T-005.2/consult-database-optimizer.md` R-5 and the T-005.2 plan assumption A5.

## Scope
- `drive.listFiles({ q, pageToken })` in `server/drive.js` (folder + `appProperties app=tudo`, paginated, same error/log discipline).
- `server/photo-sweep.js` (dry-run by default, `--apply` to delete): deletes only files tagged `app=tudo`, unreferenced
  by any row, older than a grace period (≥15 min, default 60); re-checks the DB before each delete; never touches
  untagged files; reports rows whose file is missing.
- Fake Drive list endpoint; sweep tests against real Postgres; README runbook (how to run it in the container).

## Out of scope
- Scheduling the sweep (deployment-repo follow-up).

## Acceptance criteria
- [ ] Unreferenced old tagged files are deleted with `--apply`; referenced, young and untagged files are kept; dry-run deletes nothing.
- [ ] Pagination works; no token or Google text in logs.

## Notes / answers from Ming

## Handoff
