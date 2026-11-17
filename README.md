# Tủ đồ của tôi

Personal wardrobe tracker: React 19 + Vite + Tailwind v4, with a Node API (`server/`) over a self-hosted Postgres, photos on Google Drive via the server, and in-app sign-in with mmlabs Identity (D31/D39). The app always needs the Node server; there is no local or demo mode (D44).

## Development (dev loop)

The app has no local or demo mode (D44): it always talks to the Node server, and `pnpm dev` proxies `/api` and
`/healthz` to a local one. The proxy (`dev/devTokenProxy.ts`, `pnpm dev` only, never in `pnpm build`) adds a real
Identity bearer token on the Node side, so the dev app opens signed in as the owner with no sign-in screen. The token
never reaches the browser.

```bash
pnpm install
# 1. A local Node server with a LOCAL database (never point DATABASE_URL at production), Drive unset:
pnpm build && MM_IDENTITY_ISSUER=https://api.mmlabs.online TUDO_OWNER_SUB=<uuid> DATABASE_URL=<local> pnpm start
# 2. A token for your own account (asks for email and password; the password is never written anywhere):
scripts/dev-token.sh
# 3. The dev server:
pnpm dev
```

- The token is written to `~/.config/tudocuatui/dev-token` (override with `TUDO_DEV_TOKEN_FILE`), outside the repo. It
  lasts 15 minutes. Run `scripts/dev-token.sh` again when requests start failing, then press "Thử lại" or reload. No
  Vite restart is needed.
- The script signs in with the production `Origin` because Identity cannot register a localhost origin. After 3
  failed sign-ins Identity asks for Turnstile: sign in once at `https://tudocuatui.mmlabs.online`, then retry.
- `pnpm dev` binds to `127.0.0.1:8443` only (override the port with `TUDO_DEV_PORT`); under WSL open
  `http://localhost:8443` from Windows. The Node server target is `http://127.0.0.1:3000` (`TUDO_DEV_API`).
- If the Node server is not running, the app shows "Không kết nối được máy chủ" with a retry, never demo data.
- `pnpm preview` has no proxy and no token.

The production build is served by the Node server (`node server/index.js`): the app detects it through `/healthz` at
startup, then signs in with mmlabs Identity.

Supabase was removed in T-016 (D23); the old code is in git history.

## Deploy (home server, Cloudflare Tunnel)

Production is `https://tudocuatui.mmlabs.online`, served from the home server (decision D20, replaces Cloudflare
Pages). Same flow as stoktok: a `release/vX.Y.Z` push builds a Docker image on GitHub's runner, pushes it to Docker
Hub (`mingming21400/tudocuatui`) and opens a PR on `mmlabs-online/deployment`; merging that PR runs
`deploy-tudocuatui` on the home server, which takes a backup, runs `node server/migrate.js`, replaces the app and
waits for the health check (`/readyz`, database included), rolling back if it fails. The container is one Node
server (`node server/index.js`, D26) on port 3000 that serves the SPA and `/api`, non-root, with no published ports;
cloudflared reaches it as `tudocuatui:3000` on the `web` network. Users sign in in the app with mmlabs Identity and the
server verifies their bearer tokens. `DATABASE_URL` lives only in the host env file
(`/Users/mingming/.config/tudocuatui/tudocuatui.env`); `TUDO_AUTH_MODE`, `MM_IDENTITY_ISSUER` and `TUDO_OWNER_SUB`
(not secret) are in the compose file. There are no per-PR preview deploys; the CI `image` job builds the image and checks it, including
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

**Build args**: only `VITE_APP_VERSION` (set by the workflow).

**Rollback**: if the new container is unhealthy, `deploy-tudocuatui` restores the previous release and tries to push
the revert. If deployment `main` blocks that push the run ends `restore-unpushed`: the server is fine, revert the
release PR by hand. To go back later, release a new version; do not reuse a tag, or revert both files in
`apps/tudocuatui/` of the deployment repo in a non-`release/` PR (migrations stay).

**Run the image locally** (needs Docker): `docker build -t tudo . && docker run --rm -p 3000:3000 tudo`, then open
`http://localhost:3000`. The server needs the identity config, so add
`-e MM_IDENTITY_ISSUER=https://api.mmlabs.online -e TUDO_OWNER_SUB=<uuid>` (every `/api` call without a bearer is
then 401), plus `-e DATABASE_URL=...` for `/readyz`.

**Troubleshooting**: `release` fails at "guards" with the reason in the log. 502 from Cloudflare means the route is
not `http://tudocuatui:3000` or the container is not on the `web` network. Unhealthy container: `docker logs` on the
server. Container exits with code 2: the identity config is missing (`MM_IDENTITY_ISSUER`, `TUDO_OWNER_SUB`) or
`TUDO_AUTH_MODE` is not `identity`. Every `/api` call is 401 while signed in: the container cannot reach
`api.mmlabs.online` (JWKS). A `.env*` file never enters the image
(`.dockerignore`).

## Code map

| Path | Purpose |
|---|---|
| `src/App.tsx` | UI. It talks to data only through `useWardrobe()` |
| `src/data/useWardrobe.ts` | Hook: items, locations, save/remove/wear/importMany |
| `src/data/repo.ts` | `WardrobeRepo` interface (the only implementation is `repo.http.ts`) |
| `src/data/serverProbe.ts` | Startup `/healthz` probe: the Node server answers, or the error screen shows (no fallback) |
| `src/data/repo.http.ts` | API implementation of `WardrobeRepo` (calls `/api`) |
| `src/data/mappers.ts` | Maps Vietnamese UI labels ↔ DB enum ids |
| `src/data/photos.ts` | Client-side image resize before upload |
| `server/` | Node API (`/api`, `/healthz`, `/readyz`), serves `dist/`; Identity token check, Drive photos, AI settings |
| `db/migrations/` | Postgres schema, applied by `node server/migrate.js` |
| `docs/data-model.md` | ERD and design decisions |
| `Dockerfile`, `.dockerignore` | Production image: Vite build + Node server (`server/`) on :3000, non-root |
| `scripts/check-image.sh` | Image checks (config, layout, bundle, start exits, health, SPA fallback, no secrets, optional DB smoke) used by CI and `release.yml` |
| `.github/workflows/release.yml` | `release/vX.Y.Z` push: tag, build, push image, open the deployment PR |
| `deploy/deployment-repo/` | Drafts to copy into `mmlabs-online/deployment` (compose + deploy workflow) |
