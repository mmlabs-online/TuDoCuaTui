# T-005.6: Orphan sweep for Drive photos

| Field | Value |
|---|---|
| State | MERGED |
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
| Claimed by | |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/40 |

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

### 2026-11-12 — claude — DONE
- Done: `drive.listFiles` + `server/photo-sweep.js` (dry-run default, `--apply`, grace 15–43200 min, `--max-delete` 50, re-check before each delete, refusal when no listed file is referenced). 3 attempts: security B1 (empty/foreign DB) fixed in attempt 2; redaction test's delete-failure leg restored in attempt 3. PR https://github.com/mmlabs-online/TuDoCuaTui/pull/40.
- In progress / next: Ming decides A7 (cap 50), trash vs permanent delete (N1), ratio guard (N11). Follow-ups: schedule the sweep, check-image sweep check, stale README/compose wording, N9/N12/N13.
- Gotchas: DB tests need password (scram) auth — `migrate.cli.test.ts` has a wrong-password case. Any new apply test with an empty reference set must call `anchor()` or the B1 guard refuses it.
