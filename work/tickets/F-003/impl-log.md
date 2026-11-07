## Attempt 1 — 2026-11-07

### Files touched
| File | Required because |
|---|---|
| `.gitattributes` | Insert-only (+3 / -0): comment, `* text=auto eol=lf`, blank line. LF so `format:check` passes on Windows. |
| `.prettierignore` (new) | Keeps `format` away from R10 files and prose. |
| `package.json` | `typecheck`, `format:check` scripts, `packageManager: pnpm@10.34.3`. |
| `.github/workflows/ci.yml` (new) | CI workflow, job `ci`. |
| `.github/risk-tiers.yml` (new) | Draft tier file (D10). |
| `CLAUDE.md` | Three lines: Typecheck, Format, risk-tiers pointer. |

### Tests added / changed
- None (plan: no unit tests; Vitest arrives with F-005).

### Checks (actual output summary)
- typecheck: `npx pnpm@10.34.3 typecheck` exit 0.
- format:check: "All matched files use the correct format." (19 files), exit 0. `git ls-files --eol | grep -c 'w/crlf'` = 0.
- test: not applicable (no test runner yet).
- build: `vite build` exit 0, "built in 842ms".
- Probe (criterion 4): unformatted `src/fmt-probe.ts` -> `format:check` listed it, exit 1; file removed, tree clean again.
- Line-ending step: `git add --renormalize .` staged nothing (status empty); `git rm --cached -r -q . && git reset --hard -q HEAD` ran on a clean tree; status empty afterwards.
- `npx pnpm@10.34.3 install --frozen-lockfile` needed `CI=true` (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY, as the plan anticipated); `pnpm-lock.yaml` unchanged (`git diff --exit-code origin/main...HEAD -- pnpm-lock.yaml` = 0).
- `pnpm format` on the clean branch changed nothing under `src/**`, `AGENTS.md` or `.figma/**` (only the new/edited files existed in status).
- YAML: js-yaml 4.1.0 parsed `ci.yml` and `risk-tiers.yml`, exit 0.
- Diff scope vs origin/main: only the planned files plus `work/**`.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- A follow-up ticket could add a CI step that computes PR tiers from `risk-tiers.yml` (A2).
- `oxfmt` prints "No config found, using defaults"; a config file is optional.
- F-005 adds `pnpm test` to `ci.yml`.
- Plan step 11 says to push `ticket/F-003`; skipped per the caller's instruction (no push).

### Scope self-check
- Could the diff be smaller? No.
- Diff size (excluding work/): +81 / -3 lines approx.
