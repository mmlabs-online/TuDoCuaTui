# T-008: Show the release version in the UI

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | ui |
| Gate | plan-approval |
| Depends on | T-007 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-10 |
| Claimed by | claude@2026-11-10T03:02:03Z |
| PR | — |

## Goal
Ming can see which release is running (e.g. "Phiên bản v0.1.1") in the app, the same way stoktok shows
"Phiên bản {STOKTOK_VERSION || 'dev'}" in its app shell, so a deploy can be checked on the phone.

## Feature reference
Not in `docs/feature-list.md`. Ming asked for it on 2026-11-10 ("tôi muốn thông tin version release vào UI").
Builds on T-007 (D20): releases are `vX.Y.Z` tags built by `.github/workflows/release.yml`. Reference:
`mmlabs-online/stoktok` `apps/web/components/shell/app-shell.tsx` (shows the version) and
`apps/web/app/healthz/route.ts`.

## Scope
- Bake the release tag into the static bundle at build time (TuDo is a static SPA: the version cannot come
  from a runtime env var). E.g. a non-secret build arg (`VITE_APP_VERSION` or `APP_VERSION`) in the
  `Dockerfile` build stage, passed by `release.yml` from the validated tag; builds without it show `dev`.
- Show it in the UI in one unobtrusive place (e.g. the header/footer or account area), in both local and
  Supabase mode, as "Phiên bản vX.Y.Z" / "Phiên bản dev". Copy lives in the feature's copy file (R6).
- Optionally write `dist/version.txt` (T-007 follow-up) so the version can be checked with `curl`.
- Update `scripts/check-image.sh` / the CI `image` job if needed so the version path is covered.

## Out of scope
- Changing the release flow, the guard script or the deployment repo.
- A changelog or "what's new" screen.

## Acceptance criteria
- [ ] A release build of `vX.Y.Z` shows "Phiên bản vX.Y.Z" in the app; a build without the version (dev, CI,
      Figma Make preview) shows "Phiên bản dev".
- [ ] The version is only the validated tag (no other build metadata, nothing secret); R3 still holds.
- [ ] Visible but unobtrusive at 390px and in dark mode (R9); the Figma Make preview still works (R10:
      `vite.config.ts` untouched unless the plan justifies it and Ming approves).
- [ ] Unit test for the version helper/label; CI `image` job still green.
- [ ] typecheck, format, tests and build pass.

## Technical notes
- Touches `Dockerfile` and `.github/workflows/release.yml` → High tier (T-007 risk-tiers): plan approval;
  security review at REVIEW.
- Pass the tag via env/`build-args` from the step output, never by interpolating untrusted input into `run:`.

## Test plan
- Unit: version label with and without the env value.
- CI: `image` job builds with a dummy version arg and checks it appears (and `dev` without it).
- Manual (Ming): after the next release, open the site on the phone and read the version.

## Notes / answers from Ming
- 2026-11-10: "tôi muốn thông tin version release vào UI".

- 2026-11-10: Plan approved (2026-11-10) — Ming: "duyệt"; assumptions 1–9 accepted as the plan's defaults (footer line, `Phiên bản vX.Y.Z` / `Phiên bản dev`, build arg VITE_APP_VERSION, version.txt + nginx no-cache, malformed version fails the build).

## Handoff

### 2026-11-10 — claude — BLOCKED
- Done: plan.md READY — VITE_APP_VERSION build arg from the validated tag, footer line "Phiên bản vX.Y.Z" / "Phiên bản dev", dist/version.txt, check-image + CI coverage; assumptions 1–9 listed.
- In progress / next: Ming approves the plan (and confirms or changes the assumptions); then /run implements.
- Gotchas: touches Dockerfile, release.yml, ci.yml, nginx.conf (High tier) — security review at REVIEW.
