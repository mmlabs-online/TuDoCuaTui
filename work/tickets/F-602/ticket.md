# F-602: JSON backup and restore

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data, db |
| Gate | none |
| Depends on | F-004.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
A full backup that can be restored safely, so Ming does not lose the wardrobe.

## Feature reference
`docs/feature-list.md` F-602. Decisions: `work/decisions.md`.

## Scope
- Export `{ version: 1, exportedAt, locations[], items[], wearLogs[] }` with DB ids, enum ids (not labels)
  and photo storage paths, but no signed URLs and no data: URLs.
- Restore validates the file (version, shape), then upserts locations → items → wear logs by id. Running it
  twice changes nothing.
- New repo methods `exportAll()` / `restore(backup, onProgress)`, implemented for both modes.
- Update the backup tab copy: it says "các món mới sẽ được thêm vào", but restoring also overwrites items
  with the same id.

## Out of scope
- Restoring photo files (F-605 ZIP export, M3).

## Acceptance criteria
- [ ] Export → wipe the same account → restore → export again gives identical JSON, apart from timestamps
      and photo URLs (decision D1 rewrites the feature list's "empty account").
- [ ] Restoring the same file twice changes nothing.
- [ ] Restoring into a different account succeeds: rows whose id belongs to someone else get new ids, and
      every reference (item → location, wear log → item) is remapped; photos are skipped and counted in the
      summary (decision D1).
- [ ] A local-mode export restores in local mode (synthetic wear logs are acceptable).

## Technical notes
- Files: `src/data/repo.ts`, `src/data/backup.ts` (schema + validation), `src/features/import-export/*`.
- Mismatches with the code (decision D1):
  - `items.id` is a global primary key. Restoring a backup into a **second** account while the first still
    exists hits rows owned by the first user: RLS makes the upsert fail. The AC only works on the same
    account (after wiping it) or with id remapping.
  - Photo paths start with the owner's user id, and storage RLS blocks other users, so photos cannot be
    re-linked into another account.
  - Local mode has no wear logs, only `wearCount` / `lastWorn` counters, and demo ids are `"1"`…`"16"`
    (not UUIDs). A local-mode export can only produce synthetic wear logs.
  - Today's JSON export dumps UI items, including signed URLs (which expire) and, in local mode, full
    data: URLs. The ExportModal says photos are not in the file, which is wrong in local mode.
- Expected tier: Medium.

## Test plan
- Unit: backup validation; restore idempotency against a fake repo; id remapping for foreign-owned ids.
- Manual: export → wipe → restore → export → diff, in Supabase mode.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
