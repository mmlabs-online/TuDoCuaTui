# Impl log — T-008

## Attempt 1

### Files touched
| File | Required because |
|---|---|
| `src/lib/version.ts` (new), `src/lib/version.test.ts` (new) | Validated version helper + unit tests (AC 1, 2, 4; R8) |
| `src/features/layout/copy.ts` (new), `copy.test.ts` (new) | R6 copy + label test |
| `src/App.tsx` | `<footer className="app-version">` after `</main>` |
| `src/index.css` | `.app-version` rule appended |
| `src/App.test.tsx` | "shows Phiên bản dev in local mode" |
| `vitest.config.ts` | `VITE_APP_VERSION: ""` in test.env; `src/lib/version.ts` in coverage include + thresholds |
| `Dockerfile` | `ARG VITE_APP_VERSION=` (build stage, no ENV), format check, `dist/version.txt` |
| `docker/nginx.conf` | `location = /version.txt` with `no-cache` + shared headers |
| `scripts/check-image.sh` | `EXPECTED_VERSION` validation, `== version` section, served `/version.txt` check |
| `.github/workflows/release.yml` | build-arg + `EXPECTED_VERSION` env on verify step, header comment |
| `.github/workflows/ci.yml` | `VITE_APP_VERSION=v0.0.0` on supabase build; `EXPECTED_VERSION: v0.0.0` on its check |
| `README.md` | One line in Deploy runbook |

### Deviations
- Dockerfile format check uses a `tr`/`wc`/`grep` chain instead of a single `grep -Eq`: grep on empty input never matches (rejected the allowed empty value) and is per-line (accepted `v1.2.3\nx`). Verified by hand: empty, `v1.2.3` pass; `v1.2.3;x`, `1.2`, `v1.2`, multi-line reject.
- `check-image.sh` validates `EXPECTED_VERSION` with bash `[[ =~ ]]` (script is bash) for the same reason.
- No YAML comment inside the `build-args: |` block in ci.yml (it would become part of the value); comment placed above the step.

### Check results
- `pnpm typecheck`: exit 0
- `pnpm format:check`: exit 0
- `pnpm test`: 27 files, 391 tests passed
- `pnpm test:coverage`: passed, thresholds met (99.82% stmts, 99.09% branches)
- `pnpm build`: ok; plain build bundle contains `Phiên bản ${e}` with no tag (dev); `VITE_APP_VERSION=v0.0.0 pnpm build` bundle contains `v0.0.0`
- `bash scripts/check-public-supabase-env.test.sh`: 17/17 passed
- `bash -n scripts/check-image.sh`: ok; ci.yml and release.yml parse as YAML

### Not run (CI must prove)
- `docker build` (no daemon): Dockerfile ARG/format check/`version.txt` write, rejection of `v1.2.3;x` end to end
- `scripts/check-image.sh` end to end on `ci-local` (dev) and `ci-supabase` (v0.0.0), including served `/version.txt` and the existing no-VITE_-in-history check with the new ARG
- nginx config syntax (`nginx -t`), `actionlint`
- 390px light/dark visual check (not done; CSS uses theme variables only)

### Out-of-plan files
None.

### Follow-ups
None.

### Scope self-check
Only plan files changed; `vite.config.ts`, `AGENTS.md`, `.figma/`, `CLAUDE.md`, plan.md, ticket.md untouched; no secrets.
