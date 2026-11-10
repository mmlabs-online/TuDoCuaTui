# Implementation log — T-011

## Attempt 1 — 2026-11-10

Plan approved by Ming; P1 option (a) accepted, so D25 is recorded. CLAUDE.md untouched (R2 row left for Ming).
The live files in `/home/user/deployment` (compose.yml, deploy-tudocuatui.yml) were identical to the drafts, so I
started from the drafts. No `release.env`, `postgres/secrets/` or `.env` file was opened.

### Files touched
| File | Required because |
|---|---|
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | `envfile`, `pull` (compose-keyed migrate guard), `backup`, `migrate`, service-named `deploy`/rollback, notify MIGRATE cases, header |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Node target shape: x-app anchor, env_file, `[tunnel, db]`, `migrate` profile, `/readyz` healthcheck |
| `deploy/deployment-repo/README.md` | "When" column, postgres step, R3 statement replaced, expand-then-contract and rotation notes |
| `work/ming-todo.md` | M-12 runbook; one line in M-4 |
| `work/decisions.md` | D24 (approved assumptions) and D25 (R2 wording, P1 option a) |

### Tests added / changed
- None (no pure logic changed; drafts are YAML for another repo).

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean.
- format:check: first run failed on `compose.yml` (formatting only); ran `oxfmt` on that file; re-run: "All matched files use the correct format."
- test: 488 passed (488).
- build: built OK (vite, 373ms).
- Both drafts parse with `python3 yaml.safe_load`.
- R3 greps (`postgres://user:pw@` pattern, 48-hex strings) over deploy/, work/, docs/, README.md: no hits.
- Not run: `docker compose config --services` (no Docker checked); the guard was reasoned from the compose spec: the draft compose lists `migrate` under `--profile migrate`, the live nginx compose does not.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- CLAUDE.md R2 row text needs Ming's update per D25.
- Least-privilege runtime role (`tudocuatui_app`); needs deployment-repo script changes.
- T-015: add `Needs Ming: M-12` and its own M-item for the compose-in-release-PR step.
- T-012 runner must match `node server/migrate.js` (A4); T-013 `/readyz` with `select 1`, pool max 5.

### Scope self-check
- Could the diff be smaller? No; every file is in the plan.
- Diff size: about +190 / -37 lines (before this log).
