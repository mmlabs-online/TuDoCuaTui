# T-005.1: Connect Google Drive through a Supabase Edge Function

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | T-004 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-08 |
| Claimed by | claude@2026-11-08T14:07:09Z |
| PR | — |

## Goal
The Edge Function `tudo-drive` can use Ming's Google Drive folder `TuDoCuaTui/`, only for a logged-in TuDo user. Its credentials never leave Edge Function secrets.

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
- `supabase/functions/tudo-drive/`:
  - Verifies the caller's Supabase JWT.
  - Gets a Google access token from the `TUDO_GOOGLE_*` secrets, scope `drive.file`.
  - Has a `smoke` action that creates, reads and deletes a tiny file in `TUDO_DRIVE_FOLDER_ID`.
- A one-time connect script that Ming runs locally. It uses Desktop-app OAuth with loopback and PKCE. It shows only the
  steps for putting the refresh token into the dashboard secrets. Agents never see or handle the value.
- Add the secret names to `.env.example` (names only). Add them to the workspace `secrets.refs.yaml` if needed.
- Add D18 to `work/decisions.md`.
- Add M-7 to `work/ming-todo.md`:
  1. Create the OAuth client and publish it "In production".
  2. Create the folder.
  3. Run the connect script.
  4. Set the four secrets.
  5. Deploy the function.
  6. Run smoke.

## Out of scope
- Uploading, showing and deleting item photos (T-005.2, T-005.3).
- Removing Supabase Storage (T-005.4).

## Acceptance criteria
- [ ] The function rejects a request without a valid Supabase JWT with 401. A test proves it.
- [ ] No `TUDO_GOOGLE_*` value or Google token appears in client code, a `VITE_*` variable, a log line or a response
      body (R3).
- [ ] Token refresh and the Drive calls sit behind a small interface with unit tests (fake fetch).
- [ ] The README explains setup, smoke, and how to reconnect after a token is revoked or expires. M-7 lists every
      step Ming has to do.
- [ ] Checks are green. Local mode is unaffected (R1).

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

## Handoff
