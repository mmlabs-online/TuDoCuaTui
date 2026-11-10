# T-005.3: Display item photos from Google Drive

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | data, security |
| Gate | none |
| Depends on | T-005.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-08 |
| Claimed by | — |
| PR | — |

## Goal
In Supabase mode, the grid and the item editor show photos stored in Drive. They are loaded through the Edge Function, without exposing Drive credentials or other users' photos.

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
- A `tudo-drive` action that serves an image:
  - An `<img>` tag cannot send an Authorization header, so the URL carries a short-lived signed token. It is an HMAC
    made with a function secret and tied to the user, the photo and an expiry time.
  - The function checks ownership, then streams the image from Drive with cache headers.
- The repo returns these URLs in place of Storage signed URLs and gets new ones before the old ones expire.

## Out of scope
- Lazy loading and refresh polish. These stay in F-202.2, which is re-scoped to these URLs.

## Acceptance criteria
- [ ] A photo URL works only for its owner and only until it expires. Tests cover an expired token, a token for
      another photo and a tampered token.
- [ ] No Google token, and no Drive file id that gives direct access, reaches the browser.
- [ ] The grid and the editor show photos in Supabase mode. Local mode is unchanged (R1). Works at 390px (R9).
- [ ] Checks are green.

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
