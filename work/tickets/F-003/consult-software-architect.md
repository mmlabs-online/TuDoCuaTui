# Consult — software-architect — F-003 (2026-11-07)

**Findings**
1. The "25 files" count is outdated. `npx oxfmt --list-different` (oxfmt 0.76.0) lists **67 files**: oxfmt also formats `.md`, `.json`, `.toml` (`.mise.toml`), `.html`, `.css`, `.yml`, plus TS/TSX. It skips `pnpm-lock.yaml`, `node_modules` and `.gitignore`d paths by default.
2. Code files differ only by CRLF. Piping each committed (LF) blob through `oxfmt --stdin-filepath` gives **no change** for every `src/**`, json, html, css, tsconfig and `vite.config.ts` file. 40 markdown files (`.claude/**`, `CLAUDE.md`, `README.md`, `docs/**`, `work/**`) have real changes: oxfmt pads tables to column width (some `work/decisions.md` rows grow to 300+ characters) and adds blank lines.
3. A plain `pnpm format` would violate R10: it also lists `AGENTS.md`, `.figma/README.md`, `.figma/make/dev.json` and `.figma/make/site.json`, which are off-limits Figma Make files. `.figma/make/format` runs `pnpm run format`, so Figma Make uses this same script.
4. Index vs working tree: `git ls-files --eol` shows every file stored as LF in the index, and 38 files with CRLF in the working tree. Adding `* text=auto eol=lf` fixes the working tree on the next checkout; `public/.gitattributes` (`favicon.png -text`) and the LFS rules are not affected.
5. oxfmt flags (0.76): `--check` and `--list-different` exist. `--ignore-path=PATH` can be given more than once. With no ignore path, oxfmt reads `.gitignore` and `.prettierignore` from the current directory. There is no oxfmt config file.
6. No workspace-defined format for `risk-tiers.yml`. Spec §11.2 / D13 only say "each project declares its path patterns in `.github/risk-tiers.yml`" and that a CI step computes the tier from the diff. stoktok has no `risk-tiers.yml` and no tier step either (rollout item 7b is still pending). Stoktok CI uses `actions/checkout@v4`, `pnpm/action-setup@v4` (version taken from `packageManager: pnpm@10.28.0`) and `actions/setup-node@v4` with `cache: pnpm`.

**Recommendations**
- AC2 / R10 / R7: add a `.prettierignore` **before** running `pnpm format`, containing: `AGENTS.md`, `.figma/`, `work/`, `docs/`, `.claude/`, `*.md`, `pnpm-lock.yaml`, `dist/`. This keeps `pnpm format` (and Figma Make's format hook) away from R10 files and avoids churning 40 prose files and tables. `.prettierignore` is picked up automatically, so the scripts stay plain: `"format": "oxfmt"`, `"format:check": "oxfmt --check"`, `"typecheck": "tsc --noEmit"`. After the LF fix, expect zero content changes in code; only line endings change.
- AC2 line endings: put `* text=auto eol=lf` at the top of `.gitattributes`, before the LFS rules (later rules still win), then renormalise the working tree on a clean tree (e.g. `git rm --cached -r . && git reset --hard`). No blob changes are expected, because the index is already LF.
- AC1 / pnpm pin: add `"packageManager": "pnpm@10.34.3"` to `package.json`, matching `.mise.toml`. Workflow, the same as stoktok:
  - Steps: `actions/checkout@v4` → `pnpm/action-setup@v4` (no `version:` input; it would conflict with `packageManager`) → `actions/setup-node@v4` with `node-version: 22`, `cache: pnpm` → `pnpm install --frozen-lockfile` → `typecheck` → `format:check` → `build`.
  - Triggers: `pull_request: branches: [main]` and `push: branches: [main]`.
  - `permissions: contents: read`, plus stoktok's `concurrency` block.
  - `vite.config.ts` reads the committed `.figma/make/site.json`, so CI needs nothing extra.
- Lockfile: run install with pnpm 10.34.3 locally (corepack or mise), not the global 11.5.0, and confirm `git diff pnpm-lock.yaml` is empty.
- AC3 / D10 / workspace §7: proposed `risk-tiers.yml` shape. There is no consumer yet, so keep it simple; globs use gitignore syntax.
  ```yaml
  version: 1
  default: medium          # everything not low or high
  high:                    # any match → High, regardless of the rest
    - "supabase/migrations/**"
    - "supabase/functions/**"     # server-side secrets (R3)
    - "src/features/auth/**"
    - "src/lib/supabase.ts"       # auth/client config, anon-key boundary
    - ".github/workflows/deploy*"
    - "public/_redirects"
    - "wrangler.toml"
    - ".github/risk-tiers.yml"    # changing the rules is High
  low:
    - "docs/**"
    - "work/**"
    - "**/*.test.ts"
    - "**/*.test.tsx"
  ```
  Also fix the stale "pnpm build typechecks" line in `CLAUDE.md`, as the ticket asks.

**Risks**
- Running `pnpm format` without the ignore file rewrites `.figma/**` and `AGENTS.md` (an R10 breach) and blows up the PR diff.
- Until a tier-computation step exists, `risk-tiers.yml` is only documentation. Ming may assume it is enforced.
- Adding `packageManager` means anyone on pnpm 11 gets a version mismatch (warning or error) unless they use mise or corepack.
- Renormalising line endings on Windows with uncommitted work can lose that work.
- The ticket PR changes `.gitattributes` and `.github/**`; treat it as High (D10).

**Open questions**
1. Should markdown be formatted at all? Default: no (`*.md` ignored); revisit if Ming wants tidy tables.
2. Add a tier-computation CI step now or later? Default: later, as a follow-up; F-003 only drafts the file, per the ticket scope.
3. Does `src/lib/supabase.ts` count as High? Default: yes; Ming can lower it during the D10 review.
4. Should `pnpm/action-setup` read the version from `packageManager` or set it explicitly? Default: from `packageManager` (one source of truth with `.mise.toml`).
