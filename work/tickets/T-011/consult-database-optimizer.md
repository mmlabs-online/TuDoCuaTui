# Consult — database-optimizer — T-011 (2026-11-10)

I read all the listed reference files except anything under `postgres/secrets/` and `.env`. Paths are in the deployment clone at `/home/user/deployment` unless noted.

## Findings

**1. Registering the app DB**
- `bash postgres/scripts/add-app-db.sh tudocuatui` can run anywhere. It needs no Mac and no running Postgres.
  - The name matches `^[a-z][a-z0-9_]{0,62}$` and is not reserved, so `tudocuatui` is valid.
  - It generates `postgres/secrets/apps/tudocuatui.password` if missing and never overwrites it. The value is `openssl rand -hex 24`, i.e. 48 hex characters, which is URL-safe.
  - It appends `tudocuatui` to `postgres/config/databases`. That file currently lists `calechip`, `ricotdin` and `org_admin`.
- The password is committed to the private deployment repo on purpose (README, "Secrets"). Whoever runs the script must commit `postgres/secrets/apps/tudocuatui.password` and `postgres/config/databases` together.
  - The password never enters the TuDo repo, so R3 holds. The TuDo repo may only mention the file path.
- **Who runs it:** Ming, or an agent with write access to the deployment repo. It is not a CI step. Our consult clone is read-only, and the TuDo repo only holds drafts in `deploy/deployment-repo/`. So this is a Ming runbook item, as the ticket says.
  - Branch name: use a non-`release/` name such as `postgres/add-tudocuatui`, for example `git add postgres/secrets postgres/config`, commit `postgres: add tudocuatui database`.
- **pr-scope does not restrict it.** `.github/workflows/pr-scope.yml` only applies to heads matching `^release/<app>-(v[0-9]|sha-<7hex>)`. Any other branch gets "no scope rule applies".
  - A branch named `release/tudocuatui-...` that touches `postgres/` would FAIL pr-scope. Do not name the setup branch that way.
- **Two separate PRs, or one setup PR.**
  - Ordinary release PRs (`release/tudocuatui-vX.Y.Z`) may change only `apps/tudocuatui/`. So the compose and workflow edits cannot ride on a release PR.
  - The setup PR (non-release branch) may carry `postgres/` + `apps/tudocuatui/compose.yml` + `.github/workflows/deploy-tudocuatui.yml`.
  - Merge order matters, see Risks R-a.
- **How it gets applied.** A merge touching `postgres/**` triggers `deploy-postgres.yml`.
  - Its `host` step fails if `postgres/secrets/apps/<app>.password` is missing for any listed app.
  - The `publish` step rsyncs to `~/srv/postgres`.
  - `deploy` runs `up -d --wait`, a no-op because the config is unchanged.
  - The `app databases` step runs `add-app-db.sh` for every listed app on the live instance, creating the role and DB.
  - The init scripts only run on an empty volume and are not relevant.
- **Backup inclusion is automatic.** `pg-backup` reads `config/databases` (`POSTGRES_DB_FILE`) on every run. Nightly dump at 02:00 as custom format, retention 7 days, 4 weeks and 6 months. No restart is needed.
  - There is no per-app backup config to add.
  - First dump of the new DB is the next 02:00 run, or the pre-migration `/backup.sh` step in deploy.

**2. What `app-db.sql` gives the role**
- `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.
- Owner of database `tudocuatui` and of schema `public`.
- `CONNECT` is revoked from PUBLIC on all databases, so the role can reach only its own DB.
- No connection limit is set on the role or database (no `CONNECTION LIMIT` or `max_connections` anywhere in the repo, so the Postgres default of 100 applies).

**3. Existing deploy and compose pattern (org-admin-api)**
- `env_file` is an absolute path outside the checkout (`/Users/mingming/.config/org-admin-api/org-admin-api.env`). The runner's checkout deletes untracked files.
- The compose file uses a YAML anchor `x-app`. The `migrate` service has `profiles: [migrate]`, `restart: "no"` and `networks: [db]` only.
- The app service is on `[tunnel, db]`. `tunnel` is the external network `web`, and `db` is the external network `db`.
- The deploy order is: release check, envfile, `config --quiet` and `pull` (with `--profile migrate`), pre-migration backup via `docker compose -p postgres -f $HOME/srv/postgres/compose.yml exec -T pg-backup /backup.sh`, `run --rm migrate`, `up -d --wait <svc>`.
- A failed migrate leaves the old container running.
- Rollback only restores the image. It never un-migrates, so migrations must be expand-then-contract.

**4. Current TuDo drafts**
- The TuDo draft compose has one service on `[tunnel]` only. It uses `cap_drop: [ALL]` and `no-new-privileges`.
- The draft workflow has a single `deploy` step that runs `pull` then `up -d --wait`. It has no envfile, backup or migrate step.

## Recommendations

**R-1. Runbook for the new M-item (acceptance criterion 3)**
1. In the deployment repo, create branch `postgres/add-tudocuatui`. It must NOT start with `release/`.
2. Run `bash postgres/scripts/add-app-db.sh tudocuatui`.
3. Run `git add postgres/secrets postgres/config`. Check that only the two expected paths changed, then commit.
   - Never paste or print the password file.
4. In the same PR, copy the drafts for `apps/tudocuatui/compose.yml` and `.github/workflows/deploy-tudocuatui.yml`.
5. **Merge ordering.**
   - If the PR touches both `postgres/**` and `apps/tudocuatui/**`, `deploy-postgres` and `deploy-tudocuatui` fire concurrently. They use different concurrency groups.
   - `deploy-tudocuatui` skips with a notice if there is no `release.env`, so it is harmless without a release. But it does not wait for the DB, and the DB role may not exist yet when the envfile step runs.
   - Safest is two PRs. Merge the postgres PR first and watch `deploy-postgres` go green (log line `role and database 'tudocuatui' ready`). Then merge the compose and workflow PR.
   - After that, the first `release/tudocuatui-vX.Y.Z` PR runs migrate for the first time.
6. Verify, with no passwords printed:
   - `docker compose -p postgres -f ~/srv/postgres/compose.yml exec postgres psql -U postgres -tAc "select datname from pg_database where datname='tudocuatui'"`
   - `docker compose -p postgres -f ~/srv/postgres/compose.yml exec postgres psql -U postgres -tAc "select rolname, rolconnlimit from pg_roles where rolname='tudocuatui'"`
   - Confirm `tudocuatui` appears in `~/srv/postgres/config/databases`.

**R-2. Compose changes (`apps/tudocuatui/compose.yml`, mirroring org-admin-api)**
- Add `env_file: /Users/mingming/.config/tudocuatui/tudocuatui.env`. Use an `x-app` anchor shared by the web and migrate services. Keep a comment that if the file is missing, `config` fails and nothing starts.
- Web service networks: `[tunnel, db]`. Add the external `db` network (`name: db`).
- Add `migrate`. It has `profiles: [migrate]`, `restart: "no"`, `networks: [db]` only, and a `command` that runs the TuDo migration runner.
  - It uses the same image, so T-012/T-013 must ship the migration tool and the SQL in the image (see Open questions).
- Service name and Cloudflare target:
  - The existing service is named `tudocuatui` with `healthcheck` on 3000 and Cloudflare target `http://tudocuatui:3000`.
  - If the Node API serves the SPA from the same process on 3000, nothing changes.
  - If the port or health path changes, update the Cloudflare published app and the healthcheck together. Healthcheck options: `wget --spider /` works only if the API serves `/`. Better to add `/healthz` or `/readyz` that also does `select 1`, like org-admin-api's `/readyz`.
- Keep `cap_drop: [ALL]` and `no-new-privileges`. They are fine for Node. Consider `read_only: true` with a tmpfs `/tmp` later, but do not add it to this ticket's diff (R7).
- No `ports:`, no volumes (DB data lives in the shared `pgdata`; the Drive-photos chain stores nothing locally).
- Update the file header comment, which currently says "no secrets" and "Static nginx".

**R-3. Workflow changes (`deploy-tudocuatui.yml`)**
Add these steps after `release`, mirroring org-admin-api, with the same `if:` chain:
- Add job env: `DB_APP: tudocuatui` and `ENV_FILE: /Users/mingming/.config/tudocuatui/tudocuatui.env`.
- `envfile` step: same as org-admin-api. Read the password with `read -r`, use `umask 077`, `install -d -m 700`, `mktemp` in the target dir, `chmod 600` and `mv -f`.
- DATABASE_URL format: `printf 'DATABASE_URL=postgres://%s:%s@postgres:5432/%s\n' "$DB_APP" "$pw" "$DB_APP"`. It is a plain `postgres://` URL, not `postgresql+asyncpg://`. The pw is URL-safe by construction.
- `pull` step: run `"${compose[@]}" --profile migrate config --quiet` and `--profile migrate pull`.
- `backup` step: `docker compose -p postgres -f "$HOME/srv/postgres/compose.yml" exec -T pg-backup /backup.sh`.
- `migrate` step: `"${compose[@]}" run --rm migrate`.
- `deploy` step: change to `up -d --wait --wait-timeout 120 tudocuatui`, naming the service so `up -d` cannot start migrate.
- `rollback` step must also gain `--profile`-free commands. Keep it `pull tudocuatui` and `up -d --wait tudocuatui`, never migrate.
- `notify` step: add the `MIGRATE` outcome case as in org-admin-api (`failure:*` => migrate-failed).
- The current `pull` step runs bare `pull` and `up -d --wait`. With the profile defined, bare `up` starts only non-profile services, which is fine. Still, name the service explicitly.
- Keep the existing guard `grep TODO-operator`.

**Pitfalls in org-admin-api's approach (check them in the copy)**
- `if: steps.envfile.outcome == 'success'` on `pull`, but `backup`, `migrate` and `deploy` chain on `.outcome == 'success'` of the previous step. This is correct, but if the `release` step skipped, `envfile` is skipped, and `pull` and the rest are skipped too. Fine. Do not add `always()` or `failure()` conditions without keeping this chain.
- `envfile` runs on every deploy, not only when the password changes. Rotating the password in the deployment repo requires a `postgres/**` merge and then a redeploy of tudocuatui (`workflow_dispatch`). Otherwise the app keeps the stale URL. Put this in the runbook.
- The rollback `git restore` only reverts `apps/tudocuatui/`. Therefore migrations must remain backward compatible with the previous image. State this rule in T-012.
- The notify step posts the PR comment with `gh pr comment`. It contains the image tag only, no secret. Do not add DATABASE_URL to any `echo`, `set -x` or step summary.
- `ENV_FILE` guard `[[ "$ENV_FILE" == "$HOME/"* ]]` is there on purpose. Keep it.
- The `trap rm -f "$tmp"` plus `mv` is atomic. Good, keep it.
- Passwords: the `printf` with `%s` puts the password in the shell, not in argv, since `printf` is a builtin. Do not replace it with `echo` via `sh -c` or `envsubst` with the value in argv.
- The password also sits in the checkout of the runner (read-only use). That is by design for this private repo (README says so). Flag it, but do not fight it.
- The `migrate` service inherits the whole env file, so it has the same URL as the app (see the privilege point below).

**R-4. Privileges: owner for the app, or a split role?**
- The tooling provides one role per app, which owns the DB and `public`. Both `migrate` and the app use it, and org-admin-api does the same.
- For a single-user, no-login, Cloudflare-Access-protected app, the pragmatic answer is to accept owner-for-both for T-011. A split role needs a second password file and changes to the shared `add-app-db.sh` and `app-db.sql`, which cannot be done in this ticket (R7, and it would touch shared infrastructure for every app).
- The real risk of owner-for-both is that a SQL injection or bug in the API could `DROP TABLE` or alter schema. The mitigations are:
  - The nightly dump and pre-migration dump, so data loss is bounded to 24h plus the migration dump.
  - Parameterised queries only (T-012).
  - No DDL in the API code path.
- Record this as a follow-up ("least-privilege runtime role: a second role `tudocuatui_app` with DML only, via an `ALTER DEFAULT PRIVILEGES` in the migrations") rather than blocking on it. If Ming wants it, it needs changes in the deployment repo's shared script, so ask first.
- Do not add `GRANT`s or `CREATE ROLE` inside TuDo migrations without a decision. The app role has `NOCREATEROLE`, so it cannot create roles anyway.
- RLS: R2 says every table needs RLS. With a single DB owner role and no Supabase `auth.uid()`, RLS gives no protection (the owner bypasses it unless `FORCE ROW LEVEL SECURITY`). This conflicts with the CLAUDE.md rule and must be settled in T-012. It is not this ticket's problem, but flag it.

**R-5. Connection limits and pooling**
- Default `max_connections` is 100, shared by calechip, ricotdin, org_admin, tudocuatui and the pg-backup sidecar. TuDo is one small Node process.
- Set the client pool small: `max: 5` (pg `Pool`), `idleTimeoutMillis` about 30000, `connectionTimeoutMillis` about 5000. The `migrate` run adds one connection for a short time.
- There is no PgBouncer and none is needed. Do not use Supabase's port 6543 trick (the example in the generic guidance does not apply here).
- Optional hardening in the deployment PR: `ALTER ROLE tudocuatui CONNECTION LIMIT 10`. But `add-app-db.sql` re-runs `ALTER ROLE ... WITH ...` without a conn limit clause, so a manual limit would persist (not reset). Still, it is outside the scripts, so skip it and note it.

**R-6. What T-012 and T-013 must assume**
- Database `tudocuatui`, role `tudocuatui`, host `postgres`, port 5432, only reachable from containers on the `db` network.
- `DATABASE_URL=postgres://tudocuatui:<48 hex chars>@postgres:5432/tudocuatui`. The password is URL-safe, so no escaping is needed.
- **No SSL.** The `db` network is `--internal` and Postgres has no certificates. With `node-postgres`, do not set `ssl: true`, and do not append `?sslmode=require`. If the URL carries `sslmode` the pg driver may try TLS and fail. Use the default (no SSL).
- Env var name is exactly `DATABASE_URL`, delivered only through `env_file` at runtime. It is never in the image, never in `VITE_*` (R3), never baked at build.
- Local dev and CI cannot reach `postgres:5432`. They need their own throwaway Postgres (for example a `postgres:17` service container or Docker locally). Local mode (R1) still works without `DATABASE_URL`.
- The Postgres major version is 17, so test migrations against 17.
- The migration runner must be one-shot, idempotent, and track applied versions in a table (for example `schema_migrations`). It runs as the DB owner, so it can `CREATE EXTENSION` only for trusted extensions. `gen_random_uuid()` is built in since PG 13, so no `pgcrypto` is needed. Avoid extensions that need superuser.
- The migrate command must exit non-zero on failure. The deploy relies on that to leave the old release running.
- The API must not migrate on startup.

## Risks
- **R-a. Ordering.** If the compose and workflow change merges before the DB exists, the next release's envfile step reads a missing password file (it fails with a clear error and starts nothing), or migrate fails with a connection or auth error, since the role does not exist. Both are safe failures, but red. Mitigate by merging the postgres PR first.
- **R-b. A stale `release.env` pins an old nginx-only image.** If a release already exists on main (`apps/tudocuatui/release.env` from T-007) when the new compose lands, the deploy would run `migrate` with the old static-nginx image, which has no migration command. That fails the deploy before replacing the app (safe, but a red run). Either wait until the first Node-API release, or ensure no `release.env` exists, or guard migrate on the image. The first release after this change must be the new image.
- **R-c. Unpinned secrets in a private repo.** The password is readable by every token with read access to the deployment repo (e.g. `DEPLOY_REPO_TOKEN`). The data is personal wardrobe data and low-sensitivity, so accept it. Do not reuse that password anywhere else.
- **R-d. Single role owns everything.** See R-4.
- **R-e. Cloudflare Access is the only gate** now that there is no in-app login (D23). The API endpoints are reachable by anything that gets through cloudflared, or by any container on the `web` network, including other apps. Mitigation: do not publish a port, and keep the API off the `db` network's attack surface. The web service is on both `web` and `db`, so a compromised container on `web` could reach TuDo's API but not Postgres directly. Consider a shared-secret header check or service-token validation (Cloudflare Access JWT) in T-012 as defence in depth. This is not strictly this ticket's scope.
- **R-f. Backup is nightly, not continuous.** A bad deploy that destroys data between 02:00 runs is covered only by the pre-migration dump. Fine for this app.
- **R-g. First-run partial init.** If `deploy-postgres` fails in the `app databases` step for some other app (the loop is `set -e`, so one failure stops the rest), the new DB may not be created. Check the log.
- **R-h. Password rotation drift.** See pitfalls above.
- **R-i. Concurrency.** `deploy-postgres` and `deploy-tudocuatui` have different concurrency groups and can overlap on a combined PR. See R-1 step 5.

## Open questions
1. Is a release already pinned in the deployment repo for tudocuatui (`apps/tudocuatui/release.env`)? If so, R-b applies.
2. Which command will T-012 give `migrate` (the Node migration runner, and where in the image)? The compose draft needs the exact `command`. Suggested placeholder: `["node", "dist/server/migrate.js"]`, to be confirmed in T-012.
3. Does the API serve the SPA on the same port (3000), and what is its health endpoint (`/healthz` with `select 1`)? This changes the compose healthcheck and the Cloudflare target.
4. Accept owner-for-both for now (recommended, with a follow-up for a lesser runtime role), or does Ming want a split role now? The latter means changing the shared deployment scripts.
5. RLS (R2) with a single owner role and no auth: should R2 be amended in `work/decisions.md` for the D23 backend (or `FORCE ROW LEVEL SECURITY` plus a fixed app-level setting)? To be decided before T-012 writes the schema.
6. Should the setup be two PRs (postgres first, then compose and workflow) or one? Recommend two, as in R-1.

Files read (absolute): /home/user/TuDoCuaTui/work/tickets/T-011/ticket.md; /home/user/TuDoCuaTui/deploy/deployment-repo/apps/tudocuatui/compose.yml; /home/user/TuDoCuaTui/deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml; /home/user/deployment/postgres/compose.yml; /home/user/deployment/postgres/scripts/add-app-db.sh; /home/user/deployment/postgres/sql/app-db.sql; /home/user/deployment/postgres/init/10-app-dbs.sh; /home/user/deployment/postgres/init/00-lockdown.sql; /home/user/deployment/postgres/config/databases; /home/user/deployment/apps/org-admin-api/compose.yml; /home/user/deployment/.github/workflows/deploy-org-admin-api.yml; /home/user/deployment/.github/workflows/deploy-postgres.yml; /home/user/deployment/.github/workflows/pr-scope.yml; /home/user/deployment/README.md (Postgres section).

Not read: `volume-safety.yml` and `ops/backup/*`, because `backup.env` and `rclone.conf` are config with secrets and the backup sidecar's behaviour is fully defined in `postgres/compose.yml`. The "no volume deletion" rule applies to any new workflow (`ops/check-volume-safety.sh`): do not add `down -v` or `volume rm/prune` to the TuDo deploy. `docker compose run --rm migrate` is fine because it removes the container, not volumes.
