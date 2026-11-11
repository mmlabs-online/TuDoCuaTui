Status: READY

# Plan — T-015: Switch the image and deploy from nginx to the Node server

Gate: **plan-approval** (High tier: production deploy config, `Dockerfile`, `release.yml`, `check-image.sh`, and the
compose that goes to `mmlabs-online/deployment`). Ming confirms or changes **A1–A4** (real choices, each with a
default) and A5–A15 (defaults). **A1 changes what production shows**, so please read it first.

## Feature summary
T-015 is not in `docs/feature-list.md`. It implements decision **D23** (`work/decisions.md`, 2026-11-10):

> TuDo moves its data from Supabase (D17) to the shared Postgres in `mmlabs-online/deployment` […], accessed only
> by a Node API in the same image as the SPA (**replaces nginx from T-007**). **No in-app authentication for now**
> (single user); **Cloudflare Access** protects `tudocuatui.mmlabs.online` […]. Work: T-011 → T-016.

and the T-015 part of **D24**:

> (2) the Node `compose.yml` ships inside the first Node release PR (T-015). […] Migrate command contract:
> `node server/migrate.js`. Readiness probe: `/readyz` on :3000.

Ticket goal: "The release image runs the Node server on :3000 (non-root), passes `check-image.sh`, and deploys with
the DB env file and the `migrate` step."
Ticket scope: "Dockerfile (build SPA + server, runtime Node), `check-image.sh` and CI `image` job updated (health,
SPA fallback, no secrets in image), `release.yml` build args reviewed (no `VITE_SUPABASE_*` in API mode)." and
"README "Deploy", D20 notes, M-4/M-10 superseded by the new runbook."

Contracts this plan relies on (from `server/README.md` and `server/access.js`, both merged):
- Start: `node server/index.js`, `0.0.0.0:3000`, SPA from `../dist`. ESM, so `package.json` (`"type": "module"`)
  must be in the image.
- `NODE_ENV=production` plus missing `CF_ACCESS_*` → exit 2. `TUDO_ACCESS_DISABLED=1` is refused in production.
- `/healthz` = liveness, `/readyz` = `select 1` (503 without a DB), `/api/*` without `cf-access-jwt-assertion` → 401
  before any JWKS fetch.
- `node server/migrate.js` reads `../db/migrations`. Without `DATABASE_URL` it exits 2.

**Out of scope (R7):** no `src/**` change and no API-mode flag (T-014). No removal of Supabase code, scripts,
`supabase/` or `scripts/check-public-supabase-env.sh` (T-016). `vite.config.ts` is not touched (R10). The deploy
workflow draft is not changed (live and merged via M-12, D24).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "CI builds and checks the new image; release flow unchanged otherwise." | (a) The CI `image` job on the PR is green and its log shows every `check-image.sh` section listed under Approach step 3, including `== start checks`, `== smoke` with `/api/items → 401`, and (if A4 is accepted) `== db smoke` with `/readyz → 200`. If the reviewer has Docker: `docker build -t tudo:t . && bash scripts/check-image.sh tudo:t` ends in `image ok`. (b) `git diff main -- .github/workflows/release.yml`: the trigger, guards, tag reservation, `push`/`platforms`/`provenance: false`/`sbom: false`, digest pinning, `check-image.sh` on the pushed digest, the "only `release.env`" guard (lines 149-151) and the PR branch/title are unchanged. Only the lines named in the file table for the chosen A1 option change. |
| 2 | "Image has no secrets; DB URL only at runtime from the env file." | `check-image.sh` passes: no secret-like env names, no `VITE_` in config or history, no `.env*` anywhere, no `sb_secret_` in `/app/dist`, no source maps, non-root user. Additionally: `grep -rn 'DATABASE_URL' Dockerfile .github/workflows/release.yml` → no hit. `grep -rn 'TUDO_ACCESS_DISABLED' Dockerfile deploy/ .github/workflows/release.yml` → no hit, except the one negative test in `check-image.sh` that asserts exit 2. In the compose draft, `DATABASE_URL` appears only in comments, and the value comes from `env_file:` only. The only `environment:` values are `NODE_ENV`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, all non-secret (M-13). The CI DB smoke URL is the throwaway `postgres:postgres@127.0.0.1` service credential (same as the existing `ci` job). |
| 3 | (Goal) runs on :3000, non-root, `node server/index.js` | `docker image inspect` (in `check-image.sh`): `User` = `node`, `ExposedPorts` has `3000/tcp`, `Cmd` = `["node","server/index.js"]`, `Env` contains `NODE_ENV=production`. Smoke `/healthz` → 200. |
| 4 | (Goal) deploys with the DB env file and the `migrate` step | Read `deploy/deployment-repo/apps/tudocuatui/compose.yml`. It is unchanged from the T-011 draft except: `environment:` on the `tudocuatui` service with `NODE_ENV: production`, `CF_ACCESS_TEAM_DOMAIN: figen.cloudflareaccess.com`, `CF_ACCESS_AUD: dc2cd11d34339393549e3d3325512e49d2f44f8ae2dd0403ccf701152d77cfa7` (M-13, exact); `AbortSignal.timeout(3000)` in the `/readyz` healthcheck; and header comments. `migrate` still has `command: ["node", "server/migrate.js"]` and `networks: [db]`. With the A4 DB smoke, CI proves `node server/migrate.js` works **inside the image**. The live run is M-14. |
| 5 | (Scope) README "Deploy", D20 notes, M-4/M-10 superseded | README "Deploy" describes the Node server, the env file, Access, `migrate`, the first-release step (M-14) and rollback; the code-map row no longer mentions nginx. `work/ming-todo.md` has M-14, and M-4 and M-10 carry a "superseded" note. `work/decisions.md` has D26, and the D20 row points to it. |
| 6 | Checks | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` are green (regression only; no product code changes). |

## Ming verification after merge
- **M-14** (new, added by this ticket): cut the first Node release, add the compose to its deployment PR, merge it
  as one push, and confirm backup → migrate → deploy. Then check Access, `/version.txt` and `/api/locations` → 200
  JSON through Access (this proves container egress to `figen.cloudflareaccess.com` and the AUD). CI cannot check
  any of this.
- Whatever A1 decides, the app on the phone looks as A1 says (Supabase mode as today, or local mode with demo items).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `Dockerfile` | Rewrite (sketch in Approach step 1). Stages: `build` (unchanged apart from comments; the Supabase ARGs depend on A1), new `prod-deps` (`pnpm install --prod --frozen-lockfile --ignore-scripts` from `package.json` + `pnpm-lock.yaml` only), runtime `node:22-bookworm-slim` with `WORKDIR /app`, `ENV NODE_ENV=production`, root-owned copies of `package.json`, prod `node_modules`, `dist/`, `server/`, `db/migrations/`, `USER node`, `EXPOSE 3000`, `HEALTHCHECK` on `/healthz` via `node -e fetch`, `CMD ["node","server/index.js"]`. | Scope bullet 1, AC 1–3 |
| `.dockerignore` | Add `server/test` and `**/*.test.ts`. Keep `server/` and `db/` included. | Tests stay out of the image (AC 2 hygiene) |
| `docker/nginx.conf` | Delete. | nginx is gone. Rollback uses registry images, not source. |
| `scripts/check-image.sh` | Rewrite for the Node image (Approach step 3): `ROOT=/app/dist`; keep every existing secret/version check; add image-config, layout and start-exit checks; smoke with dummy `CF_ACCESS_*`, `--network none` and a `node -e fetch` probe; optional DB smoke when `CHECK_IMAGE_DATABASE_URL` is set (A4). The positional args depend on A1. | Scope bullet 1, AC 1–3; `wget` does not exist in bookworm-slim |
| `.github/workflows/ci.yml` | `image` job only: update the header comment; add a `postgres:17` service and pass `CHECK_IMAGE_DATABASE_URL` to the **first** `check-image.sh` call only (A4). The build steps stay as they are under A1 option A, or under option B drop the dummy-Supabase build args (keep `VITE_APP_VERSION=v0.0.0`) and the URL argument. The `ci` job is untouched. | Scope bullet 1, AC 1 |
| `.github/workflows/release.yml` | Option A (default): header comment (Node image; build args unchanged until T-016) and the PR body (`Node server; deploy runs backup + migrate`, keep `$MODE`). Option B: also remove `VITE_SUPABASE_*` from the guard `env`, the `check-public-supabase-env.sh` call, the `mode` output, the `build-args` and the `SUPABASE_URL` env + argument. Everything else unchanged. | Scope bullet 1 ("build args reviewed"), AC 1 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Add `environment:` to the `tudocuatui` service (values in AC 4), add `AbortSignal.timeout(3000)` to the healthcheck, and update the header: "copy with the first Node release: M-14"; `NODE_ENV`/`CF_ACCESS_*` are non-secret; never add `TUDO_ACCESS_DISABLED`; egress to `<team>.cloudflareaccess.com` via `web`. | AC 4, ticket notes (M-13, T-013 A5) |
| `deploy/deployment-repo/README.md` | The table's compose row says "Inside the first Node release PR, see M-14 in TuDo `work/ming-todo.md`". Add a short "First Node release and rollback" paragraph: both files in one push; an automatic restore brings back nginx compose + nginx `release.env` together; a deliberate rollback is a non-`release/` PR reverting **both** files; migrations stay. | Scope bullet 2 |
| `README.md` | Rewrite "Deploy" (Node server on :3000, `node server/index.js`; `DATABASE_URL` only in the host env file; Access values in compose; the deploy runs backup → migrate → up; first release = M-14; rollback; "Supabase values" paragraph per A1; "Run the image locally" with dummy `CF_ACCESS_*`, never `TUDO_ACCESS_DISABLED`; troubleshooting: exit 2 = missing Access values, every `/api` 401 = JWKS egress or AUD). Code-map row: `Dockerfile`, `.dockerignore` → "Production image: Vite build + Node server (`server/`) on :3000, non-root". | Scope bullet 2, AC 5 |
| `server/README.md` | Add a short "Image (T-015)" section: layout `/app/{package.json,node_modules,dist,server,db/migrations}`, `USER node`, `NODE_ENV=production` baked in, image healthcheck `/healthz` vs compose `/readyz`, Access values come from compose. | T-013.2 plan notes "T-015 adds image notes" |
| `work/ming-todo.md` | Add **M-14** (Approach step 6). Add a one-line "superseded by M-14 (D23/D26)" note to M-4 steps 5–7 and to M-10 (D23: no Supabase function deploy). Do not tick or delete them. | Scope bullet 2, AC 5 |
| `work/decisions.md` | Add **D26** (2026-11-11, only after plan approval, with Ming's A1–A4 answers). Prefix the D20 row's decision text with "Runtime amended by D26: Node server replaces nginx." | AC 5, records the approval |

Expected size: about 300–360 changed lines (Dockerfile ~45, check-image ~140, ci ~20, release ~5–25, compose ~12,
two READMEs ~60, ming-todo ~30, decisions ~3, nginx.conf deletion). Within one cycle.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None (unit) | No pure logic changes, so R8 unit tests do not apply. The tests here are the image checks in `scripts/check-image.sh`, run by CI on every PR and by `release.yml` on the pushed digest. Each new check is listed in Approach step 3 and must fail loudly (`::error::…`, exit 1). |

## Approach
1. **Dockerfile.** Keep the header style; replace the nginx comments. Sketch (the implementer may adjust details,
   not the shape):
   ```dockerfile
   FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
   # … unchanged: corepack, frozen install, COPY . ., ARGs, version guard, pnpm build, dist/version.txt

   # Production dependencies only (pg, jose, plus the SPA packages in "dependencies"; pure JS, so BUILDPLATFORM is safe).
   FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS prod-deps
   WORKDIR /app
   RUN corepack enable
   COPY package.json pnpm-lock.yaml ./
   RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
       pnpm install --prod --frozen-lockfile --ignore-scripts

   FROM node:22-bookworm-slim
   WORKDIR /app
   ENV NODE_ENV=production
   # Files stay root-owned: the app cannot rewrite itself.
   COPY package.json ./
   COPY --from=prod-deps /app/node_modules ./node_modules
   COPY --from=build /app/dist ./dist
   COPY server ./server
   COPY db/migrations ./db/migrations
   USER node
   EXPOSE 3000
   HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
     CMD ["node","-e","fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
   CMD ["node","server/index.js"]
   ```
   Build ARGs stay in the `build` stage only (no `ENV`), so nothing reaches the runtime config or history (R3).
   `COPY server` relies on `.dockerignore` to drop `server/test` and `*.test.ts`. No `DATABASE_URL`,
   `CF_ACCESS_*` or `TUDO_ACCESS_DISABLED` in the Dockerfile.
2. **`.dockerignore`** as in the file table. Check that `db/` and `server/` are not excluded by an existing pattern.
3. **`check-image.sh`**: same style (`set -uo pipefail`, `::error::`, `EXPECTED_VERSION`). Sections:
   - `== no secrets in image`: keep all current checks with `ROOT=/app/dist`. The `.env*` `find` stays whole-image.
     If the Node base image or a prod dependency ships a `.env*`-named file, the implementer narrows it (`-not -path`
     for that exact file) and records why in impl-log. The check must not be dropped.
   - `== image config` (new): `Cmd` is `["node","server/index.js"]` (via `{{json .Config.Cmd}}`); `Env` contains
     exactly `NODE_ENV=production`; `ExposedPorts` contains `3000/tcp`; the existing non-root check stays.
   - `== layout` (new): `/app/package.json` has `"type": "module"`; `/app/db/migrations/*.sql` exists;
     `/app/node_modules/pg` and `/app/node_modules/jose` exist; `/app/node_modules/vite`, `/app/src`,
     `/app/server/test` and any `/app/server/*.test.ts` are absent; `/app/dist/index.html` exists.
   - `== bundle mode`: as today, depending on A1 (option A keeps the optional URL argument; option B removes it and
     only keeps the "no `ci-dummy.invalid`" local-mode assertion).
   - `== version`: as today with the new `ROOT`.
   - `== start checks` (new; each `timeout 30 docker run --rm --network none …`, compare the exit code):
     no env → 2; `-e TUDO_ACCESS_DISABLED=1` → 2 (refused because the image has `NODE_ENV=production`);
     `node server/migrate.js` without `DATABASE_URL` → 2 (proves ESM, `pg` resolution and the contract path).
   - `== smoke`: `docker run -d --name "$NAME" --cap-drop ALL --security-opt no-new-privileges --network none
     -e CF_ACCESS_TEAM_DOMAIN=ci-dummy.cloudflareaccess.com -e CF_ACCESS_AUD=ci-dummy "$IMAGE"`. Use a
     `probe <path>` helper that runs `docker exec "$NAME" node -e '…fetch(process.argv[1])… print status, then body'`
     against `http://127.0.0.1:3000$path`. Wait until `/healthz` → 200 (30 × 1 s), and print `docker logs` either way.
     Assert: `/readyz` → 503; `/some/deep/path` → 200 with `id="root"`; `/assets/does-not-exist.js` → 404;
     `/version.txt` body = `EXPECTED_VERSION`; `/api/items` → **401**. Also wait for Docker's own health
     status to become `healthy` (`docker inspect -f '{{.State.Health.Status}}'`, up to 30 s), which proves the image
     `HEALTHCHECK`.
   - `== db smoke` (new, only when `CHECK_IMAGE_DATABASE_URL` is set; A4): `docker run --rm --network host
     -e DATABASE_URL="$CHECK_IMAGE_DATABASE_URL" "$IMAGE" node server/migrate.js` → 0, run again → output contains
     `up to date`; start the server with `--network host`, the same DB URL and the dummy `CF_ACCESS_*`; `/readyz` → 200;
     `/api/locations` without a header → 401. Never `echo` the URL. Remove the container in the `trap`.
   - The usage line documents `CHECK_IMAGE_DATABASE_URL` (CI only; `release.yml` never sets it).
4. **CI `image` job**: add `services: postgres` (copy the `ci` job's block); the first `check-image.sh` call gets
   `env: CHECK_IMAGE_DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/postgres`. Builds as in the file
   table. Keep `cache-from`/`cache-to`.
5. **`release.yml`, compose draft, both READMEs, `server/README.md`** as in the file table.
6. **M-14 — First Node release** (in `work/ming-todo.md`, under Setup). Prerequisites: T-015 merged, M-11, M-12,
   M-13 done; A1 answered (and if option B, optionally delete the `VITE_SUPABASE_*` repo secrets).
   1. From an up-to-date `main`: `git push origin main:release/vX.Y.Z` (next minor, for example `v0.2.0`). Wait for
      `release` to go green. It opens `release/tudocuatui-vX.Y.Z` on the deployment repo. **Do not merge it yet.**
   2. In a clone of `mmlabs-online/deployment`: `git fetch origin && git switch release/tudocuatui-vX.Y.Z`. Copy
      `deploy/deployment-repo/apps/tudocuatui/compose.yml` from TuDo `main` over `apps/tudocuatui/compose.yml`,
      verbatim.
   3. `git diff --name-only origin/main...HEAD` plus the working tree must show exactly
      `apps/tudocuatui/compose.yml` and `apps/tudocuatui/release.env`. Then
      `git commit -am "tudocuatui: Node server compose (T-015)"` and `git push`. `pr-scope` must be green.
   4. Merge the PR as **one** push to `main` (squash or merge commit). Never merge the two files separately: the
      rollback pairs them.
   5. Watch `deploy-tudocuatui`: `pull` reports `migrate=true`, then `backup`, `migrate` and `deploy` succeed, and the PR
      comment says `deployed`.
   6. Check: an incognito window gets the Access login page; signed in, `/version.txt` is `vX.Y.Z`; `/api/locations`
      returns 200 JSON (`{"locations":[…]}`). A 401 means JWKS egress or the AUD/team domain is wrong: check
      `docker compose -p tudocuatui logs --tail 50 tudocuatui` on the Mac (never print the env file). The app on the
      phone looks as A1 says.
   7. If the comment says `restored`: nginx is running again with its own compose, migrations are kept (harmless).
      Read `docker logs`, tell Annie, and do not retry by hand. A deliberate rollback later is a non-`release/` PR on
      the deployment repo that reverts **both** files in `apps/tudocuatui/`.
7. **Decisions**: D26 = T-015 runtime shape (Node image layout, `NODE_ENV` in image + compose, Access values in
   compose, image `/healthz` vs compose `/readyz`) plus Ming's answers to A1–A4.
8. Run the checks.

Rules: **R1** has no app change. Local mode and the Figma Make preview are untouched, and `pnpm dev` is unaffected.
**R3**: no secret in the image or any `VITE_*`. `DATABASE_URL` is runtime-only from the host env file, and
`check-image.sh` enforces this. **R7**: everything else goes to follow-ups. **R10**: `vite.config.ts`, `.figma/` and
`AGENTS.md` are not touched. R2/R4/R5/R6/R9 do not apply (no schema, photos, derived values, UI copy or UI). High tier
→ plan-approval gate.

## Specialist input used
`consult-software-architect.md`:
- **Adopted:** findings 1–8 and 10; Dockerfile shape (`prod-deps` stage, root-owned files, `USER node`, exec-form
  `CMD`, image `HEALTHCHECK` on `/healthz`); `NODE_ENV` in both image and compose; `CF_ACCESS_*` in compose only;
  the `check-image.sh` rewrite (static, start-exit and smoke checks); CI double build; manual M-14 with its
  post-deploy checks; rollback documentation; scope boundary with T-014/T-016.
- **Changed:** "drop `VITE_SUPABASE_*` now" is **not** the default here. The orchestrator's correction says that
  finding 9 is wrong: production was built in Supabase mode, so dropping the args would switch production to local
  mode. That makes it decision **A1**, with "keep until T-016" as the default.
- **Adopted as an option (A4, default on):** the DB-backed in-image smoke in the CI `image` job, gated by
  `CHECK_IMAGE_DATABASE_URL`.
- **Added:** a check that the Docker `HEALTHCHECK` reaches `healthy`; a check of the `Cmd` / `NODE_ENV` / port config;
  the compose header warning about `TUDO_ACCESS_DISABLED`.

## Assumptions
**Decisions for Ming (each has a default; the plan is READY with the defaults):**

- **A1 — `VITE_SUPABASE_*` build args (changes what production shows).** Today production is built in **Supabase
  mode** (the release secrets point at the stoktok project), and it shows the login screen and then "Could not find
  the table public.tudo_locations" because M-1 was never run. Whether real wardrobe data exists in Supabase is still
  open (T-012 A9). Until T-014 lands, the SPA does not use `/api`, whatever the image.
  - **Option A (default): keep them in T-015, drop them in T-016.** `Dockerfile` ARGs, `release.yml` build args, the
    guard and the Supabase-mode CI build stay as they are. Production keeps today's bundle behaviour exactly
    (Supabase login, missing tables); only the server under it changes. T-016 removes all of it once T-014 has
    landed. The diff is smallest, nothing changes for the user, and "no `VITE_SUPABASE_*` in API mode" still holds
    because API mode does not exist yet.
  - **Option B: drop them now.** Releases become local mode (demo items in localStorage, no login) until T-014.
    Supabase data, if any, is not touched. Risk: anything Ming types into production in local mode stays only in that
    browser's localStorage, and T-014 does not import it. Ming may then delete the two repo secrets.
  - **Option C: keep the code (option A) but Ming deletes the two repo secrets.** This gives the same runtime as B with
    no code change, and it can be undone by re-adding the secrets.
- **A2 — First-release compose: manual M-14 (default)** rather than `release.yml` automation. It is a one-off, and
  `release.yml`'s "only `release.env`" guard stays strict, which is a safety property. Alternative: `release.yml`
  copies the draft compose whenever it differs from deployment `main`, and the guard allows
  `{release.env, compose.yml}`. That keeps the compose single-sourced but widens what the bot can change in
  production. Listed as a follow-up, not built.
- **A3 — Order with T-014 (hotspot `Dockerfile` / `release.yml` / `ci.yml` / README).** Default: T-014 may run in
  parallel, but **must not touch** `Dockerfile`, `.dockerignore`, `release.yml`, `check-image.sh` or the CI `image`
  job. Its plan should prefer API-mode detection that needs no build arg. If T-014's plan needs a build flag, the
  orchestrator adds `T-015` to T-014's `Depends on`. In every case, the first release that contains T-014 must
  be the M-14 Node release or a later one, because API mode on the nginx image would have no `/api`.
  Alternative: always make T-014 depend on T-015 (simpler, but slower).
- **A4 — DB-backed in-image smoke in CI: yes (default).** It adds about 25 lines (a `postgres:17` service in the
  `image` job, plus the `== db smoke` section). It proves that `migrate` and `/readyz` work with the image's own
  `node_modules` and paths. The `ci` job already proves this from source, but not from the image. `release.yml` never
  runs it, because there is no DB on the release runner. Alternative: static and exit-code checks only.

**Defaults (confirm):**
- **A5** — `NODE_ENV=production` in both the image `ENV` (fail-closed default) and compose `environment:` (explicit).
  `TUDO_ACCESS_DISABLED` appears in no production artifact. Its only mention is the negative test in `check-image.sh`.
- **A6** — `CF_ACCESS_TEAM_DOMAIN=figen.cloudflareaccess.com` and the M-13 AUD go in compose `environment:` on the
  `tudocuatui` service only, not in `x-app` (`migrate` does not need them), and never in the image.
- **A7** — The image `HEALTHCHECK` probes `/healthz`, so DB-less smoke runs report healthy. The compose overrides
  it with `/readyz`, so a DB outage at deploy time makes `--wait` fail and triggers a rollback. That is intended.
- **A8** — Runtime user is `node` (uid 1000) from the base image, and the app files are root-owned. The image has no
  writable app paths, because the server writes nothing to disk.
- **A9** — The production `node_modules` also carries `react`, `react-dom` and `@supabase/supabase-js`, because they
  are in `dependencies`. That is bloat, not a risk. T-016 removes Supabase; moving the SPA packages to
  `devDependencies` is a follow-up (it touches `package.json`, a hotspot with T-014).
- **A10** — `docker/nginx.conf` is deleted. Rollback uses the old image from Docker Hub, pinned by digest in the
  restored `release.env`, so it does not need the file.
- **A11** — Container egress to `figen.cloudflareaccess.com` goes out via the `web` network. `db` is `--internal`.
  Only M-14 step 6 can verify it. If it fails, every `/api` call returns 401 (safe). Before T-014 nothing uses
  `/api`, so the only symptom is that check.
- **A12** — The deploy workflow draft is not changed. It already holds the compose-keyed migrate guard (D24) and is
  live via M-12. If the implementer finds the live `/home/user/deployment/apps/tudocuatui/compose.yml` or the
  workflow differs from the drafts beyond the nginx compose, they record it in impl-log and do not edit the
  workflow.
- **A13** — M-4 steps 5–7 and M-10 get a "superseded" note and are not deleted, so the history stays readable.
  CLAUDE.md still says "Hosting: Cloudflare Pages (D5)". That is stale, but CLAUDE.md is out of scope here (follow-up
  for Ming).
- **A14** — First Node release version: the next minor (`v0.2.0` or higher). Ming picks it in M-14.
- **A15** — Hotspots: `README.md`, `server/README.md`, `.github/workflows/ci.yml`, `work/ming-todo.md`,
  `work/decisions.md` (shared with T-014/T-016); `Dockerfile`, `release.yml`, `check-image.sh` (T-016 under A1
  option A). `.github/risk-tiers.yml` already lists `Dockerfile`, `release.yml` and `check-image.sh`, so it is not
  changed.

## Blocking questions
None. A1–A4 have defaults. Ming answers them at plan approval.

## Split proposal
None. About 300–360 changed lines, one feature (image and deploy switch).

### Follow-ups (not in this diff, R7)
- `release.yml` automation for compose changes (A2 alternative).
- Move `react`, `react-dom` (and, before T-016, `@supabase/supabase-js`) to `devDependencies` to slim the image (A9).
- `.github/risk-tiers.yml`: add `server/**`, `db/migrations/**` and `deploy/**` (carried from T-012/T-013).
- `server/index.js`: log "access check OFF" as a warning (T-013 security review, optional).
- CLAUDE.md "Hosting" line (D5 → D20/D26) and R2 row (D25): Ming's edit.
- T-016: remove `VITE_SUPABASE_*` from `Dockerfile`, `release.yml`, `ci.yml` and `check-image.sh`, plus
  `scripts/check-public-supabase-env.sh`, if A1 option A is chosen.
