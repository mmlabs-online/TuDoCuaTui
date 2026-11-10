Status: READY

# Plan — T-011: Register a `tudocuatui` database on the shared Postgres

Gate: **plan-approval** (High tier: DB registration and production deploy config). Ming must confirm
assumptions A1–A9 and decide on proposal P1 (R2 wording), or leave P1 for T-012.

## Feature summary
T-011 is not in `docs/feature-list.md`. It implements decision **D23** (`work/decisions.md`, 2026-11-10):

> TuDo moves its data from Supabase (D17) to the shared Postgres in `mmlabs-online/deployment` (`postgres/`,
> database + role `tudocuatui`, network `db`), accessed only by a Node API in the same image as the SPA
> (replaces nginx from T-007). **No in-app authentication for now** (single user); **Cloudflare Access** protects
> `tudocuatui.mmlabs.online` (Ming dashboard step). […] Work: T-011 → T-016.

Ticket goal: "The shared Postgres has a `tudocuatui` role + database, and the TuDo deploy gets a `DATABASE_URL` on
the Mac without any secret in the TuDo repo — the same way org-admin-api does."

Ticket scope: drafts in `deploy/deployment-repo/` (compose joins external `db`, reads
`env_file: ~/.config/tudocuatui/tudocuatui.env`; workflow writes `DATABASE_URL` from
`postgres/secrets/apps/tudocuatui.password` and runs a one-shot `migrate` before replacing the app), plus a Ming
runbook (new M-item) for the deployment-repo PR.

**Out of scope** (later tickets): the schema and migration runner (T-012), the API and its `/healthz` and
`/readyz` endpoints (T-013), the Node image, Dockerfile, `check-image.sh` and README "Deploy" (T-015). T-011 changes
no product code, no `src/`, no `supabase/`, and no `.github/workflows/` in the TuDo repo.

## Key design: no `migrate` run with the nginx image (consult risk R-b)
Fact: the deployment repo already pins a TuDo release. `apps/tudocuatui/release.env` exists and points at an
nginx-only image with no migration command. If the full compose (with a `migrate` service) lands while that
release is pinned, the next deploy runs `migrate` with the nginx image. That fails safely, but the run is red.
If the Node image lands without the new compose, it has no `DATABASE_URL` and no `db` network, so it fails
`/readyz` and is rolled back.

The fix splits the deployment-repo change into two pieces and makes the workflow decide from the compose file:

1. **Workflow guard keyed on the compose file.** After `pull`, the workflow sets `migrate=true` only if
   `docker compose … --profile migrate config --services` lists `migrate`. `backup` and `migrate` run only when
   `migrate=true`. `deploy` runs when `pull` succeeded and either `migrate` was not needed or it succeeded.
   - The nginx compose that is live today has no `migrate` service. The new workflow therefore deploys it exactly
     as before: it writes the env file, which is harmless and unused, and then runs `up`.
   - Once the Node compose is in place, the migrate path is always taken. Nothing in the image can switch it off.
     That avoids an image-label guard that a missing label could silently skip.
2. **Changing the workflow file does not trigger a deploy.** `deploy-tudocuatui` fires only on
   `paths: ["apps/tudocuatui/**"]`. So the workflow can ship in the postgres setup PR without starting a TuDo
   deploy, and without the concurrent `deploy-postgres` / `deploy-tudocuatui` runs of consult risks R-a and R-i.
3. **The compose change ships with the first Node release, in one merge.** `pr-scope` lets a
   `release/tudocuatui-vX.Y.Z` PR change anything under `apps/tudocuatui/`, and `compose.yml` is under it. Ming
   adds the new compose to the release PR that T-015's first release opens. One merge, one deploy:
   envfile → pull → backup → migrate → up.
   - If that release is unhealthy, the rollback's `git restore -- apps/tudocuatui` brings back **both** the nginx
     compose and the nginx `release.env`. The restore is consistent. The migrations are kept, and nginx does not
     care about them.

### Order of PRs
| # | Where | Branch | Contains | When | Triggers |
|---|---|---|---|---|---|
| 1 | TuDo repo | this ticket's branch | Drafts, README, M-12, D24 (this plan) | Now | CI only |
| 2 | deployment | `postgres/add-tudocuatui` (never `release/…`) | `add-app-db.sh tudocuatui` output (`postgres/secrets/apps/tudocuatui.password`, `postgres/config/databases`) + the new `.github/workflows/deploy-tudocuatui.yml` | After PR 1 is merged (M-12) | `deploy-postgres` only (creates role + DB; backups include it) |
| 3 | TuDo repo | T-012, T-013, T-015 | Schema and runner, API, Node image | Later | CI |
| 4 | deployment | `release/tudocuatui-vX.Y.Z` opened by TuDo `release.yml` for the first Node release | `release.env` (by the workflow) + `apps/tudocuatui/compose.yml` copied from the draft (Ming's extra commit) | After T-015 is merged and M-12 is done | `deploy-tudocuatui`: first migrate + Node deploy |

Any nginx release cut between PR 2 and PR 4 (for example a T-014 UI fix) still deploys normally through the guard.
PR 4's runbook belongs to T-015, which adds its own M-item. T-011's M-12 points to it.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "The drafts follow org-admin-api's pattern (env file outside the checkout, `migrate` profile, `db` + `web` networks, no published ports)." | Read `deploy/deployment-repo/apps/tudocuatui/compose.yml` beside `/home/user/deployment/apps/org-admin-api/compose.yml`. Check: an `x-app` anchor; `env_file: /Users/mingming/.config/tudocuatui/tudocuatui.env`; `tudocuatui` on `[tunnel, db]`; `migrate` with `profiles: [migrate]`, `restart: "no"` and `networks: [db]`; both networks `external: true` (`web`, `db`); `grep -n 'ports:\|volumes:' compose.yml` → nothing. Read the workflow beside `/home/user/deployment/.github/workflows/deploy-org-admin-api.yml`. Check: `DB_APP`/`ENV_FILE` env; job `if: github.ref == 'refs/heads/main'`; `envfile` step identical apart from the names and the `postgres://` scheme; `--profile migrate config --quiet` / `pull`; `backup`; `migrate` (`run --rm migrate`); `up -d --wait … tudocuatui`; rollback never migrates; notify has the migrate cases. Plus the guard described above. Both files parse as YAML: `node -e "require('yaml')"` is not a dependency, so use `python3 -c 'import sys,yaml; [yaml.safe_load(open(f)) for f in sys.argv[1:]]' <files>` if available. Otherwise review by eye and note it. |
| 2 | "No password or URL value in the TuDo repo (R3)." | `grep -rnE 'postgres(ql)?://[^%<$ ]*:[^%<$ ]*@' deploy/ work/ docs/ README.md` → no hit. The only URL in the drafts is the `printf` format `postgres://%s:%s@postgres:5432/%s`, and M-12 uses `<password>` placeholders. `grep -rnE '\b[0-9a-f]{48}\b' deploy/ work/ming-todo.md` → nothing. No `.env*` file is added (`git diff --name-only`). |
| 3 | "Runbook lists the exact deployment-repo steps." | `work/ming-todo.md` M-12 contains, in order: the branch name `postgres/add-tudocuatui` (with a warning not to use `release/`); `bash postgres/scripts/add-app-db.sh tudocuatui`; `git status` showing exactly the two postgres paths plus the workflow file; copying the workflow draft; the commit and PR; the merge and the green `deploy-postgres` log line `role and database 'tudocuatui' ready`; the read-only `psql` checks; not copying `compose.yml` yet (PR 4, T-015); and password rotation → redeploy. |
| 4 | (Ticket scope) the workflow does not run `migrate` while the nginx compose is live | Desk check in the review: with the current deployment `compose.yml` (no `migrate` service), the `pull` step outputs `migrate=false`, `backup` and `migrate` are skipped, `deploy` runs, and notify reports `deployed`. If the reviewer has Docker, `docker compose -f /home/user/deployment/apps/tudocuatui/compose.yml --profile migrate config --services` with `TUDOCUATUI_IMAGE=x` set prints only `tudocuatui`. With the draft compose (and a dummy env file path) it prints both. Otherwise reason from the compose spec. |
| 5 | Checks | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` are green. No source changes, so this is a regression check. |

## Ming verification after merge
- M-12 done: `deploy-postgres` is green and the two read-only `psql` queries return the DB and role. The
  `tudocuatui` line is in `~/srv/postgres/config/databases`.
- The next nginx release, if any, still deploys green through the new workflow. The run summary shows
  `migrate` and `backup` skipped. `~/.config/tudocuatui/tudocuatui.env` exists with mode 600 (check with
  `ls -l`; never `cat` it).
- The first migrate run is verified under T-015 (PR 4).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | Add `DB_APP: tudocuatui` and `ENV_FILE: /Users/mingming/.config/tudocuatui/tudocuatui.env`, and the job `if: github.ref == 'refs/heads/main'`. Keep the `TODO-operator` and `release` steps. Add an `envfile` step (copied from org-admin-api; `DATABASE_URL=postgres://%s:%s@postgres:5432/%s`). Split `deploy` into `pull` (profile `migrate` config + pull; output `migrate=true/false` from `config --services`), `backup` and `migrate` (both `if: steps.pull.outputs.migrate == 'true'`), and `deploy` (`up -d --wait --wait-timeout 120 tudocuatui`, `if: steps.pull.outcome == 'success' && (steps.pull.outputs.migrate != 'true' \|\| steps.migrate.outcome == 'success')`). In rollback, name the service in `pull` and `up` and never migrate. In notify, add `MIGRATE` cases (`success\|skipped` + `success` → deployed; `failure:*` → migrate-failed; the existing restore cases with any migrate value). Update the header comment (steps 1–6, expand-then-contract rule, guard explanation, "no GitHub secrets"). | Scope bullet 3 and AC 1; R-b guard |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Rewrite to the **Node target** shape. Header comment (Node server on :3000; env file written by the deploy; by-hand `run --rm migrate` then `up -d --wait tudocuatui`; "copy with the first Node release, PR 4"). `x-app` anchor with image + `env_file`. `tudocuatui` keeps `restart`, `cap_drop: [ALL]`, `no-new-privileges` and logging, with healthcheck `["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]` (interval 10s, timeout 5s, start_period 15s, retries 3) and networks `[tunnel, db]`. `migrate` uses `<<: *app`, `restart: "no"`, `profiles: [migrate]`, the same `cap_drop`/`security_opt`, `command: ["node", "server/migrate.js"]` (contract, A4) and `networks: [db]`. Networks `tunnel` (`web`) and `db` (`db`) are both external. | Scope bullet 2, AC 1 |
| `deploy/deployment-repo/README.md` | Add a "When" column to the table: workflow → PR 2 with M-12; compose → PR 4 with the first Node release (T-015), and why (R-b). Add the postgres step (`add-app-db.sh`, non-`release/` branch). Replace "The app has no secrets on the server" with: `DATABASE_URL` exists only in the host env file, written by the deploy from the deployment repo's password file, never in this repo or the image. Note that migrations must be expand-then-contract (rollback never un-migrates), password rotation → `workflow_dispatch` redeploy, and no `down -v` / volume removal (volume-safety). | Docs for the drafts; R3 statement is now wrong |
| `work/ming-todo.md` | Add **M-12 — Register the TuDo database (T-011, D23)** under Setup, with the exact steps (see Approach step 4). Add one line to M-4 noting that the D23 flow continues in M-12 and T-015. | AC 3 |
| `work/decisions.md` | Add **D24** (2026-11-10, after plan approval): the deployment split (workflow with the compose-keyed migrate guard in the postgres setup PR; compose with the first Node release); owner-for-both DB role for now, with a least-privilege runtime role as a follow-up; plain `postgres://` URL with no SSL; migrate command contract `node server/migrate.js`; readiness at `/readyz` on :3000. Record P1 as D25 **only** if Ming's approval note accepts it. | Records the approved assumptions (ticket "docs/decisions") |

The implementer must first diff the two drafts against `/home/user/deployment/apps/tudocuatui/compose.yml` and
`/home/user/deployment/.github/workflows/deploy-tudocuatui.yml`. If the live files differ from the drafts, start
from the live version and record the difference in `impl-log.md`. Never open `/home/user/deployment/postgres/secrets/`
or any `*.env` file, including `apps/tudocuatui/release.env`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None | No pure logic changes. The drafts are YAML/bash for another repo, checked by the review (AC 1–4) and by the real runs in M-12 and T-015. R8 unit tests do not apply. |

## Approach
1. **Workflow draft** (based on `deploy-org-admin-api.yml`, keeping TuDo's existing `TODO-operator` check and
   strict `vX.Y.Z` pattern). The `release` step is unchanged: no version-equality check is added (R7). In
   `envfile`, keep `umask 077`, the `$HOME/` guard, the `grep -Eq '^[A-Za-z0-9_-]{16,}$'` check, `read -r`,
   `install -d -m 700`, `mktemp` + `trap` + `chmod 600` + `mv -f`, and `printf` (a builtin, so the password is not
   in argv). Nothing prints the URL. Write the `pull` step as:
   ```bash
   compose=(docker compose -p "$PROJECT" -f "$APP_DIR/compose.yml" --env-file "$APP_DIR/release.env")
   "${compose[@]}" --profile migrate config --quiet
   "${compose[@]}" --profile migrate pull
   if "${compose[@]}" --profile migrate config --services | grep -qx migrate; then
     echo "migrate=true" >> "$GITHUB_OUTPUT"
   else
     echo "migrate=false" >> "$GITHUB_OUTPUT"
     echo "::notice::$APP_DIR/compose.yml has no migrate service (static release): backup and migrate skipped."
   fi
   ```
   `backup` and `migrate` use the org-admin-api error messages. Do not add `always()` anywhere except notify.
   In an `if:` without a status function, `success()` is implied, which keeps the failure chain intact.
2. **Compose draft**, as in the file table. Service name and port stay `tudocuatui:3000`, so the Cloudflare
   published app does not change. Add no `ports:`, no `volumes:`, and no `environment:` with values.
3. **README** of the drafts, as in the file table.
4. **M-12 runbook** in `work/ming-todo.md`. Prerequisite: T-011 is merged. Steps:
   1. In a clone of `mmlabs-online/deployment` on an up-to-date `main`, run
      `git switch -c postgres/add-tudocuatui`. The name must not start with `release/`, or `pr-scope` fails.
   2. Run `bash postgres/scripts/add-app-db.sh tudocuatui`. Expect `generated …/tudocuatui.password` and
      `added tudocuatui …`. On the Mac with Postgres running, it also creates the role now. Never `cat`, paste or
      print the password file.
   3. Copy `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` from TuDo `main` over the
      deployment repo's copy. **Do not copy `apps/tudocuatui/compose.yml` yet.** It goes in with the first Node
      release (T-015).
   4. Run `git status`. Exactly `postgres/config/databases`, `postgres/secrets/apps/tudocuatui.password` and
      `.github/workflows/deploy-tudocuatui.yml` changed. Then
      `git add postgres/config/databases postgres/secrets/apps/tudocuatui.password .github/workflows/deploy-tudocuatui.yml`,
      `git commit -m "postgres: add tudocuatui database; deploy-tudocuatui writes DATABASE_URL"`, push and open the
      PR. It is a private repo, and committing the password there is intended (deployment README, "Secrets").
   5. Merge. Only `deploy-postgres` runs, because no path under `apps/tudocuatui/` changed. Wait for green and the
      log line `role and database 'tudocuatui' ready`. If it fails in the `app databases` step, read which app
      failed (the loop stops at the first error).
   6. Verify on the Mac (read-only, no password involved):
      - `docker compose -p postgres -f ~/srv/postgres/compose.yml exec postgres psql -U postgres -tAc "select datname from pg_database where datname='tudocuatui'"` returns `tudocuatui`.
      - `… -tAc "select rolname, rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname='tudocuatui'"` returns `tudocuatui|f|f|f`.
      - `grep -x tudocuatui ~/srv/postgres/config/databases` matches.
   7. Later, with T-015: the first Node release PR also gets the `compose.yml` from the draft (T-015's M-item).
   8. Password rotation: change the file in the deployment repo (a `postgres/**` merge), then run
      `deploy-tudocuatui` with `workflow_dispatch` from `main` so the env file is rewritten.
5. **D24** in `work/decisions.md`.
6. Run the checks.

Rules: **R3** holds. No value of the password or URL appears in TuDo. `DATABASE_URL` is runtime-only, in a
host file outside the checkout, never `VITE_*`, never in the image. **R1** is unaffected, because no app code
changes. **R2** has no migration in this ticket, but see P1. **R7**: follow-ups are listed below, not
implemented. **R10** is not touched. The high-tier production deploy config is the reason for the plan-approval gate.

## Specialist input used
`consult-database-optimizer.md`:
- **Adopted:** R-1 runbook (branch name, `git add` scope, verification queries, rotation). Change: the workflow
  goes in the postgres PR and the compose goes in later. That still keeps postgres first, as R-1 step 5 and R-a
  intend, and it adds a fix for R-b.
- **Adopted:** R-2 compose shape (anchor, env file, networks, migrate profile, keep `cap_drop`/`no-new-privileges`,
  no ports or volumes, header update). Healthcheck uses `/readyz` through Node's `fetch`, because `wget` may not
  exist in a Node base image.
- **Adopted:** R-3 workflow steps and all listed pitfalls (`$HOME` guard, atomic `mv`, `printf` builtin, rollback
  never migrates, migrate-failed notify, `postgres://` scheme). Added the compose-keyed guard.
- **Adopted as assumptions/follow-ups:** R-4 owner-for-both, R-5 pool size (for T-013), R-6 contract (for T-012/T-013).
- **Not adopted:** `ALTER ROLE … CONNECTION LIMIT` (outside the shared scripts, as the consult also says);
  `read_only: true` (R7).
- **Answers to the consult's open questions:** Q1, yes (R-b, handled by the guard and the split). Q2, A4.
  Q3, A5. Q4, A3. Q5, P1. Q6, A1.

## Assumptions
Defaults for Ming to confirm at plan approval:
- **A1. Two deployment PRs, not one** (plus the TuDo PR). PR 2 = postgres registration + workflow. PR 4 = compose
  inside the first Node release PR. A single combined PR would either run `migrate` with the nginx image (R-b) or
  race `deploy-postgres` (R-a, R-i).
- **A2. Compose-keyed migrate guard** in the workflow, permanent and not removed later. It is a no-op once the
  Node compose is live. The alternative, an image label, could skip migrations silently, so it was rejected.
- **A3. One owner role for both the app and `migrate`** (what `add-app-db.sh` / `app-db.sql` give, same as
  org-admin-api). Mitigations: pre-migration and nightly dumps, parameterised queries only, no DDL in the API.
  **Follow-up:** a least-privilege runtime role (`tudocuatui_app`, DML only via `ALTER DEFAULT PRIVILEGES`). It needs
  changes to the deployment repo's shared scripts, so it needs Ming's go-ahead and is not part of T-011.
- **A4. Migrate command contract: `command: ["node", "server/migrate.js"]`**, run in the image's working directory
  (expected `/app`). It is one-shot, exits non-zero on failure, uses `DATABASE_URL` from the env, has no SSL, and is
  idempotent with an applied-migrations table. T-012 builds the runner to match. T-015 puts it at that path. If either
  needs a different path, that ticket updates `compose.yml` in the draft, which is still before PR 4, so it is safe.
  No `TODO-operator` placeholder is used, because the contract is fixed now.
- **A5. Health: same process serves SPA + `/api` on :3000**, service name `tudocuatui`, so the Cloudflare target is
  unchanged. The compose healthcheck probes **`/readyz`** (200 only when `select 1` succeeds), as in T-013's scope
  and org-admin-api. `/healthz` stays liveness-only for T-013. The probe uses `node -e fetch(...)` so no `wget`/`curl` is needed.
- **A6. `DATABASE_URL=postgres://tudocuatui:<pw>@postgres:5432/tudocuatui`**, plain, with no `sslmode` (the `db`
  network is internal and Postgres has no TLS). Pool `max: 5` is T-013's concern (consult R-5).
- **A7. Env file path** `/Users/mingming/.config/tudocuatui/tudocuatui.env`. It is absolute because compose does not
  expand `~`. Org-admin-api uses the same layout.
- **A8. M-12 is the new M-item.** T-015 should list `Needs Ming: M-12` (orchestrator to set). T-012 does not need
  it, because CI uses its own Postgres 17.
- **A9. Hotspots:** `work/ming-todo.md` and `work/decisions.md` are shared with every ticket. The two drafts will be
  edited again by T-015 (Dockerfile-dependent details). No other open ticket touches `deploy/`.

**P1 — proposed wording for amending R2** (Ming decides. This is not decided here, and it does not block T-011,
but it **blocks T-012**, whose scope already says "without … RLS policies"):
> **D25 (proposal):** For the self-hosted Postgres backend (D23), R2 reads: "**Schema changes are a new SQL file in
> the TuDo migrations folder, applied only by the `migrate` one-shot service; never edit an applied migration. The
> database is reachable only from the `db` network by TuDo's own role; the browser never talks to Postgres. While
> the app is single-user without login (D23), tables do not use RLS; when in-app auth or a second user arrives,
> every table gets a `user_id` and RLS (`ENABLE` + `FORCE ROW LEVEL SECURITY`) in the same migration that adds
> them.**" The Supabase migrations keep the old R2 until T-016 removes them. CLAUDE.md's R2 row is updated by
> Ming (or with his approval) once accepted.

Alternative for Ming: keep R2 as it is and require `ENABLE` + `FORCE ROW LEVEL SECURITY` with a permissive
single-user policy on every table now. That gives no real protection with one owner role, but it keeps the rule
uniform.

## Blocking questions
None for T-011. P1 must be answered before T-012 is planned.

## Split proposal
None. About 150 changed lines, all drafts, docs and backlog files.

### Follow-ups (not in this diff, R7)
- Least-privilege runtime role (A3). Needs a change to the deployment repo's shared `add-app-db.sh` / `app-db.sql`.
- T-012: the runner honours A4 and stays expand-then-contract compatible (rollback never un-migrates). Test
  against PG 17. No superuser-only extensions.
- T-013: `/readyz` with `select 1`. No migrate on startup. Pool `max: 5`, no SSL. Consider validating the
  Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) as defence in depth (consult R-e).
- T-015: runbook M-item for PR 4 (copy `compose.yml` onto the release branch before merging). Set
  `Needs Ming: M-12`.
- CLAUDE.md R2 row text, once P1 is decided.
