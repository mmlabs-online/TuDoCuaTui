# Drafts for mmlabs-online/deployment

These files mirror their target paths in the deployment repo. Copy them verbatim into a setup PR
on `mmlabs-online/deployment` (not a `release/*` branch, so `pr-scope` does not restrict it).

| Here | Goes to | When |
|---|---|---|
| `.github/workflows/deploy-tudocuatui.yml` | `.github/workflows/deploy-tudocuatui.yml` | Setup PR with the postgres registration (M-12) |
| `.github/workflows/deploy-tudocuatui.yml` (T-005.5 version) + `apps/tudocuatui/compose.yml` (comments) | same paths | Setup PR `setup/tudocuatui-drive-secrets`, merged only after the environment `tudocuatui` exists (M-15 step 2) |
| `apps/tudocuatui/compose.yml` | `apps/tudocuatui/compose.yml` | Inside the first Node release PR, see M-14 in TuDo `work/ming-todo.md` |

Why the split: the pinned nginx release has no `migrate` command and no database. The workflow only runs
`backup` and `migrate` if the live `compose.yml` defines a `migrate` service, so it is safe to ship first; the
new compose then lands with the first Node image in one merge (migrate, then replace the app).

Postgres first: in the deployment repo, on a branch that does not start with `release/`, run
`bash postgres/scripts/add-app-db.sh tudocuatui` and commit its two outputs with the workflow (see M-12 in
`work/ming-todo.md`).

Also add this line to the deployment repo's `.github/CODEOWNERS`:

```
/apps/tudocuatui/  @didi-code0980
```

`apps/tudocuatui/release.env` is not drafted: the TuDoCuaTui release workflow writes it
(`TUDOCUATUI_IMAGE=mingming21400/tudocuatui:vX.Y.Z@sha256:<digest>` and `TUDOCUATUI_VERSION=vX.Y.Z`) in a
`release/tudocuatui-vX.Y.Z` pull request that changes only that file, which is what `pr-scope` allows. Until
it exists, deploy-tudocuatui skips, so merging the setup PR deploys nothing.

No hostname or ingress rule belongs in either repo: cloudflared is remotely managed (Cloudflare
dashboard). The published application `tudocuatui.mmlabs.online` must point to the service
**`http://tudocuatui:3000`** (HTTP, not HTTPS). `DATABASE_URL` exists only in the host env file
(`/Users/mingming/.config/tudocuatui/tudocuatui.env`), written by the deploy from the deployment repo's
`postgres/secrets/apps/tudocuatui.password`; it is never in the TuDoCuaTui repo or the image. After a password
rotation or a change of the Drive secrets below, run `deploy-tudocuatui` with `workflow_dispatch` from `main`
to rewrite it.

## Google Drive secrets (T-005.5)

Photos (D27) need four values in the same host env file. They come from the GitHub environment `tudocuatui` of this
repo (deployment branches: `main` only), as secrets `TUDOCUATUI_GOOGLE_CLIENT_ID`, `TUDOCUATUI_GOOGLE_CLIENT_SECRET`,
`TUDOCUATUI_GOOGLE_REFRESH_TOKEN` and `TUDOCUATUI_DRIVE_FOLDER_ID`. The `envfile` step writes them unprefixed after
`DATABASE_URL`, only when all four are set (1 to 3 set fails the run; malformed values fail it; none set keeps today's
file). Never printed. The script `scripts/drive-connect.mjs` in the TuDoCuaTui repo creates the values. Rotation:
`gh secret set …` then `workflow_dispatch` (a manual run always recreates the app, so the new env file is read). The full runbook is M-15 in
TuDoCuaTui `work/ming-todo.md`.

Migrations must be expand-then-contract: a rollback restores the previous image but never un-migrates. Never
run `docker compose down -v` or remove volumes for this project's neighbours: all data is in the shared `pgdata`.

Rollback: if the new container fails its health check, deploy-tudocuatui restores the previous release.
If deployment `main` is protected and `github-actions` cannot bypass it, the revert cannot be pushed
(`restore-unpushed`): the server is back on the old release, so revert the release PR by hand.

First Node release and rollback (T-015, D26): the compose and `release.env` of the first Node release go to
`main` in one push (M-14), never separately. An automatic restore brings back the nginx compose and the nginx
`release.env` together. A deliberate rollback later is a non-`release/` PR that reverts both files in
`apps/tudocuatui/`; migrations stay.
