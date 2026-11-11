# Tủ đồ của tôi

Personal wardrobe tracker: React 19 + Vite + Tailwind v4 (UI exported from Figma Make), with a Supabase backend (Postgres + Auth + Storage).

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + anon key, or leave empty for local mode
pnpm dev
```

- **No env vars:** local mode. Data lives in localStorage and the demo items are loaded; no login. This keeps the Figma Make preview working.
- **Served by the Node server** (`node server/index.js`): API mode. Data goes through `/api`, no login (Cloudflare Access protects the site). It wins over Supabase mode and is detected at startup via `/healthz`, no build flag.
- **With env vars:** Supabase mode. You log in with email + password (the stoktok account), and each user only sees their own data (RLS).

## Set up Supabase (one time)

TuDoCuaTui runs on the existing **stoktok** Supabase project (shared Postgres and Auth, decision D17). Every TuDo
object is prefixed `tudo_`. Setup is dashboard-only; the steps are M-1 in `work/ming-todo.md`.

1. Copy the stoktok **Project URL** and **anon key** (Project Settings → API) into `.env.local`.
2. Paste each file in `supabase/migrations/`, in filename order, into Dashboard → SQL Editor and run it.
   **Never run `db push`, `supabase link`, `db reset --linked`, `db pull` or `db diff --linked` against the shared
   project**: its migration history holds stoktok's versions.
3. Auth: no changes are needed for TuDo login (D18/D19). Do not change the Site URL (it stays stoktok's) or any other
   Auth settings. Log in with your existing stoktok email + password.
4. Run the smoke test: [docs/qa/smoke-test.md](docs/qa/smoke-test.md). It also describes a local stack (`npx supabase start`, ports 553xx, `npx supabase stop` when done).
5. Regenerate the DB types after any migration change (needs Docker; use Git Bash on Windows, not PowerShell, whose `>` writes UTF-16):
   ```bash
   npx supabase start
   npx supabase db reset   # local DB = supabase/migrations/
   pnpm db:types
   npx supabase stop
   ```
   The script introspects the **local** stack only (`--local --schema public`, D11), so the output covers `public` and
   comes from `supabase/migrations/`; it also formats the file. Commit the result. Never point it at the shared project
   (`--linked`, `--project-id`): that pulls in stoktok's tables (D17).
   Run `db reset` first: the generator reads the running DB, not the migration files, so a stack started before a
   migration change gives stale types. Do not run it while `scripts/test-db-shared.sh` is running.
   The CLI is pinned to `3.0.0`; `--local` is deprecated and goes away in CLI v4, so bump the pin deliberately.

## Deploy (home server, Cloudflare Tunnel)

Production is `https://tudocuatui.mmlabs.online`, served from the home server (decision D20, replaces Cloudflare
Pages). Same flow as stoktok: a `release/vX.Y.Z` push builds a Docker image on GitHub's runner, pushes it to Docker
Hub (`mingming21400/tudocuatui`) and opens a PR on `mmlabs-online/deployment`; merging that PR runs
`deploy-tudocuatui` on the home server, which takes a backup, runs `node server/migrate.js`, replaces the app and
waits for the health check (`/readyz`, database included), rolling back if it fails. The container is one Node
server (`node server/index.js`, D26) on port 3000 that serves the SPA and `/api`, non-root, with no published ports;
cloudflared reaches it as `tudocuatui:3000` on the `web` network. Cloudflare Access protects the site and the server
verifies its JWT. `DATABASE_URL` lives only in the host env file
(`/Users/mingming/.config/tudocuatui/tudocuatui.env`); the Access team domain and AUD (not secret) are in the
compose file. There are no per-PR preview deploys; the CI `image` job builds the image and checks it, including
`migrate` and `/readyz` against a throwaway Postgres, on every PR. The first Node release is M-14 in
`work/ming-todo.md` (the setup steps below are M-4, M-12, M-14). Write names, never values, into the repo.

**One-time setup**
1. Docker Hub: create repo `mingming21400/tudocuatui` (public: the image holds only what the site serves). The token
   in `DOCKERHUB_TOKEN` needs Read & Write on it.
2. Repo secrets (Settings → Secrets → Actions): `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `DEPLOY_REPO_TOKEN`
   (fine-grained PAT on `mmlabs-online/deployment` only: Contents and Pull requests read/write).
3. Setup PR on `mmlabs-online/deployment`: copy the files in `deploy/deployment-repo/` to the same paths and add the
   CODEOWNERS line (details in its README). Merge it; `deploy-tudocuatui` skips until a release exists.
4. Cloudflare: the published application `tudocuatui.mmlabs.online` points to service `http://tudocuatui:3000`
   (HTTP, not HTTPS).
5. If an old Cloudflare Pages project `tudocuatui` exists, delete it.

**Release**: from an up-to-date `main`, `git push origin main:release/vX.Y.Z`. The `release` workflow checks that
the commit is on `main`, the version is new and higher, and the secrets exist; tags it, builds and pushes the image,
pulls the pushed digest back and smoke-tests it, then opens PR `release/tudocuatui-vX.Y.Z` on the deployment repo
(it changes only `apps/tudocuatui/release.env`). Review and merge it; `deploy-tudocuatui` deploys and comments the
result on the PR. Version check: `curl https://tudocuatui.mmlabs.online/version.txt` or the "Phiên bản" line at the
bottom of the app. Phone check: open the site; a deep URL such as `/x/y` also loads the app.

**First Node release (M-14)**: the compose draft in `deploy/deployment-repo/apps/tudocuatui/compose.yml` goes into
the first Node release PR on the deployment repo, merged together with `release.env` as one push (steps in M-14).

**Supabase values** (until T-016 removes them): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are optional repo secrets passed as Docker
build args, so they are baked in at build time. Without them the release runs in local mode (demo items, no login).
After M-1 add both (stoktok Project URL and the anon/publishable key only, never the service role key, R3) and cut a
new release; changing them needs a new release. `release.yml` refuses a half-set pair, a non-https URL and a
secret or non-anon key. Never set `FIGMA_PUBLIC_URL`; it changes Vite's `base`.

**Rollback**: if the new container is unhealthy, `deploy-tudocuatui` restores the previous release and tries to push
the revert. If deployment `main` blocks that push the run ends `restore-unpushed`: the server is fine, revert the
release PR by hand. To go back later, release a new version; do not reuse a tag, or revert both files in
`apps/tudocuatui/` of the deployment repo in a non-`release/` PR (migrations stay).

**Run the image locally** (needs Docker): `docker build -t tudo . && docker run --rm -p 3000:3000 tudo`, then open
`http://localhost:3000`. The server needs Access values in production, so add
`-e CF_ACCESS_TEAM_DOMAIN=x.cloudflareaccess.com -e CF_ACCESS_AUD=x` (every `/api` call is then 401), plus
`-e DATABASE_URL=...` for `/readyz`. Never set `TUDO_ACCESS_DISABLED`: production refuses it. Add
`--build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=...` for Supabase mode.

**Troubleshooting**: `release` fails at "guards" with the reason in the log. 502 from Cloudflare means the route is
not `http://tudocuatui:3000` or the container is not on the `web` network. Unhealthy container: `docker logs` on the
server. Container exits with code 2: the Access values are missing. Every `/api` call is 401: the container cannot
reach `<team>.cloudflareaccess.com` (JWKS) or the AUD is wrong. A `.env*` file never enters the image
(`.dockerignore`).

## Running DB tests

pgTAP tests in `supabase/tests/` check that RLS and the storage policies keep each user out of other users' data.

Prerequisites: Docker Desktop running, and Node (the CLI runs via `npx supabase`). Ports 55320-55329 must be free.

```bash
npx supabase start       # first time pulls images
npx supabase test db     # runs every file in supabase/tests/
npx supabase stop               # when done
```

- Each file runs in a transaction that rolls back, so no data is left behind and runs are repeatable.
- `rls_tables.sql`: `tudo_locations`, `tudo_items`, photos, wear logs and the `tudo_items_with_stats` view. `rls_storage.sql`: bucket `wardrobe`.
- `rls_hardening.sql`: parent/path ownership checks on `tudo_locations` and `tudo_item_photos`, plus update-path guards.
- `grants.sql`: `authenticated` has exactly the grants it needs and `anon` has none; every object is prefixed `tudo_`
  (the naming checks assume a local DB that holds only TuDo objects).
- `bash scripts/test-db-shared.sh`: resets the local DB with stoktok's default-privilege revoke applied first, then runs
  all tests. Afterwards run `npx supabase db reset` to return to the default variant. Local only.
- Raw TAP for one file (no host `psql` or password needed):
  ```bash
  docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q < supabase/tests/rls_hardening.sql
  ```
- CI does not run these tests yet.

## Code map

| Path | Purpose |
|---|---|
| `src/App.tsx` | UI (from Figma Make). It talks to data only through `useWardrobe()` |
| `src/data/useWardrobe.ts` | Hook: items, locations, save/remove/wear/importMany |
| `src/data/repo.ts` | `WardrobeRepo` interface with two implementations: local (localStorage) and Supabase |
| `src/types/database.ts` | Generated by `pnpm db:types`; do not edit by hand |
| `src/data/mappers.ts` | Maps Vietnamese UI labels ↔ DB enum ids |
| `src/data/photos.ts` | Client-side image resize before upload |
| `src/features/auth/AuthGate.tsx` | Email + password login (only in Supabase mode) |
| `supabase/migrations/` | Schema, RLS, storage bucket and policies |
| `supabase/tests/` | pgTAP RLS and storage policy tests |
| `docs/data-model.md` | ERD and design decisions |
| `Dockerfile`, `.dockerignore` | Production image: Vite build + Node server (`server/`) on :3000, non-root |
| `scripts/check-image.sh` | Image checks (config, layout, start exits, health, SPA fallback, no secrets, optional DB smoke) used by CI and `release.yml` |
| `scripts/check-public-supabase-env.sh` (+ `.test.sh`) | Release guard: only the public URL and anon key may be baked in (R3) |
| `.github/workflows/release.yml` | `release/vX.Y.Z` push: tag, build, push image, open the deployment PR |
| `deploy/deployment-repo/` | Drafts to copy into `mmlabs-online/deployment` (compose + deploy workflow) |
