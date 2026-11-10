## Attempt 1 — 2026-11-10
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit`) exit 0, no output.
- format:check: "All matched files use the correct format." (129 files).
- test: Test Files 41 passed (41), Tests 488 passed (488). Matches impl-log.
- build: `vite build` OK ("built in 388ms").
- Extra: both drafts parse with `python3 yaml.safe_load`. `git diff origin/main...HEAD` has no `src/`, `supabase/`, `.github/` (TuDo) or `.env*` changes.
- Extra: the guard was tested with `docker compose config` (Compose v5.6.1, no daemon needed), `TUDOCUATUI_IMAGE=x`:
  - live `/home/user/deployment/apps/tudocuatui/compose.yml` `--profile migrate config --services` → `tudocuatui` only, so `migrate=false`
  - draft (env_file pointed at a dummy file) `--profile migrate config --services` → `tudocuatui`, `migrate`, so `migrate=true`. Without the profile → `tudocuatui` only (`up -d` never starts migrate)
  - draft with the env file missing: `config --quiet` exit 1 ("env file … not found"), so a missing env file stops the run in `pull` as the header says.
- Baseline: the TuDo drafts on `origin/main` are byte-identical to the live deployment-repo files (compose and workflow), so impl-log's statement "live = drafts" is confirmed.

### Acceptance criteria
- [x] Drafts follow org-admin-api's pattern (env file outside the checkout, `migrate` profile, `db` + `web` networks, no published ports). Evidence:
  - compose `deploy/deployment-repo/apps/tudocuatui/compose.yml`:
    - `x-app` anchor with image + `env_file: /Users/mingming/.config/tudocuatui/tudocuatui.env` (:25-27)
    - app `networks: [tunnel, db]` (:53) with the `/readyz` healthcheck (:41-51)
    - `migrate` has `restart: "no"`, `profiles: [migrate]`, `command: ["node", "server/migrate.js"]`, `networks: [db]` (:55-62)
    - `tunnel`→`web` and `db`→`db` are both `external: true` (:64-72)
    - no `ports:`/`volumes:` keys
  - workflow `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`:
    - `DB_APP`/`ENV_FILE` (:40-41) and the job `if: github.ref == 'refs/heads/main'` (:45)
    - the `envfile` step (:87-106) matches org-admin-api line for line except the `postgres://` scheme and `skip != 'true'` (same semantics, as TuDo's existing `release` step)
    - `pull`/`backup`/`migrate`/`deploy` (:108-147) and the service-named rollback (:165), which never migrates
    - notify has the MIGRATE cases (:188, :195-202)
- [x] No password or URL value in the TuDo repo (R3). `grep -rnE 'postgres(ql)?://[^%<$ ]*:[^%<$ ]*@' deploy/ work/ docs/ README.md`: the only hit is the literal pattern text in `impl-log.md:27`, not a value. `grep -rnE '\b[0-9a-f]{48}\b' deploy/ work/ming-todo.md`: no hits. Remaining URL forms are the `printf` format (workflow :103) and `<pw>`/`<password>` placeholders. No `.env*` file was added.
- [x] Runbook lists the exact deployment-repo steps. `work/ming-todo.md` M-12 (:97-119) covers:
  - the branch name, with the `release/` warning
  - `add-app-db.sh tudocuatui`. Its outputs `generated …` and `added tudocuatui …` match `/home/user/deployment/postgres/scripts/add-app-db.sh:31,44`.
  - copying the workflow only, not the compose
  - the exact `git status`/`add`/`commit` paths
  - the merge, which triggers `deploy-postgres` only. The live `deploy-tudocuatui` triggers on `apps/tudocuatui/**` only (deployment `deploy-tudocuatui.yml:15`), and `deploy-postgres` on `postgres/**` (`deploy-postgres.yml:21`).
  - the expected log line, which `postgres/init/10-app-dbs.sh:41` / `add-app-db.sh:60` emit as "role and database '<app>' ready…"
  - read-only `psql` checks and the `grep -x` check
  - deferring the compose to T-015, and the rotation step
- [x] (Plan AC 4) No `migrate` run while the nginx compose is live. Desk check plus the `docker compose config` run above:
  - `pull` outputs `migrate=false` (:113-120)
  - `backup`/`migrate` are skipped (:125, :134)
  - `deploy` runs (:144). `success()` is implied, so a failed `backup` still blocks it.
  - notify matches `skipped:success:` → "deployed" (:196)
- [x] (Plan AC 5) Checks green (above).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no app or data-layer code changed.
- R2: no migration. D25 records the approved amendment, and CLAUDE.md is left for Ming as instructed.
- R3: the secret exists only on the host, from a file in the private deployment repo, and never in `VITE_*` or the image.
- R4/R5/R6/R9: not touched.
- R7: every changed file is in the plan's table or is a workflow artefact (ticket/plan/consult/impl-log, and the orchestrator's plan-approval line in `ming-todo.md`).
- R8: green, and there is no pure logic to unit-test.
- R10: `AGENTS.md`, `.figma/` and `vite.config.ts` are untouched.

### Nits (do not block)
- Workflow header (:3-4) says only the name, label, image, pattern and guard differ from org-admin-api. TuDo also has no `*_VERSION`/version-equality check and no `environment:` block. That is intentional (R7) but worth a word.
- When `migrate=true` and `backup` fails, notify reports `did-not-complete (migrate: skipped …)` without naming the backup. org-admin-api behaves the same way. A `BACKUP` case could be added later in both.
- `impl-log.md:27` puts the R3 regex as literal text containing `postgres://user:pw@`, which matches the R3 grep. Harmless, but future greps will need to exclude it.

### Follow-ups (out of scope)
- CLAUDE.md R2 row text per D25 (Ming).
- Least-privilege runtime role `tudocuatui_app` (needs changes to the deployment repo's shared scripts).
- T-015: `Needs Ming: M-12`, plus its own M-item for copying `compose.yml` into the first Node release PR. Make sure the image has `node` on PATH, `server/migrate.js` relative to WORKDIR, and `/readyz` on :3000, so the compose contract holds.
- T-012/T-013: runner contract `node server/migrate.js`, expand-then-contract, `/readyz` with `select 1`, pool max 5. Consider validating `Cf-Access-Jwt-Assertion`.
