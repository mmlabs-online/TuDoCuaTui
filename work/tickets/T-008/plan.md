Status: READY

# Plan — T-008: Show the release version in the UI

Branch: `claude/loving-fermi-t90upb` (cloud session branch, from latest `main`, T-007 merged). Gate: plan-approval
(High tier: `Dockerfile`, `.github/workflows/release.yml`, `scripts/check-image.sh`). Implementation starts only
after Ming writes "Plan approved" in ticket.md. Security review runs at REVIEW.

## Feature summary
Not in `docs/feature-list.md`. Scope authority is the ticket, "Notes / answers from Ming", 2026-11-10:
> "tôi muốn thông tin version release vào UI".

Builds on `work/decisions.md`:
> D20 | 2026-11-09 | Hosting | Self-hosted on the home server …; image `mingming21400/tudocuatui` built by
> `release.yml` on GitHub's runner … Releases without the `VITE_*` secrets run in local mode.

Reference (read-only): stoktok `apps/web/components/shell/app-shell.tsx:25`:
`Phiên bản {process.env.STOKTOK_VERSION || 'dev'}`. TuDo is a static SPA, so the version is baked in at build time
(ticket Scope) instead of being read from a runtime env var.

**Proposed placement (for Ming to approve):** one small, muted, centered line at the very bottom of the page,
under the "Tất cả món đồ" panel: `Phiên bản v0.1.1` (or `Phiên bản dev`). It works the same way as stoktok's
sidebar footer, but it shows on every screen width. (stoktok's line sits in a desktop-only sidebar, so it is not
visible on a phone.) It stays out of the header, which is already full at 390px.

## Security summary (for Ming's plan approval)
- **What gets baked in:** one new **non-secret** build arg, `VITE_APP_VERSION`, used only in the Dockerfile build
  stage (`ARG`, no `ENV`), like the two `VITE_SUPABASE_*` args. `release.yml` sets it to
  `${{ steps.version.outputs.tag }}`, the tag the guard already checked against
  `^release/(v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))$`. No commit SHA, branch name, date or other
  metadata.
- **Checked three times:** (1) the release guard regex (unchanged). (2) The Dockerfile refuses to build unless
  the arg is empty or matches `v<digits>.<digits>.<digits>`. (3) The UI helper shows `dev` for anything that does
  not match `^v\d+\.\d+\.\d+$`. A malformed value can never show up in the UI or in `version.txt`.
- **No `${{ }}` in `run:`:** the tag goes into `build-args:` (an `with:` input, as the Supabase args already do)
  and into `env:` for the verify step. No new secret and no new permission.
- **`check-image.sh`** gets the expected version from an env var. The script validates it before use and passes
  it to `sh -c` as a positional argument, not by string splicing (this also answers the T-007 security follow-up
  for the new code).
- **`/version.txt`** is a public static file containing only the tag, e.g. `v0.1.1`. Its `Cache-Control: no-cache`
  stops Cloudflare from serving an old version: Cloudflare caches `.txt` at the edge by default.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A release build of `vX.Y.Z` shows "Phiên bản vX.Y.Z" in the app; a build without the version (dev, CI, Figma Make preview) shows "Phiên bản dev". | Unit: `src/lib/version.test.ts` (see Tests) and `src/features/layout/copy.test.ts`. `src/App.test.tsx › shows "Phiên bản dev" in local mode`. Image: in the CI `image` job, `check-image.sh` asserts `/version.txt` = `dev` on `tudocuatui:ci-local` and `v0.0.0` on `tudocuatui:ci-supabase` (built with `VITE_APP_VERSION=v0.0.0`). It also asserts that `v0.0.0` is in `/usr/share/nginx/html/assets/*.js` for the versioned image, and that the served `/version.txt` matches over HTTP in the smoke step. Locally: `VITE_APP_VERSION=v1.2.3 pnpm build && grep -rl 'v1.2.3' dist/assets` finds the bundle, and `pnpm build` with no value builds a bundle that shows `dev`. |
| 2 | The version is only the validated tag (no other build metadata, nothing secret); R3 still holds. | Read the `release.yml` diff: the only build-arg added is `VITE_APP_VERSION=${{ steps.version.outputs.tag }}`, and the verify step gets `EXPECTED_VERSION: ${{ steps.version.outputs.tag }}` via `env:`. No new `${{ }}` inside `run:`. Read the `Dockerfile` diff: `ARG VITE_APP_VERSION=` in the build stage only, no `ENV`, and the format check fails the build. Run `docker build --build-arg VITE_APP_VERSION='v1.2.3;x' .`: it must fail (if Docker is available; otherwise read the code). The existing `check-image.sh` checks (no `VITE_` in config/history, no `sb_secret_`, no `.env*`, no `*.map`) still pass in the CI `image` job. `scripts/check-public-supabase-env.sh` is unchanged. |
| 3 | Visible but unobtrusive at 390px and in dark mode (R9); the Figma Make preview still works (R10: `vite.config.ts` untouched). | `git diff --stat main` does not list `vite.config.ts`, `AGENTS.md` or `.figma/`. `pnpm dev` at 390px, light and dark: one centered `var(--muted)` line of about 12px under the panel, no horizontal scroll, not covered by the toast. The reviewer records a screenshot or a description in review.md. The Figma Make preview is a dev build without the env var, so it shows `Phiên bản dev`, and the App test covers the same path. |
| 4 | Unit test for the version helper/label; CI `image` job still green. | `pnpm test` runs `src/lib/version.test.ts` and `src/features/layout/copy.test.ts`. `src/lib/version.ts` is in the coverage include and thresholds in `vitest.config.ts`. The CI `image` job on the PR is green. `bash -n scripts/check-image.sh`. `actionlint .github/workflows/*.yml` if available (otherwise note it was not run). |
| 5 | typecheck, format, tests and build pass. | `pnpm typecheck && pnpm format:check && pnpm test && pnpm build` all exit 0, plus the CI `ci` job. |

## Ming verification after merge
- After the next release (`release/vX.Y.Z`), open https://tudocuatui.mmlabs.online on the phone, scroll to the
  bottom and read "Phiên bản vX.Y.Z".
- `curl https://tudocuatui.mmlabs.online/version.txt` prints `vX.Y.Z`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/version.ts` (new) | `appVersion(raw: string \| undefined): string` returns `raw` if it matches `^v\d+\.\d+\.\d+$`, else `"dev"`. `export const APP_VERSION = appVersion(import.meta.env.VITE_APP_VERSION as string \| undefined)` (same cast style as `src/lib/supabase.ts`). | Pure helper with a unit test (R8). Only a validated tag is ever shown (AC 2). |
| `src/lib/version.test.ts` (new) | Unit tests for `appVersion`. | AC 4, R8. |
| `src/features/layout/copy.ts` (new) | `LAYOUT_COPY = { version: (v: string) => \`Phiên bản ${v}\` } as const`. | R6: Vietnamese copy in one place per feature (same pattern as `src/features/items/copy.ts`). |
| `src/features/layout/copy.test.ts` (new) | Label test. | AC 4 ("label"). |
| `src/App.tsx` | After `</main>`, render `<footer className="app-version">{LAYOUT_COPY.version(APP_VERSION)}</footer>`. | Placement. Inside `App`, so it shows in local mode and in Supabase mode after sign-in. |
| `src/index.css` | Append one `.app-version` rule: `text-align: center; font-size: 12px; color: var(--muted); padding: 8px 16px calc(16px + env(safe-area-inset-bottom));`. | Unobtrusive, works with the theme variables in light and dark mode (R9). |
| `src/App.test.tsx` | Add `it('shows "Phiên bản dev" in local mode')`. | AC 1 (dev path rendered). |
| `vitest.config.ts` | Add `VITE_APP_VERSION: ""` to `test.env`. Add `src/lib/version.ts` to the coverage `include` and `thresholds`. | Tests must not depend on a developer's shell env (same reason as the existing `VITE_SUPABASE_*` blanks). Coverage for new pure logic. Not a Figma Make file (R10 covers `vite.config.ts` only). |
| `Dockerfile` | Build stage: `ARG VITE_APP_VERSION=`, then a check that fails the build unless the value is empty or matches `^v[0-9]+\.[0-9]+\.[0-9]+$`. After `pnpm build`, write `printf '%s\n' "${VITE_APP_VERSION:-dev}" > dist/version.txt`. Update the header comment. | Bakes the version in at build time (ticket Scope). `version.txt` is the optional curl check from the ticket. |
| `.github/workflows/release.yml` | `build-args:` adds `VITE_APP_VERSION=${{ steps.version.outputs.tag }}`. The `verify pushed digest` step adds `EXPECTED_VERSION: ${{ steps.version.outputs.tag }}` to `env:`. Update the header comment. | Passes the validated tag (ticket Technical notes: via build-args/env, not `run:` interpolation). |
| `.github/workflows/ci.yml` | `build (dummy Supabase build args)` adds `VITE_APP_VERSION=v0.0.0`. Its check step runs with `env: EXPECTED_VERSION: v0.0.0`. The local-mode check keeps the default (`dev`). Update the comment. | Ticket Test plan: "CI image job builds with a dummy version arg and checks it appears (and dev without it)". |
| `scripts/check-image.sh` | New `== version` section. `EXPECTED_VERSION` defaults to `dev` and must be `dev` or match `^v[0-9]+\.[0-9]+\.[0-9]+$` (exit 2 otherwise). `cat $ROOT/version.txt` must equal it. For a non-`dev` value, the string must be in `$ROOT/assets` (grep via `sh -c '…' _ "$EXPECTED_VERSION" "$ROOT/assets"`). In the smoke section, `wget -q -O - http://127.0.0.1:3000/version.txt` must equal it. Update the usage comment. | AC 1 and AC 4 for the image path. Shared by CI and release. |
| `docker/nginx.conf` | Add `location = /version.txt { add_header Cache-Control "no-cache"; <the three shared security headers> }`, following the existing per-location pattern. | Without it, Cloudflare's default edge cache for `.txt` can serve an old version after a deploy. |
| `README.md` | One line in the "Deploy" runbook: check the running version with `curl …/version.txt` or the footer. | Tells Ming how to check a release. |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/lib/version.test.ts › returns the tag for vX.Y.Z` (`"v0.1.1"`, `"v10.20.30"`) | Release path. |
| `src/lib/version.test.ts › returns "dev" when unset or empty` (`undefined`, `""`) | Dev, CI, Figma Make path. |
| `src/lib/version.test.ts › returns "dev" for anything that is not vX.Y.Z` (`"0.1.1"`, `"v0.1"`, `"v0.1.1-rc.1"`, `" v0.1.1"`, `"v0.1.1\nx"`, `"abc123"`) | Only the validated tag is shown (AC 2). |
| `src/lib/version.test.ts › APP_VERSION is "dev" in tests` | Module constant with `VITE_APP_VERSION=""`. |
| `src/features/layout/copy.test.ts › version label` (`"Phiên bản v0.1.1"`, `"Phiên bản dev"`) | Label (AC 4). |
| `src/App.test.tsx › App (local mode) › shows "Phiên bản dev" in local mode` | Rendered in the app (AC 1). |
| `scripts/check-image.sh` `== version` section, run by the CI `image` job on both images | Image path, `dev` and `v0.0.0` (AC 1, AC 4). |

## Approach
1. Add `src/lib/version.ts`, `src/features/layout/copy.ts` and their tests. Update `vitest.config.ts` (env blank +
   coverage).
2. Render the footer line in `App.tsx`. Add the `.app-version` CSS rule. Add the App test.
3. Dockerfile: `ARG VITE_APP_VERSION=` next to the Supabase args (build stage only, no `ENV`). Add a format check
   step that fails the build on a bad value. After `pnpm build`, write `dist/version.txt`. Vite exposes `VITE_*`
   env vars to `import.meta.env` by default, and Docker `ARG`s are env vars for `RUN`, so `vite.config.ts` needs
   no change (R10).
4. nginx: add the `/version.txt` location with `no-cache` and the repeated security headers.
5. `check-image.sh`: add the version checks (file, bundle, served over HTTP), driven by `EXPECTED_VERSION`.
6. `ci.yml`: dummy `VITE_APP_VERSION=v0.0.0` on the Supabase-mode build, `EXPECTED_VERSION` on its check.
   `release.yml`: the build-arg and the verify-step env from `steps.version.outputs.tag`.
7. README line. Run the checks.

Rules:
- R1: no data access changes. The footer is in `App` and shows in both modes.
- R3: the version is public and validated; no secret is added; the existing image checks are unchanged and stay
  green.
- R6: copy goes in `src/features/layout/copy.ts`.
- R8: unit tests are listed above.
- R9: 390px and dark mode via theme variables.
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.
- R7: no other changes.

## Specialist input used
None (no `consult-*.md` for T-008). Adopted from `work/tickets/T-007/security-review.md`: "Passing it as a
positional argument would be safer". The new `check-image.sh` grep follows this. The existing `$EXPECTED_URL` grep
is not changed (out of scope, R7).

## Assumptions
For Ming to confirm with the plan approval:
1. **Placement:** a small muted centered footer line under the item panel, on every screen width. It is not in
   the header or the hero, and it is not on the login screen. In Supabase mode it shows after sign-in, because
   `App` renders inside `AuthGate`.
2. **Format:** `Phiên bản v0.1.1`, the tag as is, with the leading `v`. Without a version it shows
   `Phiên bản dev`, the same as stoktok. A plain `pnpm build`, CI builds, the Figma Make preview and `pnpm dev`
   all show `dev`.
3. **Build arg name:** `VITE_APP_VERSION`. The `VITE_` prefix is required so Vite exposes it without changing
   `vite.config.ts`. It is not a secret, but it does share the `VITE_` prefix that `check-image.sh` already looks
   for in the image config and history. It stays out of the image config and history because it is an `ARG` in
   the build stage only, so the existing checks still pass.
4. **`dist/version.txt` is included** (optional in the ticket). It holds `vX.Y.Z` or `dev`, is public, and is
   served with `Cache-Control: no-cache`. This needs a small `docker/nginx.conf` change, which T-007 did not
   list as High tier. If Ming prefers, drop `version.txt` and the nginx change; the UI line alone meets the
   acceptance criteria.
5. **CI dummy version:** `v0.0.0`, on the Supabase-mode CI image only. The local-mode CI image keeps no version
   and must show `dev`.
6. **Dockerfile fails the build** on a malformed `VITE_APP_VERSION` instead of silently falling back to `dev`.
7. **No healthz/JSON endpoint.** stoktok's `healthz/route.ts` is a server route; TuDo has no server, so
   `version.txt` covers the "check with curl" need.
8. **No release-flow change:** the guard, tag step, deployment PR and `release.env` (`TUDOCUATUI_VERSION` is
   already written) stay as they are (ticket Out of scope).
9. **Hotspot files:** `src/App.tsx`, `src/index.css` and `src/App.test.tsx` are shared with UI tickets. The
   changes are one line in `App.tsx`, one CSS rule appended at the end and one test, so conflicts should be easy
   to resolve.
10. Estimated diff: about 120 changed lines, one implement/review cycle.

## Blocking questions
None. Placement and the assumptions above are confirmed through the plan-approval gate.

## Split proposal
None.
