# T-005.4: Remove Supabase Storage for photos

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-005.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-08 |
| Claimed by | — |
| PR | — |

## Goal
Photos live only in Google Drive. The `wardrobe` bucket, its policies and their tests are removed, and the rules and docs say so.

## Feature reference
- Not in `docs/feature-list.md` as written. Ming's decision on 2026-11-08 (chat with Annie): store photos in Google Drive
  the way Ricotdin does, using approach **A** (a Supabase Edge Function holds the Drive credentials). Defaults accepted:
  - Split into T-005.1 to T-005.4.
  - A new OAuth client "TuDoCuaTui" in Ricotdin's Google Cloud project, published "In production".
  - Ricotdin's Google account, folder `TuDoCuaTui/`.
  - Secret names `TUDO_GOOGLE_CLIENT_ID`, `TUDO_GOOGLE_CLIENT_SECRET`, `TUDO_GOOGLE_REFRESH_TOKEN` and
    `TUDO_DRIVE_FOLDER_ID`, in Edge Function secrets of the shared stoktok project.
- Replaces the Storage part of F-202 and of rule R4. Ricotdin's reference design is in `projects/ricotdin/CLAUDE.md`
  (Storage = Google Drive) and `app/web/src/lib/upload/upload.ts`. Ricotdin has a Python backend; TuDo uses an Edge
  Function instead.

## Scope
- A new migration drops the storage policies and the `wardrobe` bucket. The bucket must be empty; if it is not,
  the migration fails and changes nothing.
- Remove `supabase/tests/rls_storage.sql`.
- Update R4 in `CLAUDE.md`, `docs/data-model.md`, `docs/feature-list.md` (section 1 and F-202), and the README.

## Out of scope
- Any change to how Drive works.

## Acceptance criteria
- [ ] After the migration, no `wardrobe` bucket and no `wardrobe:` storage policy exist. pgTAP checks this.
- [ ] No code references `sb.storage`.
- [ ] R4 says photos are stored in Drive and served by the function.
- [ ] Checks are green. `npx supabase test db` passes.

## Technical notes
- Touches Edge Function secrets and/or migrations, so it needs a security review.
- Risks:
  - The refresh token expires if it goes unused for 6 months, or if the OAuth app is left in "Testing".
  - Images load more slowly because they go through the Edge Function.
  - Drive API quotas.

## Test plan
- Unit: fake fetch for the Google and Drive calls; the repo paths.
- Manual (Ming, after merge): run M-7 smoke, then add, view and delete a photo in Supabase mode on a phone.

## Notes / answers from Ming
- 2026-11-08: approach A and the defaults accepted (questions 2–6, chat with Annie).

- 2026-11-10: **Paused by D23** (move to self-hosted Postgres + Node API). Re-plan on the new backend after T-013/T-014; the Supabase design no longer applies.

## Handoff
