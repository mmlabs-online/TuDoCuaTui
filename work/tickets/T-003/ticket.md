# T-003: Close RLS gaps found by F-006 (only if confirmed)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | F-006 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
Users cannot link their rows to another user's rows, even without being able to read them.

## Feature reference
Not in the feature list: comes from a mismatch in `docs/plan-M1.md` §4; accepted in `work/decisions.md` D9.

## Scope
- New migration:
  - `locations` with-check: `parent_id is null or exists (own location)`.
  - `item_photos` with-check: `storage_path like auth.uid() || '/%'`. Without it, user A could claim a path
    in B's folder, and because `storage_path` is `unique`, B's upload for that path would then fail.
- Regenerate types (F-002 script).

## Out of scope
- Any other schema change.

## Acceptance criteria
- [ ] The F-006 gap probes pass.
- [ ] Ming applies the migration (`supabase db push` is a human step).

## Technical notes
- Files: `supabase/migrations/2026MMDDhhmmss_rls_hardening.sql`.
- Expected tier: **High** (migration, RLS), so Ming approves the PLAN and the PR. Low real-world risk while
  the app has one user, which is why it is P1.

## Test plan
- Unit: the F-006 pgTAP suite.
- Manual: none.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
