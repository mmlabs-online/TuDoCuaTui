# F-006: Add RLS and storage policy tests

| Field | Value |
|---|---|
| State | REVIEW |
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
| Claimed by | claude@2026-11-07T13:09:36Z |
| PR | — |

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
