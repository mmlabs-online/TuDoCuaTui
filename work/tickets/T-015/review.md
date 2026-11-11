## Attempt 1 — 2026-11-11
Verdict: PASS

Reviewed `git diff origin/main...HEAD` on `claude/loving-fermi-t90upb` (through `daae576`) against plan.md, using the
plan as Ming approved it: A1 option A (keep `VITE_SUPABASE_*`), A2 manual M-14, A3, A4 DB smoke in CI, A5–A15 as
written. No `.env*`, `release.env` or `postgres/secrets/` file was read.

### Checks (run by reviewer)
- typecheck: exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`).
- format:check: "All matched files use the correct format." (157 files).
- test: 585 passed, 42 skipped (627). The DB tests skip because `DATABASE_URL` is unset. This matches impl-log.
- build: green (`✓ built`).
- Image (reviewer's own build): dockerd was already running. I built from a scratch Dockerfile that is the repo
  `Dockerfile` with two lines added only after `FROM … AS build` and `FROM … AS prod-deps`: `COPY --from=ca` of the
  proxy CA and `NODE_EXTRA_CA_CERTS`/`npm_config_cafile`. `diff` shows the runtime stage is unchanged. Built with
  `--network host`.
  - `tudo:review` (local mode): `bash scripts/check-image.sh tudo:review` printed every section (`no secrets`,
    `image config`, `layout`, `bundle mode`, `version`, `start checks`, `smoke`) and ended in `image ok`, exit 0.
  - `tudo:review-sb` (dummy Supabase build args + `VITE_APP_VERSION=v0.0.0`, the CI second build):
    `EXPECTED_VERSION=v0.0.0 bash scripts/check-image.sh tudo:review-sb https://ci-dummy.invalid` ended in
    `image ok`, exit 0. The implementer had not run this path.
  - DB smoke: a system PG16 cluster was already on :5432 and already migrated by the implementer's run, so its first
    migrate printed `up to date`. I started a fresh PG16 cluster (`initdb --auth=scram-sha-256`, data dir under /tmp)
    on :55432 and ran `CHECK_IMAGE_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres`. Output:
    `== db smoke` → `applied 20261110120000_init`, the second run printed `up to date`, `/readyz` returned 200,
    `/api/locations` returned 401, and the run ended in `image ok`. With a wrong password the run printed
    `migrate failed: cannot connect to the database (DATABASE_URL not printed) [28P01]` and
    `::error::db smoke: migrate failed inside the image`, exit 1. Afterwards I stopped the cluster, deleted its
    directory, and removed the scratch images. The system cluster was not touched.
  - Negative tests, to show that the new checks fail loudly:
    - `EXPECTED_VERSION=v1.2.3` → `::error::version.txt is 'dev'…`.
    - Image + `ENV TUDO_ACCESS_DISABLED=1` → `::error::image env must set exactly NODE_ENV=production…`.
    - Image + `/app/server/test` → `::error::image layout is wrong…`.
    - Image + an always-failing `HEALTHCHECK` → `::error::image HEALTHCHECK is 'unhealthy'…`.
  - Inside the image: `id` = `uid=1000(node)`. `/app/{db,dist,node_modules,package.json,server}` are owned by
    root. `/app/server` has no tests.
- CI: no Actions run exists yet for the T-015 commits, because the branch's last PR (#32) is merged and the next PR
  is not open. Plan AC 1(a) accepts the local `docker build` + `check-image.sh` → `image ok` run as evidence, and
  that run is above. The CI `image` job will run on the PR.

### Acceptance criteria
- [x] "CI builds and checks the new image; release flow unchanged otherwise." Evidence:
  - CI: the `image` job adds a `postgres:17` service and passes `CHECK_IMAGE_DATABASE_URL` to the first check only
    (`.github/workflows/ci.yml:57-64,90-92`). The build steps and both `check-image.sh` calls are kept. The `ci` job
    is untouched.
  - Release flow: the `release.yml` diff is only the header comment (`release.yml:7-8`) and the PR body text
    (`release.yml:158`). The trigger, guards, `check-public-supabase-env`, `platforms: linux/amd64`, build args,
    `docker pull` + `check-image.sh "$ref" ${SUPABASE_URL:+…}` (`:127-128`) and the only-`release.env` guard are
    unchanged.
  - The image checks pass locally (see Checks).
- [x] "Image has no secrets; DB URL only at runtime from the env file." Evidence:
  - The runtime stage (`Dockerfile:35-49`) has no `ARG` and only `ENV NODE_ENV=production`. `check-image.sh:62-65`
    enforces exactly that set. The existing `VITE_`/secret/`.env*`/source-map checks run with `ROOT=/app/dist`
    (`check-image.sh:17`) and passed.
  - `DATABASE_URL` and `TUDO_ACCESS_DISABLED` appear in the Dockerfile and the compose only in comments
    (`Dockerfile:3-4`, `compose.yml:10,17`). In compose the URL comes only from `env_file:` (`compose.yml:31`).
    `environment:` holds only `NODE_ENV` and the two M-13 values (`compose.yml:36-39`), which match the ticket Notes
    exactly.
- [x] Goal: :3000, non-root, `node server/index.js`. Evidence: `Dockerfile:44-49` and `check-image.sh:49-61`
  (Cmd, ExposedPorts). The non-root check passed. Smoke: `/healthz` returned 200 and Docker health reached `healthy`
  (`check-image.sh:142-149`).
- [x] Goal: deploys with the DB env file and the `migrate` step. Evidence:
  - `compose.yml:31` has `env_file: /Users/mingming/.config/tudocuatui/tudocuatui.env`, the same as `ENV_FILE` in
    `deploy-tudocuatui.yml`. The `migrate` service has `command: ["node","server/migrate.js"]`, `networks: [db]` and
    `profiles: [migrate]`.
  - `docker compose --profile migrate config --services` lists `migrate` and `tudocuatui`, so the workflow's
    `grep -qx migrate` guard takes the backup → migrate path.
  - The in-image migrate was proven against a fresh PG16 (see Checks).
- [x] Scope: README "Deploy", the D20 notes and M-4/M-10 are superseded. Evidence:
  - `README.md:47-55` (Node server, env file, Access, migrate, first release M-14, rollback, troubleshooting) and
    the code-map rows `README.md:140-141`.
  - `work/decisions.md` has D26, records A1–A4, and prefixes the D20 row.
  - `work/ming-todo.md` has M-14 (lines 126-146). M-4 (line 37) and M-10 (line 62) carry superseded notes; neither
    is ticked or deleted.
- [x] Checks: all four are green (see above).

**Compose draft vs live deployment** (`/home/user/deployment`, branch `postgres/add-tudocuatui` = PR #38):
- `.github/workflows/deploy-tudocuatui.yml` is byte-identical to `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`.
- Networks: `tunnel` → external `web`, the same as the live nginx compose. `db` → external `db`, the same as the
  `postgres/compose.yml:110-114` network (`--internal`), and the service host is `postgres`, matching the URL the
  workflow writes.
- Healthcheck: `/readyz` with `AbortSignal.timeout(3000)` inside the 5 s timeout, which matches the workflow's
  `up -d --wait`.
- The live `apps/tudocuatui/compose.yml` on deployment `main` is still the nginx compose, as expected before M-14.

**M-14 runbook**: I checked each step against the deployment repo and found no blocking error.
- Step 1: `release/v*` is the trigger (`release.yml:23`). The latest tag is `v0.1.4`, so `v0.2.0` fits.
- Step 3: `pr-scope` (volume-safety.yml "changes stay in the app's folder") allows any file under
  `apps/tudocuatui/` on a `release/tudocuatui-v…` branch. `commit -am` picks up the tracked compose.
- Step 4: one push. The workflow restores `$APP_DIR` as a whole from `$BEFORE`, so compose and `release.env` roll
  back together, and step 7 describes that correctly.
- Step 6: `/api/locations` exists (`server/api.js:13,78`). Cloudflare Access injects `Cf-Access-Jwt-Assertion` at
  the edge, so a signed-in browser should get 200.
- Prerequisites: T-015 merged, M-11, M-12, M-13. They are listed, and M-12 is what puts the workflow and the DB on
  `main`.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no `src/**` change, and local mode is untouched.
- R3: no secret in the image. The checks enforce this, and I verified it.
- R7: every changed file is in the plan's file table, plus the ticket workflow files.
- R8: checks are green. There is no new pure logic; the image checks act as tests.
- R10: `vite.config.ts`, `.figma/` and `AGENTS.md` are untouched.
- R2, R4, R5, R6 and R9: not applicable.

### Nits (do not block)
- Plan AC 2 says `grep DATABASE_URL Dockerfile` should give "no hit". There are hits, but only in explanatory
  comments (`Dockerfile:3-4`), and the plan itself asks for the matching compose warning. The intent is met.
- `work/ming-todo.md:138` says "`pull` reports `migrate=true`". The step only writes that to `GITHUB_OUTPUT`; the
  visible sign is that the `backup`/`migrate` steps run instead of being skipped. Consider rewording.
- impl-log says the `.env*` find had "no hits" and that A12 was not compared. Both are fine; the comparison is done
  above.
- `check-image.sh:102` (`expect_exit`): if `timeout` fires, the unnamed container is orphaned (security note 2).
- The secret scans fail open if `docker run` itself errors (security note 1; this pattern already existed).

### Follow-ups (out of scope)
- These are as in the plan:
  - `release.yml` compose automation (A2 alternative).
  - Move the SPA packages to `devDependencies` (A9).
  - Add `server/**`, `db/migrations/**` and `deploy/**` to `risk-tiers.yml`.
  - Update the CLAUDE.md Hosting/R2 rows (Ming).
  - T-016: remove `VITE_SUPABASE_*`.
- Security-review notes 1–6: exit-code capture in the secret scans, naming the `expect_exit` containers, asserting
  the stderr text, `read_only`/`pids_limit`/`mem_limit` in compose, and `--env-file` in the README local run.
