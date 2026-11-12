# T-005.5: Drive connect script and deploy secrets for TuDo photos

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | security |
| Gate | plan-approval |
| Depends on | T-005.1 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-11 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/36 |

## Goal
Second slice of T-005.1 (split per `work/tickets/T-005.1/plan.md`): Ming can connect Google Drive once and the deploy
puts the four Drive values into the server's env file without them ever touching the TuDo repo or the image.

## Feature reference
D27 (photos on Google Drive via the Node server). Design: `work/tickets/T-005.1/consult-software-architect.md`
("Where the secrets live", "Connect script") and the T-005.1 plan's split section / assumptions A2, A6, A14.

## Scope
- `scripts/drive-connect.mjs` (`@ts-check`, no deps, Mac + Windows): desktop OAuth with loopback + PKCE + state,
  `access_type=offline`, `prompt=consent`, scope `drive.file`; shows the signed-in account; finds or creates the
  `TuDoCuaTui` folder via the API; writes the refresh token to a mode-600 file outside any git work tree; prints only
  the file path, the folder id and the exact `gh secret set … --env tudocuatui -R mmlabs-online/deployment` commands.
- Deploy workflow draft (`deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`): job `environment: tudocuatui`;
  the four `TUDOCUATUI_*` secrets written in the same `envfile` step as `DATABASE_URL`; all-or-none; strict charset
  check; `--force-recreate` when the env file changed; header comment updated. Deployment README + compose comment.
- Full M-15 runbook (create the OAuth client "In production", create the `tudocuatui` environment restricted to `main`,
  run the script, set the secrets, delete the token file and client JSON, dispatch deploy, run smoke) and the
  refresh-token recovery path.

## Out of scope
- Server Drive code (T-005.1). Upload/delete/serving (T-005.2/T-005.3).

## Acceptance criteria
- [ ] The connect script never prints or logs the refresh token or client secret; it refuses to write inside a git work tree.
- [ ] The workflow draft writes the Drive values only when all four are set, rejects bad characters, and stays compatible with the live release.
- [ ] M-15 lists the exact steps, including recovery.

## Notes / answers from Ming
Plan approved (Ming, 2026-11-11): A1–A14 as written.

## Handoff

### 2026-11-11 — claude — BLOCKED
- Done: plan.md READY (no consult: area security only; reuses T-005.1 consult) — connect script, workflow draft (environment `tudocuatui`, all-or-none, charset check, force-recreate on change), tests incl. running the real envfile block in bash, full M-15 runbook, setup PR plan for the deployment repo.
- In progress / next: Ming approves A1–A14 (real choices A2, A3, A7). Then implement.
- Gotchas: the local deployment clone is stale — fetch and verify live main matches the drafts before opening the setup PR; create the GitHub environment (restricted to main) before merging it.

### 2026-11-11 — claude — DONE
- Done: plan approved (A1–A14); attempt 1 PASS; attempt 2 fixed five follow-ups at Ming's request (leak path, In-production reminder, no `~`, force-recreate on dispatch, symlink tests); re-review PASS, security no 🔴/🟡; PR #36 opened.
- In progress / next: Ming merges PR #36, creates OAuth client + GitHub environment `tudocuatui` (main only); orchestrator then opens the deployment setup PR `setup/tudocuatui-drive-secrets`; then M-15 steps 4–8 (new release needed for drive-smoke.js). Next ticket: T-005.2 (needs M-15).
- Gotchas: verify live deployment main still matches the drafts before the setup PR; never read the secrets file.
