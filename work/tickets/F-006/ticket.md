# F-006: Add RLS and storage policy tests

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db, security |
| Gate | none |
| Depends on | F-001 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/7 |

## Goal
Automated proof that one user can never see or change another user's data.

## Feature reference
`docs/feature-list.md` F-006. Decisions: `work/decisions.md`.

## Scope
- `supabase/tests/*.sql` (pgTAP), run with `supabase test db` against `supabase start`.
- With two users A and B (JWT claims set per test):
  - A cannot select, update or delete B's `items`, `item_photos`, `wear_logs` or `locations`.
  - A cannot insert a wear log or photo pointing at B's item.
  - A cannot set `items.location_id` to B's location.
  - Storage: A cannot read, upload to or delete under `B/...` in bucket `wardrobe`.
  - **Gap probes** (expected to fail today, see T-003): A sets `locations.parent_id` to B's location;
    A inserts an `item_photos` row whose `storage_path` starts with B's user id.
- README section "Running DB tests" (needs Docker).

## Out of scope
- Running in CI (P2).
- Fixing the gaps (T-003, a migration and therefore High).

## Acceptance criteria
- [ ] `supabase test db` passes locally for all non-gap cases.
- [ ] The gap probes are reported in the Handoff, with the result.
- [ ] The README explains how to run the tests.

## Technical notes
- Files: `supabase/tests/rls_*.sql`, `README.md`.
- `items_with_stats` is `security_invoker`: also assert that A sees zero of B's rows through the view.
- Expected tier: Medium (tests are not under `migrations/**`).

## Test plan
- Unit: pgTAP as above.
- Manual: none.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-07 — claude — DONE
- Done: pgTAP suite in `supabase/tests/` (`rls_tables.sql`, `rls_storage.sql`, `rls_gaps.sql`) and README "Running DB tests". `supabase test db`: Files=3, Tests=51, PASS (implementer and reviewer). Reviewer PASS on attempt 1; security review has no blockers. PR #7.
- Gap probe results (raw TAP, both CONFIRMED):
  - `ok 1 - GAP-1 result: CONFIRMED (statement succeeded)`
  - `not ok 2 - GAP-1 (T-003): A cannot set locations.parent_id to B's location # TODO T-003: locations.parent_id is not checked against ownership`
  - `ok 3 - GAP-2 result: CONFIRMED (statement succeeded)`
  - `not ok 4 - GAP-2 (T-003): A cannot insert item_photos with storage_path under B/ # TODO T-003: item_photos.storage_path is not checked against the owner folder`
- In progress / next: Ming reviews and merges PR #7. T-003 is confirmed needed (High, plan approval).
- Gotchas:
  - README says `npx supabase stop --no-backup`, which deletes the local DB. Should be plain `npx supabase stop` (follow-up).
  - `storage.objects` has the `protect_delete` trigger. The tests set `storage.allow_delete_query` first.
  - A "TODO passed" line does not fail the run. Check for it by hand after T-003.
  - Security 🟡 follow-ups (own-row UPDATE/DELETE controls, UPDATE re-parenting denials, anon role) are listed in the PR.
