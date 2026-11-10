# Review — T-008

## Attempt 1 — 2026-11-10
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb`, diff base `origin/main`, HEAD `2f09eb3`. These match impl-log.md.
- typecheck: `pnpm typecheck`, exit 0
- format:check: `pnpm format:check`, exit 0 ("All matched files use the correct format", 96 files)
- test: `pnpm test`, 27 files and 391 tests passed
- test:coverage: `pnpm test:coverage`, exit 0, thresholds met (all files 99.82% stmts / 99.09% branches). `src/lib/version.ts` is at 100%: it is in include and thresholds and is hidden by the full-coverage skip in the text report.
- build: `pnpm build` ok. The plain bundle contains `Phiên bản ${e}` and no `v0.0.0`. `VITE_APP_VERSION=v0.0.0 pnpm build` inlines it as `var Bt=zt(\`v0.0.0\`)` in `dist/assets/index-*.js`.
- `bash scripts/check-public-supabase-env.test.sh`: 17/17 passed
- `bash -n scripts/check-image.sh`: ok. `actionlint`, `nginx` and `shellcheck` are not installed here, so they were not run.
- Docker: no daemon, so `docker build` and `check-image.sh` were not run end to end. These are left to the CI `image` job on the PR (see below).

### Acceptance criteria
- [x] A release build shows "Phiên bản vX.Y.Z", and a build without a version shows "Phiên bản dev". Evidence:
  - `src/lib/version.ts:1-7` and `src/lib/version.test.ts` (4 tests: tag, unset/empty, malformed incl. `"v0.1.1\nx"`, APP_VERSION=dev).
  - `src/features/layout/copy.test.ts`.
  - `src/App.test.tsx:31` "shows "Phiên bản dev" in local mode".
  - Local `vite preview` of a `VITE_APP_VERSION=v0.0.0` build renders "Phiên bản v0.0.0" (screenshots below).
  - Image path: `Dockerfile:24` writes `dist/version.txt`, `scripts/check-image.sh:53-62,83-86` asserts it, `ci.yml:61` passes v0.0.0 on the Supabase image and leaves the local image at `dev`. **To be confirmed by the CI `image` job.**
- [x] The version is only the validated tag, and R3 still holds.
  - `release.yml:110` passes `VITE_APP_VERSION=${{ steps.version.outputs.tag }}` in `build-args:` (a `with:` input) and `release.yml:122` passes `EXPECTED_VERSION` via `env:`. No new `${{ }}` in `run:`, no new secret, no new permission. The tag comes from the unchanged guard regex.
  - `Dockerfile:18` adds `ARG` in the build stage only, with no `ENV`.
  - `Dockerfile:19-23` checks the format. I ran it under `dash` (Debian's `/bin/sh`): `""`, `v1.2.3`, `v0.0.0` and `v10.20.30` pass. `v1.2.3;x`, `1.2.3`, `v1.2`, `v1.2.3.4`, multi-line (both orders), `" v1.2.3"`, `v1.2.3-rc`, `v1.2.3$(id)`, `vv1.2.3` and `dev` fail with exit 1.
  - The UI helper falls back to `dev` again as a third layer.
- [x] Visible but unobtrusive at 390px and in dark mode, and the Figma Make preview still works.
  - `src/App.tsx:159` and `src/index.css:2369-2374`: 12px text in `var(--muted)`.
  - Playwright at 390×844 (isMobile, hasTouch, DSF 1): light text is rgb(111,106,98) on rgb(246,241,231), dark text is rgb(193,185,173) on rgb(20,32,27). scrollWidth is 390, so there is no horizontal scroll. The line sits centered under the panel.
  - `git diff origin/main...HEAD -- vite.config.ts AGENTS.md .figma` is empty (R10). Dev and preview builds without the variable show `dev`, as the App test covers.
- [x] Unit test for the helper and the label; CI `image` job still green.
  - The unit tests are present and pass.
  - The CI `image` job is **to be confirmed on the PR**. By reading the code I expect it to pass, for these reasons:
    - The existing `docker history | grep VITE_` check (`check-image.sh:28`) only sees the final nginx stage of the multi-stage build: base layers, the two `COPY`s, `EXPOSE`, `HEALTHCHECK`. The new `ARG` and `RUN` lines are in the build stage, exactly like the two `VITE_SUPABASE_*` args that T-007's CI already proved green.
    - The image's `.Config.Env` gets nothing new.
- [x] typecheck, format, tests and build pass (see Checks).

### Implementer deviations (judged)
1. **Dockerfile `tr`/`wc`/`grep` chain instead of a single `grep -Eq`: accepted.** A bare `grep` cannot validate a value on its own: it is line-based (it accepts `v1.2.3\nx`), and the empty case still needs a separate branch. The chain is correct as tested above. It is slightly redundant (the `tr` step already rejects newlines), but harmless; see Nits.
2. **`[[ =~ ]]` for `EXPECTED_VERSION` in `check-image.sh:17`: accepted.** The script is bash, and the anchored regex matches the whole string, newlines included. Invalid input exits 2 before any `docker` call. The bundle grep passes the value as a positional argument (`check-image.sh:59`), as the T-007 security follow-up asked.
3. **CI comment above the step, not inside `build-args: |`: accepted.** A comment inside the block scalar would become part of the build-args value.

### "CI must prove" list (impl-log)
All of these are legitimate gaps given that there is no Docker daemon here. The CI `image` job on the PR covers `docker build` with both arg sets, plus `check-image.sh` on `ci-local` (dev) and `ci-supabase` (v0.0.0): the no-VITE_ config/history checks, the bundle grep and served `/version.txt`. It also covers nginx syntax implicitly, because the smoke step starts nginx.

Not covered by CI:
- The rejection of a malformed `VITE_APP_VERSION` at `docker build` time. I covered it by running the exact RUN script under dash.
- `actionlint`. The YAML changes are two `build-args` lines and two `env` entries, all in existing patterns.

The PR must not be merged unless the `image` job is green.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no data-layer change. The footer is in `App`, so it shows in both modes.
- R3: public tag only.
- R6: the copy is in `src/features/layout/copy.ts:1-3`.
- R7: every changed file is in the plan's file list. The `work/` files are workflow bookkeeping.
- R8: tests and coverage are in place.
- R9: checked by screenshot.
- R10: untouched.

### Nits (do not block)
- `Dockerfile:20-21`: the `wc -l` check is redundant, because `tr -d '0-9.v'` already rejects any newline. It is harmless.
- `check-image.sh:54`: `cat $ROOT/version.txt` is spliced into `sh -c`. `$ROOT` is a constant, so this is fine, but it differs from the positional style used two lines below.
- The demo photos show broken-image alt text in the sandbox screenshots, because there is no network access to the demo image hosts. This is unrelated to this ticket.

### Visual evidence
- `/tmp/claude-0/-home-user/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/t008-footer-390-light.png`
- `/tmp/claude-0/-home-user/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/t008-footer-390-dark.png`

### Ming's checks after merge
- The CI `image` job on the PR is green: both images build and `check-image.sh` reports `image ok`.
- After the next `release/vX.Y.Z`, open https://tudocuatui.mmlabs.online on the phone, scroll to the bottom and read "Phiên bản vX.Y.Z".
- `curl https://tudocuatui.mmlabs.online/version.txt` prints `vX.Y.Z`. Optionally, `curl -I` shows `Cache-Control: no-cache`.

### Follow-ups (out of scope)
- `check-image.sh:44`: the existing `$EXPECTED_URL` grep still splices the value into `sh -c`. It could use the positional style (from the T-007 security review; left unchanged under R7).
