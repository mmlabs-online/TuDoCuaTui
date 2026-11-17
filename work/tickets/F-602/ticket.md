# F-602: JSON backup and restore

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data, db, architecture, security |
| Gate | plan-approval |
| Depends on | F-004.3 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/75 |

## Goal
A full backup that can be restored safely, so Ming does not lose the wardrobe.

## Feature reference
`docs/feature-list.md` F-602. Decisions: `work/decisions.md` (D1, D44).

## Scope
- Export `{ version: 1, exportedAt, locations[], items[], wearLogs[] }` with DB ids and enum ids (not labels).
  Photos are referenced by their `item_photos` id only, for information; no `/api/photos` URLs, no blob: or
  data: URLs, no photo bytes.
- The export comes from the server in one call, scoped to the signed-in user (new endpoint, e.g.
  `GET /api/backup`), because the current API has no way to list wear logs.
- Restore validates the file (version, shape, sizes) on the client and again on the server, then upserts
  locations → items → wear logs by id in **one transaction** on the server (new endpoint, e.g.
  `POST /api/restore`). Running it twice changes nothing.
- Id rules (D1): an id that is free or already owned by the caller is kept; an id owned by another user gets a
  new id and every reference (item → location, wear log → item) is remapped. Ownership is enforced by the
  existing per-request `app.user_id` RLS, never by ids from the file.
- Restore never creates or relinks photos, and never clears the photo of an item that already exists. Items
  restored without a live photo show no photo; the summary counts them.
- New repo methods `exportAll()` / `restore(backup)` on `WardrobeRepo` (HTTP implementation only, D44).
- Replace the "coming soon" JSON import tab (`ImportJsonTab.tsx`) and the current JSON export (which dumps UI
  items) with the real flow; fix the copy: restoring also overwrites items with the same id, and photos are not
  in the file.
- Request body limit and a per-user rate limit for restore, consistent with the other `/api` routes.

## Out of scope
- Restoring photo files (F-605 ZIP export, M3).
- A "wipe my account" button.

## Acceptance criteria
- [ ] Export → delete the items of the same account → restore → export again gives identical JSON, apart from
      timestamps and photo references (D1).
- [ ] Restoring the same file twice changes nothing.
- [ ] Restoring into a different account succeeds: rows whose id belongs to someone else get new ids, every
      reference is remapped, the other user's rows are untouched; photos are skipped and counted in the
      summary (D1).
- [ ] An invalid or oversized file is rejected with a Vietnamese message and writes nothing (transaction).
- [ ] 390px and dark mode.

## Technical notes
- Files: `server/api.js`, `server/items.js` (or a new `server/backup.js`), `server/validate.js`,
  `src/data/repo.ts`, `src/data/repo.http.ts`, `src/data/backup.ts` (schema + validation),
  `src/features/import-export/*`.
- Backend (re-scoped 2026-11-17, D23/D44): self-hosted Postgres, `items`, `locations`, `wear_logs`,
  `item_photos`, all with `user_id` and RLS keyed on `app.user_id` (`db/migrations/20261114200000_row_level_security.sql`).
  `items.id` is a global primary key, so a foreign-owned id is invisible under RLS and an upsert on it fails —
  hence the D1 remap. Detect "owned by someone else" without leaking other users' data (e.g. insert
  `on conflict do nothing` and remap when nothing was written for an id the caller does not own).
- Deleting an item deletes its Drive photo, so after a wipe the photo ids in the backup are dead; that is why
  restore never relinks photos.
- `wear_count` / `last_worn` are derived (R5): they are not in the export and must come out identical after
  restore through `items_with_stats`.
- No migration is expected. If the planner finds one is needed, the ticket becomes High tier and needs
  `plan-approval`.
- Consult `security-ai-generated-code-auditor` (new write endpoint, cross-user ids).
- Expected tier: Medium.

## Test plan
- Unit: backup validation; id remapping; restore idempotency against a fake repo.
- DB tests (`*.db.test.ts`): restore in one transaction; foreign-owned ids remapped; another user's rows
  unchanged; second restore is a no-op.
- Manual: export → delete items → restore → export → diff, on the real app.

## Notes / answers from Ming
- 2026-11-17: **Plan approved** by Ming, with all 8 defaults under plan.md "Needs Ming's decision" (recorded as D49). F-602.2 (client) created on `main`.
- Waiting for Ming: plan approval (High tier). plan.md covers slice **F-602.1** (server: `GET /api/backup`, `POST /api/restore`, all under `server/**`, High in `.github/risk-tiers.yml`); the client half becomes F-602.2 (see plan.md "Split proposal"). Reply "Plan approved" here (or in chat) to resume.
- 2026-11-17: scope refreshed for the current backend (Node API, Postgres RLS, Drive, no local mode — D44)
  at Ming's request. The local-mode acceptance criterion was dropped.
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-17 — claude — BLOCKED
- Done: consults (software-architect, database-optimizer) saved; planner wrote plan.md (READY) for slice F-602.1 (server). Whole ticket ≈ 900 non-test lines → split: F-602.1 server, F-602.2 client (depends on F-602.1 MERGED).
- In progress / next: Ming approves the plan (High tier: `server/**`). Then: create F-602.2 ticket + board row on `main`, run F-602.1 (IMPLEMENT → REVIEW with security auditor). The 8 defaults under plan.md "Needs Ming's decision" are adopted unless Ming overrides.
- Gotchas: never use `ON CONFLICT DO UPDATE` inside the restore transaction (42501 on foreign rows aborts it); guard UPDATEs with `IS DISTINCT FROM` (trigger bumps `updated_at`); remap must be deterministic (uuidv5) or cross-account restore duplicates.

### 2026-11-17 — claude — DONE
- Done: slice F-602.1 (server). Attempt 1 REWORK (upper-case ids duplicated items; lone surrogates caused a SQL error); attempt 2 PASS. Security audit: no 🔴 (S1 fixed). PR #75 (High tier). Follow-ups: workspace debt #58 (readJson timeouts), #59 (export over caps, location swap, PUT surrogates, restore slot).
- In progress / next: Ming reviews and merges PR #75 → F-602.2 (client) becomes runnable; its plan should use the wire format in this plan.md.
- Gotchas: the Windows checkout's node_modules is a Windows install; run checks in a native WSL clone with a throwaway postgres:16 (DB tests skip silently without Postgres). Open question for Ming: is sign-in limited to known Identity users (security N7)?
