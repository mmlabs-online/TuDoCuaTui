# F-001: Verify the Supabase backend end-to-end

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/4 |

## Goal
Prove that PR #1 works against a real Supabase project, so that M1 is built on a backend that runs.

## Feature reference
`docs/feature-list.md` F-001. Decisions: `work/decisions.md`.

## Scope
This ticket covers the agent's part only (decision D12). Ming's steps are `work/ming-todo.md` M-1 (set up the
hosted project) and M-2 (run the smoke test); they do not block this ticket.
- Run `supabase init` and commit `supabase/config.toml` (it does not exist yet; F-002 and F-006 need it).
  Check that `npx supabase start` + `npx supabase db reset` applies `20261106000000_init.sql` cleanly to a local
  database (Docker is available on Ming's machine).
- Write `docs/qa/smoke-test.md`, a step-by-step manual script with expected results:
  sign in → add an item with a photo → edit → wear today / undo → duplicate (photo copied into the
  new item's folder) → delete (storage file removed, `item_photos` row gone). Include a results table Ming fills in.
- README: point the "Set up Supabase" section at the smoke test.

## Out of scope
- The production redirect URL (F-007).
- Fixing the bugs found (separate tickets).

## Acceptance criteria
- [ ] `supabase/config.toml` is committed, and the init migration applies cleanly with `npx supabase db reset` on a local stack.
- [ ] `docs/qa/smoke-test.md` covers every step above, each with an expected result, plus the three checks in Technical notes.
- [ ] The README links to the smoke test.
- Ming verification after merge (M-1, M-2): migration applied to the hosted project; smoke test run once; each
  failure filed with `/ticket`.

## Technical notes
- Files: `docs/qa/smoke-test.md`, `supabase/config.toml`, `README.md`.
- Things the smoke test should check, because the code suggests they may break:
  - `removePhotos()` ignores errors from `storage.remove` and from deleting `item_photos`, so a failed
    delete is silent. Check the storage bucket after deleting an item.
  - Pressing "Mặc hôm nay" twice on the same day: the second click is silently ignored but still shows the
    "Đã ghi nhận" toast.
  - The wear pill on a card worn today, checked between 00:00 and 07:00 local time (see T-002).
- Expected tier: Low (docs + config). Mostly a human step for Ming.

## Test plan
- Manual: `docs/qa/smoke-test.md` on desktop Chrome and on a phone.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
### 2026-11-07 — claude — DONE
- Done: `supabase/config.toml` (project_id tudocuatui, ports 553xx), `supabase/.gitignore`, `docs/qa/smoke-test.md` (Run A local, Run B hosted), README link. Local `db reset` applies the init migration cleanly. Review PASS on attempt 2 (attempt 1: two SQL-check blockers in the smoke test). PR #4.
- In progress / next: Ming M-1 + M-2 after merge. F-002 / F-006 / F-007 become runnable once this merges.
- Gotchas: a calechip Supabase stack runs on the default 543xx ports — never stop it; always `npx supabase stop --no-backup` from this repo after use. `supabase start` creates an empty `supabase/snippets/` — delete it. Never write keys from `supabase status` into files. Local config is NOT hosted config (security-review.md).
