## Attempt 1 — 2026-11-07
Verdict: PASS

### Checks (run by reviewer)
Run on Windows (Git Bash), branch `ticket/F-003`, `npx pnpm@10.34.3` (`--version` → 10.34.3).
- typecheck: `npx pnpm@10.34.3 typecheck` → `tsc --noEmit`, exit 0.
- format:check: `npx pnpm@10.34.3 format:check` → "All matched files use the correct format. Finished in 5ms on 19 files", exit 0 (oxfmt 0.76.0, "No config found, using defaults").
- test: not applicable (no test runner until F-005).
- build: `npx pnpm@10.34.3 build` → `✓ built in 251ms`, exit 0.
- Matches impl-log attempt 1 (19 files, all exit 0). No mismatch.

### Acceptance criteria
- [x] 1 typecheck passes — exit 0 above; `package.json:10` `"typecheck": "tsc --noEmit"`.
- [x] 2 format:check passes on a Windows checkout — exit 0 above; `git ls-files --eol | grep -c 'w/crlf'` → `0` (only non-LF entry is `public/favicon.png`, `-text`); `package.json:12` `"format:check": "oxfmt --check"`.
- [x] 3 build passes — exit 0 above.
- [x] 4 format:check catches unformatted code — run outside the repo (scratchpad `probe/src/fmt-probe.ts`, repo's `node_modules/.bin/oxfmt --check`): the plan's unformatted snippet → file listed, exit 1; formatted LF version → exit 0; formatted but CRLF version → exit 1 (so the LF normalisation is really what makes Windows pass). Repo tree not touched.
- [x] 5 format does not touch R10 files or prose — `.prettierignore:1-8` lists exactly `AGENTS.md`, `.figma/`, `*.md`, `docs/`, `work/`, `.claude/`, `pnpm-lock.yaml`, `dist/`. Did not run the writing `pnpm format` (reviewer is read-only); equivalent evidence: format:check matches 19 files, which equals the tracked formattable files outside the ignore list (2 `.github/*.yml`, `index.html`, `package.json`, 12 `src/**`, `tsconfig.json`, `vite.config.ts`, `.mise.toml`), so the 54 tracked `.md` files, `.figma/**` and `pnpm-lock.yaml` are excluded, and all 19 are already clean, so `format` is a no-op.
- [x] 6 workflow triggers and steps — `.github/workflows/ci.yml:3-7` PR + push to `main`; `:9-10` `permissions: contents: read`; `:12-14` concurrency; job id `ci` (`:17`), `ubuntu-latest`; steps in order checkout@v4, `pnpm/action-setup@v4` with no `version:`, setup-node@v4 `node-version: 22` + `cache: pnpm`, install `--frozen-lockfile`, typecheck, format:check, build (`:19-29`); no `pnpm test`; `grep 'secrets\.' .github` → none.
- [x] 7 pnpm pinned — `package.json:30` `"packageManager": "pnpm@10.34.3"`, equals `.mise.toml` `"npm:pnpm" = "10.34.3"`.
- [x] 8 lockfile does not churn — `git diff --exit-code origin/main...HEAD -- pnpm-lock.yaml` → exit 0 (`lockfileVersion: '9.0'`). I did not re-run `pnpm install` (reviewer must not install); the CI run on the PR proves `--frozen-lockfile` with 10.34.3.
- [x] 9 YAML valid — `npx --yes js-yaml@4.1.0` on both files (run from scratchpad cwd) → exit 0.
- [x] 10 risk-tiers.yml — `.github/risk-tiers.yml:6-22` `high` has `supabase/migrations/**`, `supabase/functions/**`, `src/features/auth/**`, `src/lib/supabase.ts`, `.github/workflows/deploy*`, `public/_redirects`, `wrangler.toml`, `.github/risk-tiers.yml`; header `:1-3` says not enforced yet; `low` and `default: medium` as planned.
- [x] 11 `.gitattributes` insertion-only — `git diff --numstat` → `3	0`; first rule is `* text=auto eol=lf` (`.gitattributes:2`); LFS rules unchanged.
- [x] 12 diff scope — `git diff --stat origin/main...HEAD`: `.gitattributes`, `.github/risk-tiers.yml`, `.github/workflows/ci.yml`, `.prettierignore`, `CLAUDE.md`, `package.json`, `work/backlog.md`, `work/tickets/F-003/**`. No `src/**`, `AGENTS.md`, `.figma/**`, `vite.config.ts`, `pnpm-lock.yaml`, `docs/**`.
- [x] 13 CLAUDE.md Commands — `CLAUDE.md:33` `Typecheck: pnpm typecheck. pnpm build does **not** typecheck.`; `:35` `Format: pnpm format (check: pnpm format:check)`; `:58` points at `.github/risk-tiers.yml`. Only these three lines changed.

Ming verification after merge (not verified here; the PR must carry these):
- Ticket AC1: the `ci` check runs and is green on the F-003 PR (`gh pr checks <PR>`, record in Handoff).
- Ticket AC3 / D10: Ming reviews `.github/risk-tiers.yml`; treat the PR as High for that file.
- M-3: after merge, Ming makes the `ci` check required on `main`.
- Optional: CI fails on a deliberately unformatted push (scratch branch).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1/R2/R4/R5/R6/R9 not affected (no app code, schema or UI). R3: workflow references no secrets, no `env`. R7: only planned files. R8: all existing checks green; no tests exist yet. R10: `AGENTS.md`, `.figma/**`, `vite.config.ts` not in the diff, and `.prettierignore` excludes `AGENTS.md` and `.figma/`.

### Nits (do not block)
- 💭 `CLAUDE.md:58` says the file is "reviewed by Ming (D10)" as if done; until Ming reviews it in the PR it is only a draft. Consider "to be reviewed by Ming" (or leave it, since it will be true on merge).
- 💭 `.prettierignore:1` `AGENTS.md` is already covered by `*.md` (`:3`); harmless and makes the R10 intent explicit.
- 💭 `wrangler.toml` and `public/_redirects` do not exist yet; the entries are forward-looking, which is fine.
- 💭 Reviewer observed an untracked `work/tickets/F-003/security-review.md` appear during this review (not created by the reviewer or the implementer's commits); the orchestrator should decide whether to commit it.

### Follow-ups (out of scope)
- CI step that computes and enforces PR tiers from `risk-tiers.yml` (A2); until then the file is advisory only.
- The project `CLAUDE.md` § Risk tiers High list does not mention `supabase/functions/**` or `src/lib/supabase.ts`, which `risk-tiers.yml` marks High (A3). Align the two after Ming's D10 review so they do not drift.
- Consider raising `.github/workflows/ci.yml`, `.prettierignore`, `package.json` scripts and `.github/risk-tiers.yml`-adjacent CI config to High (A5): a Medium PR could weaken the checks themselves. Ming's call in the D10 review.
- Optional oxfmt config file to silence "No config found".
- F-005 adds `pnpm test` to `ci.yml`.
