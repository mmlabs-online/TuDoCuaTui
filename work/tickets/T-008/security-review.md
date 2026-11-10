# Security review — T-008

## Attempt 1 — 2026-11-10 (security-ai-generated-code-auditor, commit b082aa9)

**Verdict: no blocking findings (no 🔴, no 🟡).** Read-only; nothing run; no `.env` file opened.

- 🟢 **No `${{ }}` injection into `run:`.** The tag is validated once in `guards` (`release.yml:59-62`, `release/vX.Y.Z`, no leading zeros) and written to `$GITHUB_OUTPUT` (`:71`); it reaches scripts only via `env:` (`TAG` at `:85`, `:131`; `EXPECTED_VERSION` at `:122`). The other uses are in `with:` (`:106`, `:110`). The regex rules out a newline in the multiline `build-args`. `ci.yml:61,66` use literals (`v0.0.0`).
- 🟢 **The version can only be `vX.Y.Z` or empty/dev, enforced per layer.**
  - Dockerfile (`:19-23`): empty or `^v[0-9]+\.[0-9]+\.[0-9]+$`, plus a charset check (`tr -d '0-9.v'`) and a one-line check (`wc -l = 1`); `printf '%s\n'` at `:24` (no expansion). Leading zeros (`v01.2.3`) are allowed here but rejected by the release guard — harmless.
  - UI helper (`src/lib/version.ts:1-4`): anchored regex, otherwise `"dev"`; tests cover leading space, newline, pre-release suffix, empty (`version.test.ts:16-19`); rendered as React text (`App.tsx:159`) — no XSS path.
  - `check-image.sh:16-19`: `EXPECTED_VERSION` must match `^(dev|vX.Y.Z)$` or exit 2; `:59` passes the version as positional `$1`/`$2` to `sh -c`; `:54` uses only the constant `$ROOT`.
- 🟢 **R3 unchanged.** `VITE_APP_VERSION` is a build-stage `ARG` only, no `ENV` (`Dockerfile:15-18`); runtime stage (`:26-31`) has no ARG/ENV/VITE_; `provenance: false`, `sbom: false` kept (`release.yml:112-113`); no new secret. The `VITE_`-not-in-history check (`check-image.sh:29`) stays meaningful (final-stage history only).
- 🟢 **nginx change does not weaken headers** (`docker/nginx.conf:31-36`): `location = /version.txt` adds `Cache-Control: no-cache` and repeats `nosniff`, `Referrer-Policy`, `X-Frame-Options DENY` with `always`; no `try_files` fallback (missing file → 404); served as `text/plain`.
- 🟢 **No information leak beyond the version** (no SHA, build time, branch or mode).
- 🟢 **CI coverage sound** (`ci.yml:50-66`): local image must show `dev`; Supabase image must show `v0.0.0` in `version.txt`, the bundle and served `/version.txt` (`check-image.sh:53-62, 83-86`).

### Recommendations
- None blocking. Optional follow-up (R7): `check-image.sh:44` (T-007 code) splices `$EXPECTED_URL` into `sh -c`; switch to the positional pattern used at `:59` (defence in depth).

### Risks
- Low: worst case is a wrong but well-formed version shown, only possible via the release guard, which reserves the tag before the build.
