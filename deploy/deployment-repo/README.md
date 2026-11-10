# Drafts for mmlabs-online/deployment

These files mirror their target paths in the deployment repo. Copy them verbatim into a setup PR
on `mmlabs-online/deployment` (not a `release/*` branch, so `pr-scope` does not restrict it).

| Here | Goes to |
|---|---|
| `apps/tudocuatui/compose.yml` | `apps/tudocuatui/compose.yml` |
| `.github/workflows/deploy-tudocuatui.yml` | `.github/workflows/deploy-tudocuatui.yml` |

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
**`http://tudocuatui:3000`** (HTTP, not HTTPS). The app has no secrets on the server: the only values in the
image are the public Supabase URL and anon key, baked in at build time.

Rollback: if the new container fails its health check, deploy-tudocuatui restores the previous release.
If deployment `main` is protected and `github-actions` cannot bypass it, the revert cannot be pushed
(`restore-unpushed`): the server is back on the old release, so revert the release PR by hand.
