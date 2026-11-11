# Consult — software-architect — T-015 (2026-11-11)

I only read files. I did not open any `.env` or `release.env` file, or anything under `postgres/secrets/`.

## Findings

1. **The server is ready to go into an image.**
   - It starts with `node server/index.js` on `0.0.0.0:3000`, and `distDir` is `../dist` relative to `server/`.
   - `migrate.js` reads `../db/migrations`.
   - The runtime code imports only `node:*`, `pg` and `jose`, and nothing from `src/`.
   - All `server/*.js` files are ESM. **They depend on `package.json` `"type": "module"`.** The ticket's list "only dist/ server/ db/migrations/ node_modules" leaves `package.json` out, and without it the image will not start.
2. **Startup is fail-closed (`server/access.js:13-35`).**
   - If both `CF_ACCESS_*` values are set, access checking is on.
   - If they are missing, the server exits 2 unless `TUDO_ACCESS_DISABLED=1` is set, and even that is refused when `NODE_ENV=production`.
   - `createRemoteJWKSet` fetches keys lazily, and a request with no `cf-access-jwt-assertion` header gets 401 before any JWKS fetch. So the smoke test can assert `/api` → 401 with dummy `CF_ACCESS_*`, no DB, and even `--network none`.
3. **Health endpoints.**
   - `/healthz` is liveness only.
   - `/readyz` returns 503 without a DB.
   - The draft compose already probes `/readyz` with `node -e fetch` (`deploy/deployment-repo/apps/tudocuatui/compose.yml:40-52`).
   - `node:22-bookworm-slim` has no `wget`, so the current `check-image.sh`, which uses `docker exec … wget`, has to be rewritten.
4. **The compose draft is missing settings.** It has no `environment:` block, so there is no `NODE_ENV` and no `CF_ACCESS_*`. T-013 A5 says these belong in compose `environment:`.
5. **Deployment repo state.**
   - The live `deploy-tudocuatui.yml` already has the compose-keyed migrate guard (M-12, PR #38 merged).
   - The live `apps/tudocuatui/compose.yml` is still the nginx one, with a `wget` healthcheck and only the `tunnel` network.
   - `pr-scope.yml` lets a `release/tudocuatui-v*` PR change anything under `apps/tudocuatui/`, so `compose.yml` may ride in the release PR.
   - However, TuDo's `release.yml:149-151` hard-fails if the bot commit changes anything other than `release.env`. Adding the compose by automation would mean changing that guard.
6. **Rollback.** The deploy rollback runs `git restore --source=$BEFORE -- apps/tudocuatui` (draft workflow, lines 163-165). That restores the nginx compose and the nginx `release.env` together, without migrating, but only if the Node compose and the Node `release.env` reach `main` in **one push**.
7. **What happens if they don't land together.** If a Node image is released with the nginx compose still live, the container has no `CF_ACCESS_*`, so it exits 2 (if `NODE_ENV=production` is set in the image). It also has no `wget` for the nginx healthcheck. Either way it is unhealthy, the deploy rolls back to nginx, and the run is red. That is safe.
8. **Egress.**
   - `db` is created `--internal` (`postgres/compose.yml:15,111`), so no internet that way.
   - `web` is a normal bridge (`proxy/compose.yml:3`), so egress to `figen.cloudflareaccess.com` goes out via `web`.
   - The `migrate` service is on `db` only and needs no egress.
   - Failure mode: if the JWKS fetch fails, every `/api` call returns 401, which is safe but is an outage.
9. **Supabase in production today.**
   - M-1 (the Supabase tables) was never done.
   - M-4 step 7 (the `VITE_SUPABASE_*` repo secrets) depends on M-1, so production is almost certainly in **local mode**.
   - The Node server sends no CSP, so even a Supabase-mode bundle would still load.
   - The SPA does not call `/api` until T-014.
   - **So switching the image before T-014 is safe.** The bundle is byte-identical, cache headers match nginx (`static.js`), the app keeps running on localStorage, and the DB gets only the schema.
10. **Production node_modules.** `dependencies` includes `react`, `react-dom` and `@supabase/supabase-js`, so `pnpm install --prod` ships them too. That is bloat, not a risk. T-016 or a follow-up can prune it.

## Recommendations

### Dockerfile (AC1, AC2, R3)
- **`build` stage:** keep it as it is (`--platform=$BUILDPLATFORM node:22-bookworm-slim`, corepack, frozen install, version guard, `pnpm build`, `dist/version.txt`).
  - Drop `ARG VITE_SUPABASE_URL` and `ARG VITE_SUPABASE_ANON_KEY` (see release below).
  - Keep `VITE_APP_VERSION`.
- **`prod-deps` stage:** a separate stage from `package.json` and `pnpm-lock.yaml` only, running `pnpm install --prod --frozen-lockfile --ignore-scripts`.
  - `pg` and `jose` are pure JS, so `BUILDPLATFORM` is safe.
  - Copying the pnpm `node_modules`, including `.pnpm/` and its relative symlinks, works as is.
- **Runtime stage:** `FROM node:22-bookworm-slim`, `WORKDIR /app`, `ENV NODE_ENV=production`, then copy:
  - `package.json`
  - `--from=prod-deps /app/node_modules`
  - `--from=build /app/dist ./dist`
  - `server/`
  - `db/migrations/`
- **Ownership and user:** leave the files root-owned so the app cannot rewrite itself. Use `USER node`, or numeric `1000:1000`.
- **Port and start:** `EXPOSE 3000`, `CMD ["node","server/index.js"]` in exec form, so SIGTERM reaches the shutdown handler.
- **Image HEALTHCHECK:** probe **`/healthz`**, not `/readyz`, so the image is healthy in DB-less smoke runs. Compose overrides it with `/readyz`. Suggested: `CMD ["node","-e","fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]`.
- **`.dockerignore`:** add `server/test` and `**/*.test.ts` so tests stay out of the image. Make sure `server/` and `db/` stay included.
- **nginx config:** delete `docker/nginx.conf` (rollback uses the registry image, not source).

### Where NODE_ENV and CF_ACCESS_* go (AC2, T-013 security note)
- Put `NODE_ENV=production` in **both** the image `ENV` (fail-closed default) and the compose `environment:` (explicit).
- Put `CF_ACCESS_TEAM_DOMAIN=figen.cloudflareaccess.com` and `CF_ACCESS_AUD=<from M-13>` in compose `environment:` only. They are not secret, and the image stays environment-agnostic. Put them under the `tudocuatui` service (or `x-app`; `migrate` ignores them).
- Never set `TUDO_ACCESS_DISABLED` in any production artifact. The reviewer can grep for it.
- `DATABASE_URL` stays only in `env_file`.

### Compose draft
- Add the `environment:` block above.
- Keep the `/readyz` healthcheck, but add `AbortSignal.timeout(3000)`.
- Leave everything else unchanged.

### `check-image.sh` rewrite (AC1, AC2)
- Change usage to `<image-ref>` only; drop the Supabase-URL argument. Set `ROOT=/app/dist`.
- Keep the existing checks: env names, `VITE_` in config and history, non-root `User`, no `.env*`, no `sb_secret_`, no `*.map`, `version.txt` file and in-bundle version.
- Add these static checks:
  - `/app/db/migrations/*.sql` exists.
  - `/app/node_modules/vite` is absent (no dev deps).
  - `/app/src` and `/app/server/test` are absent.
  - `NODE_ENV=production` is in the image config.
- Add these negative start checks with `docker run --rm` and a timeout:
  - No env at all: exits 2.
  - `TUDO_ACCESS_DISABLED=1` with no CF values: exits 2.
  - `node server/migrate.js` with no `DATABASE_URL`: exits 2. This proves ESM, `pg` resolution and the contract path all work.
- Smoke run:
  - Start with `--cap-drop ALL --security-opt no-new-privileges --network none -e CF_ACCESS_TEAM_DOMAIN=ci-dummy.cloudflareaccess.com -e CF_ACCESS_AUD=ci-dummy`.
  - Add a `probe()` helper using `docker exec "$NAME" node -e 'fetch(process.argv[1]).then(async r=>{console.log(r.status);console.log(await r.text())})' "$url"`.
- Smoke assertions:
  - `/healthz` → 200
  - `/readyz` → 503
  - a deep path → 200 containing `id="root"`
  - `/assets/does-not-exist.js` → 404
  - `/version.txt` matches the expected version
  - `/api/items` with no header → **401**
- Optional for the CI image job: add a `postgres:17` service and run the image's `migrate` plus `/readyz` → 200 via `--network host`, gated on an env var so `release.yml` skips it.

### CI image job
- Build once with no args (expect `dev`) and once with `VITE_APP_VERSION=v0.0.0`. The second is a near-free cache hit.
- Drop the dummy-Supabase build and its `check-image.sh` URL argument.
- Leave `scripts/check-public-supabase-env.sh` and its CI test for T-016 (R7).

### `release.yml`
- Stop reading or passing `VITE_SUPABASE_*`: remove them from `env`, `build-args`, the guard call and `SUPABASE_URL`. Production is never in Supabase mode under D23, and this meets the scope line "no `VITE_SUPABASE_*`".
- Remove the `mode` output, or set it to fixed text.
- Keep `VITE_APP_VERSION`, the tag logic, the image tag `mingming21400/tudocuatui:vX.Y.Z` and digest pinning, `check-image.sh` on the pushed digest, and the "only `release.env`" guard.
- Change the PR body to "Node server; deploy runs backup + migrate".

### First Node release PR: use a manual step, not automation (D24, T-011 plan PR 4)
- I recommend a **new M-item (M-14)**:
  1. `git push origin main:release/vX.Y.Z`.
  2. On the opened `release/tudocuatui-vX.Y.Z` deployment PR, add one commit that copies `deploy/deployment-repo/apps/tudocuatui/compose.yml` from TuDo `main` verbatim.
  3. Check that the diff is exactly `release.env` + `compose.yml`.
  4. Merge as **one** push (squash or merge commit).
  5. Watch the run: backup → migrate → up.
- **Why manual:** it is a one-off. It keeps the `release.yml` guard strict, which is a safety property, and it is reversible.
- **Automation as the alternative:** `release.yml` would copy the draft compose whenever it differs from deployment `main`, and the guard would allow `{release.env, compose.yml}`. That keeps the compose single-sourced, but it widens what the bot can change in production config. Offer it as a follow-up for Ming to decide.
- **Post-deploy checks for M-14:**
  - The run summary shows `deployed`, with `migrate` = success.
  - Through Access, `https://tudocuatui.mmlabs.online/api/locations` returns 200 JSON. This proves egress and the JWKS fetch, and that the AUD matches.
  - In an incognito window you get the Access login page.
  - `docker logs` shows no `access_denied` entries with JWKS or timeout codes.

### Rollback to nginx
- Automatic: if the Node container is unhealthy, the restore brings back the nginx compose and the nginx image together. Migrations stay, and nginx ignores them.
- Deliberate rollback later: a non-`release/` PR on the deployment repo that reverts **both** files in `apps/tudocuatui/`.
- Before T-014, no user data is in Postgres, so a rollback loses nothing.
- Document both in the README "Deploy" section and in the drafts README (scope bullet 2). Mark M-4 steps 5–7 and M-10 as superseded.

### Scope boundary
- **T-015:** image, `check-image.sh`, `ci.yml` image job, `release.yml`, compose and drafts README, the TuDo README "Deploy" section, M-14.
- **Not T-015:** no `src/` changes and no API-mode flag; those belong to T-014. No removal of Supabase code or scripts; that belongs to T-016.
- Supabase code stays in the bundle but is inert (empty build args mean local mode).

## Risks
- **Forgetting the compose in the first Node release.** The deploy fails safely and rolls back to nginx, but the run is red. The M-14 wording should make this hard to miss.
- **No egress from the container.** The `web` network has egress today. If Docker Desktop or the network setup changes, every `/api` call returns 401. Only the M-14 check above catches this, since CI cannot.
- **A wrong AUD or team-domain typo.** The server still starts (the format is valid) but every `/api` call returns 401. Before T-014 nothing uses `/api`, so the only symptom is the M-14 check failing.
- **DB outage during a deploy.** The compose healthcheck is `/readyz`, so a DB outage at deploy time makes `--wait` fail and triggers a rollback. That is intended, but it can be confusing.
- **Merge conflict with T-014.** If T-014 uses a build-time API flag, it must touch the `Dockerfile` and `release.yml`. T-014 currently depends only on T-013.2, so the two could conflict.
- **Merge order.** If the release PR is rebase-merged, two commits are pushed at once. That still gives one run with the correct `before`, so it is fine. Two separate merges would break the rollback pairing, and that must not happen.

## Open questions (for Ming at plan approval)
1. Is it OK to drop `VITE_SUPABASE_*` from `release.yml` and the `Dockerfile` now, so every release is local mode until T-014? Should Ming also delete those repo secrets? The orchestrator can check whether they exist with `gh secret list`, which shows names only.
2. For the first-release compose: the manual M-14 commit (recommended), or `release.yml` automation?
3. Should T-014 depend on T-015 because of the `Dockerfile`/`release.yml` hotspot? Or should T-014 pick a runtime API-mode detection that needs no build arg?
4. Should CI run the DB-backed in-image smoke test (the `postgres` service in the image job), or are the static and exit-code checks enough?

## Relevant paths
- /home/user/TuDoCuaTui/Dockerfile
- /home/user/TuDoCuaTui/.dockerignore
- /home/user/TuDoCuaTui/scripts/check-image.sh
- /home/user/TuDoCuaTui/.github/workflows/ci.yml
- /home/user/TuDoCuaTui/.github/workflows/release.yml (lines 149-151 hold the release-env-only guard)
- /home/user/TuDoCuaTui/deploy/deployment-repo/apps/tudocuatui/compose.yml
- /home/user/TuDoCuaTui/deploy/deployment-repo/README.md
- /home/user/TuDoCuaTui/server/access.js
- /home/user/TuDoCuaTui/server/index.js
- /home/user/TuDoCuaTui/server/migrate.js
- /home/user/TuDoCuaTui/package.json (`"type": "module"`)
- /home/user/deployment/.github/workflows/pr-scope.yml
- /home/user/deployment/proxy/compose.yml
- /home/user/deployment/postgres/compose.yml

---

**Orchestrator correction (2026-11-11):** Finding 9 is wrong about today's production mode. Earlier in the
project Ming set the `VITE_SUPABASE_*` release secrets (pointing at the stoktok Supabase project) and logged in
on production; the app then reported "Could not find the table public.tudo_locations" because the M-1 migrations
had not been run. So production is (or was) built in **Supabase mode**, not local mode. Whether real wardrobe data
exists in Supabase is still unanswered (T-012 A9). Dropping `VITE_SUPABASE_*` from the release switches the
production SPA to local mode (localStorage + demo items) until T-014 lands — the planner must treat this as a
decision for Ming, not a safe default.
