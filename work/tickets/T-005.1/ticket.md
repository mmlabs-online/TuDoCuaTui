# T-005.1: Connect the Node server to Google Drive

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | T-013.2, T-015 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-08 (re-planned 2026-11-11) |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/35 |

## Goal
The TuDo Node server can create, read and delete files in Ming's Drive folder `TuDoCuaTui/` with a long-lived OAuth refresh token that only the server sees.

## Feature reference
- Ming 2026-11-08: store photos in Google Drive the way Ricotdin does. OAuth client "TuDoCuaTui" in Ricotdin's
  Google Cloud project (published "In production"), Ricotdin's Google account, folder `TuDoCuaTui/`, scope `drive.file`.
- **Re-planned 2026-11-11 on the Node backend (D23, D27):** the Drive credentials live only in the TuDo server's
  runtime env (never in the image, never `VITE_*`, R3); there is no Supabase Edge Function. Ming confirmed Google Drive
  with the account above ("Như đã chốt"). Ricotdin reference: `projects/ricotdin/CLAUDE.md` (Storage = Google Drive),
  `app/web/src/lib/upload/upload.ts`.

## Scope
- `server/drive.js`: refresh-token → access-token exchange (cached until expiry), minimal Drive v3 calls
  (create multipart upload, get media, delete) with `fetch`; scope `drive.file`; timeouts; errors mapped to safe codes.
- Config from runtime env only (names decided in the plan, e.g. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID`); the server starts without them (photos then report "not configured").
- How the secrets reach the Mac: the deploy draft (`deploy/deployment-repo/`) writes them into the env file next to
  `DATABASE_URL`, from a source the plan picks (deployment-repo secret file like the DB password, or GitHub
  environment secrets). Never in the image, never logged.
- One-time connect script Ming runs locally (desktop OAuth, loopback + PKCE) that prints only where to put the token.
- A smoke command (create, read, delete a tiny file) runnable inside the container.
- New Ming item: create the OAuth client, the folder, run the connect script, store the secrets, run smoke.

## Out of scope
- Upload/delete endpoints (T-005.2). Serving photos (T-005.3). Any UI change.

## Acceptance criteria
- [ ] With the env set, smoke creates, reads and deletes a file in `TuDoCuaTui/`; with it unset the server still starts.
- [ ] No token or client secret appears in logs, responses, the image or the repo (R3); tests cover the token exchange and error mapping with a fake Drive.
- [ ] The Ming runbook lists the exact steps.

## Technical notes
- Container egress to `oauth2.googleapis.com` and `www.googleapis.com` goes through the `web` network.
- Touches secrets and the deploy draft: security review.

## Notes / answers from Ming
Plan approved (Ming, 2026-11-11): A1–A17 as written (permanent delete, shared Ricotdin project, GitHub environment secrets, Mac+Windows connect script).
- (2026-11-11, orchestrator) Split per plan.md: this ticket = server side (drive.js, smoke, startup config, check-image, M-15 wording); connect script + deploy workflow secrets + full runbook moved to T-005.5.
- 2026-11-11: Ming put T-016 on hold and asked for photo upload first; Google Drive, account as decided (D27).

## Handoff

### 2026-11-11 — claude — BLOCKED
- Done: software-architect consult; plan.md READY (slice ~380 lines, no new dependency; fake-Drive tests).
- In progress / next: Ming approves A1–A17 (real choices A2 secrets in GitHub environment `tudocuatui`, A4 permanent delete, A5 shared Ricotdin project, A6 Mac+Windows connect script). Then implement. T-005.5 created for the connect script + workflow.
- Gotchas: OAuth client must be "In production" (7-day refresh tokens otherwise); folder must be created by the app (drive.file).

### 2026-11-11 — claude — DONE
- Done: plan approved (A1–A17); attempt 1 PASS; attempt 2 fixed two 🟡 security items at Ming's request (no redirect following on token/meta/create/delete; drive_invalid_id + validated create id); re-review PASS, security no 🔴/🟡; PR #35 opened.
- In progress / next: Ming merges PR #35. Next: T-005.5 (connect script + deploy secrets + full M-15 runbook), then M-15, then T-005.2.
- Gotchas: T-005.3 must pass a per-request signal with a deadline to getMedia; T-005.2 handles create-timeout orphans and MIME allowlist.
