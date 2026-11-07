Status: READY

# Plan — F-003: Add CI pipeline

## Feature summary
`docs/feature-list.md`, F-003 · CI pipeline · P0 · M1 · S:
> - GitHub Actions on every PR: `pnpm install --frozen-lockfile`, `tsc --noEmit`, `oxfmt --check`, `pnpm build`, and `vitest run` (once F-005 exists).
> - **AC:** the workflow runs on PRs to `main`; status checks are required in branch protection (owner sets this manually).

Ticket scope (quoted):
> - `.github/workflows/ci.yml` on `pull_request` to `main` and on `push` to `main`: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, and `pnpm test` once F-005 has merged (F-005 adds that step).
> - `package.json` scripts: `typecheck` (`tsc --noEmit`), `format:check` (`oxfmt --check`).
> - Pin pnpm in CI to the version in `.mise.toml` (10.34.3), for example with a `packageManager` field.
> - Normalise line endings to LF (`* text=auto eol=lf` in `.gitattributes`) and run `pnpm format` once, so `format:check` passes on Windows checkouts too.
> - Draft `.github/risk-tiers.yml` from the High paths in the project `CLAUDE.md`.

Out of scope (ticket): branch protection / required checks; DB tests in CI. The `pnpm test` step is also out of scope here: F-005 adds it.

`work/decisions.md`:
> D10 · First `risk-tiers.yml` · Ming reviews it as part of the F-003 PR. · It sets merge rules for every later PR.
> D15 · Agents · **Claude Code only.**

`docs/plan-M1.md` line 158: "F-003: only the first `risk-tiers.yml` (D10); the rest of F-003 is Medium."

## Acceptance criteria → verification
The reviewer runs everything below locally on Windows (Git Bash), on branch `ticket/F-003`, with pnpm 10.34.3 via `npx pnpm@10.34.3` (the global pnpm is 11.5.0).

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `pnpm typecheck` passes (ticket AC2) | `npx pnpm@10.34.3 typecheck` exits 0. `package.json` has `"typecheck": "tsc --noEmit"`. |
| 2 | `pnpm format:check` passes on a Windows checkout (ticket AC2) | `npx pnpm@10.34.3 format:check` exits 0. Also `git ls-files --eol \| grep -c 'w/crlf'` prints `0`. `package.json` has `"format:check": "oxfmt --check"`. |
| 3 | `pnpm build` passes (ticket AC2) | `npx pnpm@10.34.3 build` exits 0. |
| 4 | `format:check` catches unformatted code (ticket test plan, run locally instead of on a scratch branch) | `printf 'const  x = {a:1,\n  b:2}\n' > src/fmt-probe.ts && npx pnpm@10.34.3 format:check; echo "exit=$?"` → non-zero exit, `src/fmt-probe.ts` listed. Then `rm src/fmt-probe.ts` and `git status --porcelain` is empty again. |
| 5 | `format` does not touch R10 files or prose | `.prettierignore` exists and lists `AGENTS.md`, `.figma/`, `*.md`, `docs/`, `work/`, `.claude/`, `pnpm-lock.yaml`, `dist/`. Run `npx pnpm@10.34.3 format` on the clean branch → `git status --porcelain` stays empty (everything is already formatted, and ignored files are not rewritten). |
| 6 | Workflow triggers and steps (ticket AC1, static part) | Read `.github/workflows/ci.yml`: `on.pull_request.branches: [main]` and `on.push.branches: [main]`; one job with id `ci` (M-3 requires a check named `ci`); steps in order: `actions/checkout@v4`, `pnpm/action-setup@v4` **without** a `version:` input, `actions/setup-node@v4` with `node-version: 22` and `cache: pnpm`, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`. No `pnpm test` step. `permissions: contents: read`. No secrets referenced. |
| 7 | pnpm pinned to 10.34.3 | `package.json` has `"packageManager": "pnpm@10.34.3"`, matching `.mise.toml` (`"npm:pnpm" = "10.34.3"`). |
| 8 | Lockfile does not churn | `npx pnpm@10.34.3 install --frozen-lockfile` exits 0, and `git diff --exit-code origin/main...HEAD -- pnpm-lock.yaml` exits 0. |
| 9 | YAML files are valid | `npx --yes js-yaml@4.1.0 .github/workflows/ci.yml > /dev/null && npx --yes js-yaml@4.1.0 .github/risk-tiers.yml > /dev/null` exits 0 (one-off CLI, no dependency added). |
| 10 | `.github/risk-tiers.yml` exists with the High paths from the project `CLAUDE.md` (ticket AC3, file part) | The `high` list contains at least `supabase/migrations/**`, `src/features/auth/**`, `public/_redirects`, `.github/workflows/deploy*` and a Cloudflare Pages config entry (`wrangler.toml`), plus `.github/risk-tiers.yml` itself. A header comment says the file is not enforced by CI yet. |
| 11 | `.gitattributes` change is insertion-only | `git diff --numstat origin/main...HEAD -- .gitattributes` shows `2	0` (or `N	0`: lines added, zero removed), and the first rule in the file is `* text=auto eol=lf`. |
| 12 | Diff scope (R7, R10) | `git diff --stat origin/main...HEAD` lists only: `.gitattributes`, `.prettierignore`, `package.json`, `.github/workflows/ci.yml`, `.github/risk-tiers.yml`, `CLAUDE.md`, `work/backlog.md`, `work/tickets/F-003/**`. In particular **no** `src/**`, `AGENTS.md`, `.figma/**`, `vite.config.ts`, `pnpm-lock.yaml`, `docs/**`. |
| 13 | `CLAUDE.md` Commands lines are correct (ticket technical note) | `CLAUDE.md` § Commands says `Typecheck: pnpm typecheck` and `Format: pnpm format (check: pnpm format:check)`, still says `pnpm build` does **not** typecheck, and § Risk tiers points at `.github/risk-tiers.yml` as existing. Only those lines change (`git diff origin/main...HEAD -- CLAUDE.md`). |

## Ming verification after merge
- **Ticket AC1 — workflow green on its own PR.** The PR does not exist when the reviewer runs. After the orchestrator opens the PR, the `ci` check must run and be green (the orchestrator checks with `gh pr checks <PR>` and records it in Handoff); Ming sees it before merging.
- **Ticket AC3 — Ming has reviewed `.github/risk-tiers.yml` (D10).** Ming reviews the file in the PR. Treat the PR as High for that file (`docs/plan-M1.md` line 158).
- **Branch protection (M-3 in `work/ming-todo.md`):** after merge, Ming makes the `ci` check required on `main`.
- Optional: CI fails on a deliberately unformatted push (the ticket's scratch-branch test). Criterion 4 covers this locally.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `.gitattributes` | Insert at the very top: a comment line and `* text=auto eol=lf`. Leave the Figma Make LFS rules byte-identical below it. | Ticket scope: LF line endings so `format:check` passes on Windows. |
| `.prettierignore` (new) | `AGENTS.md`, `.figma/`, `*.md`, `docs/`, `work/`, `.claude/`, `pnpm-lock.yaml`, `dist/` (one per line). | Without it, `pnpm format` (also run by Figma Make's `.figma/make/format`) rewrites R10 files and 40 prose files (consult findings 2–3). oxfmt reads `.prettierignore` from the cwd automatically. |
| `package.json` | Add scripts `"typecheck": "tsc --noEmit"` and `"format:check": "oxfmt --check"`; keep `"format": "oxfmt"` as it is; add top-level `"packageManager": "pnpm@10.34.3"`. No dependency changes. | Ticket scope (scripts and pnpm pin). |
| `.github/workflows/ci.yml` (new) | Workflow `name: ci`, job `ci` on `ubuntu-latest`, triggers, permissions, concurrency and steps as in criterion 6. | Ticket scope. |
| `.github/risk-tiers.yml` (new) | Draft tier file, see Approach step 7. | Ticket scope; D10. |
| `CLAUDE.md` | § Commands: Typecheck → `pnpm typecheck` (keep "`pnpm build` does **not** typecheck"); Format → `pnpm format` (check: `pnpm format:check`). § Risk tiers: the `risk-tiers.yml` line points to the file (draft, reviewed by Ming, not yet enforced). Nothing else. Leave the `@AGENTS.md` include and the comment untouched. | Ticket technical note ("fix that line in this PR"). On `main` the line already says build does not typecheck; what is left is the "becomes … with F-003" wording. |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None (no unit tests). | F-003 adds no TypeScript logic, and Vitest arrives with F-005 (R8 applies only once F-005 has landed). Verification is the command checks above. |

## Approach
Order matters: the line-ending step uses `git reset --hard`, so it runs on a clean tree, right after `.gitattributes` is committed.

1. **Precondition (no lost work).** `git status --porcelain` must be empty. If it is not (for example an uncommitted `plan.md` or consult file), commit those files first (`F-003: …`). Do not stash; do not run the renormalise step with any change pending.
2. **`.gitattributes`.** Insert these two lines at the top of the file, followed by one blank line:
   ```
   # Line endings: store and check out text as LF (oxfmt --check on Windows).
   * text=auto eol=lf
   ```
   The later, more specific LFS rules keep their `-text` (the last matching rule wins). `public/.gitattributes` is not touched. Commit only this file: `F-003: normalise line endings to LF`.
3. **Renormalise without changing blobs.**
   - `git add --renormalize .` and then `git status --porcelain` → expected **empty**, because every file is already LF in the index (`git ls-files --eol`: 38 × `i/lf w/crlf`, 45 × `i/lf w/lf`, 1 × `-text`). If anything gets staged, stop: do not commit it, run `git reset -q`, and record the file list in `impl-log.md` (deviation).
   - Rewrite the working tree as LF: `git rm --cached -r -q . && git reset --hard -q HEAD`. Untracked and ignored files (`node_modules/`, `dist/`) are not touched; this tree has no LFS objects (`public/favicon.png` is `-filter`).
   - Check: `git ls-files --eol | grep -c 'w/crlf'` → `0`, and `git status --porcelain` is empty. The working-tree copies of `AGENTS.md` and `.figma/**` become LF too. Git content is unchanged, so this is not an R10 edit.
4. **`.prettierignore`** with the entries listed in Files.
5. **`package.json`**: the two scripts and `packageManager`, 2-space JSON as it is now.
6. **`.github/workflows/ci.yml`**:
   - `name: ci`
   - `on: pull_request: branches: [main]` and `push: branches: [main]`
   - `permissions: contents: read`
   - `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }` (stoktok pattern)
   - `jobs.ci` (runs-on `ubuntu-latest`) with the steps from criterion 6, each `run:` a plain `pnpm <script>`.
   - No `env`, no secrets. `vite.config.ts` reads the committed `.figma/make/site.json`, so the build needs nothing else.
   - Leave a short comment where F-005 will add `pnpm test`.
7. **`.github/risk-tiers.yml`**: the consult's shape, plus a header comment: "Draft v1 (F-003). Not enforced yet; no CI step computes tiers. Precedence: high > low > default. Globs use gitignore syntax. Ming reviews this file (D10)."
   ```yaml
   version: 1
   default: medium
   high:
     - "supabase/migrations/**"
     - "supabase/functions/**"
     - "src/features/auth/**"
     - "src/lib/supabase.ts"
     - ".github/workflows/deploy*"
     - "public/_redirects"
     - "wrangler.toml"
     - ".github/risk-tiers.yml"
   low:
     - "docs/**"
     - "work/**"
     - "**/*.test.ts"
     - "**/*.test.tsx"
   ```
   Put a one-line reason comment above each High entry instead of after it, so oxfmt's comment alignment does not churn.
8. **`CLAUDE.md`**: edit the three lines described in Files.
9. **Install with the pinned pnpm, no lockfile churn:** `npx pnpm@10.34.3 install --frozen-lockfile`. If pnpm refuses to recreate `node_modules` without a TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, because the current `node_modules` came from pnpm 11), run `CI=true npx pnpm@10.34.3 install --frozen-lockfile`. Then `git diff --exit-code pnpm-lock.yaml` must exit 0. Never run a plain `pnpm install` with the global 11.5.0.
10. **Format once:** `npx pnpm@10.34.3 format`. The expected change is limited to the new `.github/*.yml` files (and `package.json` if its layout changes). No change under `src/**`, because the consult confirmed every code blob is already oxfmt-clean as LF. If any `src/**` file changes, stop and record it: that would be a real formatting change outside the plan.
11. **Run every check** in the verification table (1–13). Commit in small steps (`F-003: add typecheck and format:check scripts, pin pnpm`, `F-003: add CI workflow`, `F-003: draft risk-tiers.yml`, `F-003: update CLAUDE.md commands`) and push `ticket/F-003`.

Rules:
- **R7**: only the files listed.
- **R10**: `AGENTS.md`, `.figma/` and `vite.config.ts` are not edited, and `.prettierignore` keeps the formatter away from them in the future.
- **R3**: the workflow uses no secrets.
- **R1, R2, R4, R5, R6, R9**: not affected (no app code, schema or UI changes).
- **R8**: the checks that exist (typecheck, format:check, build) must be green; tests do not exist yet.

## Specialist input used
From `consult-software-architect.md`:
- **Adopted, finding 1/2 (67 files, code differs only by CRLF):** this is why step 10 expects no `src/**` changes.
- **Adopted, finding 3 + recommendation `.prettierignore` before `pnpm format`:** R10 protection and a reviewable diff.
- **Adopted, finding 4 + recommendation (eol line at the top, renormalise on a clean tree):** the exact commands are in step 3. I added a commit-first precondition, because `reset --hard` would otherwise discard an uncommitted `.gitattributes` edit.
- **Adopted, finding 5 (oxfmt `--check`, `.prettierignore` auto-read):** the scripts stay plain.
- **Adopted, workflow shape** (stoktok actions v4, `pnpm/action-setup` without `version:`, Node 22, `cache: pnpm`, triggers, `permissions`, `concurrency`). One addition: the job id and workflow name are both `ci`, so M-3 ("require the `ci` check") matches.
- **Adopted, lockfile recommendation:** `npx pnpm@10.34.3` (corepack or mise would also work; npx needs no setup).
- **Adopted, `risk-tiers.yml` shape**, with a header comment that it is not enforced yet (the consult lists Ming assuming it is enforced as a risk).
- **Adopted, CLAUDE.md fix.** Main already says build does not typecheck, so only the "with F-003" wording changes.
- **Open questions 1–4: consult defaults adopted as Assumptions A1–A4.**
- **Rejected:** none.

## Assumptions
- **A1 (consult Q1):** Markdown is not formatted (`*.md` is in `.prettierignore`). Ming can opt in later.
- **A2 (consult Q2):** No tier-computation CI step in F-003. The ticket says "draft". A follow-up ticket can add enforcement; the implementer lists it under follow-ups.
- **A3 (consult Q3):** `src/lib/supabase.ts` is High (anon-key / auth client boundary, R3), and so are `supabase/functions/**` (server secrets) and `wrangler.toml` (Cloudflare Pages config, the "production deploy config" in the project `CLAUDE.md`). Ming can lower them in the D10 review.
- **A4 (consult Q4):** `pnpm/action-setup` reads the version from `packageManager`, so the version is set in one place (`package.json` = `.mise.toml`).
- **A5:** `.github/workflows/ci.yml` itself stays Medium (default) in `risk-tiers.yml`. The project `CLAUDE.md` names only `deploy*` workflows as High. Ming may raise it in the D10 review.
- **A6:** Developers with the global pnpm 11 get a `packageManager` mismatch warning or error. The workaround is `mise` or `npx pnpm@10.34.3`. This is accepted; it is the point of the pin.
- **A7:** Ticket "AC2 … in CI" is proven by the PR's `ci` run (Ming verification). GitHub runners check out LF anyway, so the Windows run is the stricter one.
- **Hotspots:** F-005 (BACKLOG, depends on F-003) will edit `.github/workflows/ci.yml` (adds `pnpm test`) and `package.json`. No other ticket is `IN_PROGRESS`/`REVIEW`/`DONE`, and `src/App.tsx` is not touched, so no rebase is expected.
- **Tier of this PR:** High for `.github/risk-tiers.yml` (D10), so Ming reviews the PR. Everything else is Medium.

## Blocking questions
None. Ming delegated the open choices ("tự quyết định"), and the consult defaults are recorded as A1–A5.

## Split proposal
None. Expected diff is about 80–100 changed lines across 6 files (plus `work/`).
