## Attempt 1 — 2026-11-07 — security-ai-generated-code-auditor

**Findings**
- None 🔴, none 🟡.
- 💭 `.github/workflows/ci.yml:20-22`: actions pinned by tag (`@v4`), not SHA. Pre-existing; this branch does not change it.
- 💭 `vitest.config.ts:22`: `test.env` forces `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to `""` (falsy, so `src/lib/supabase.ts:12` returns `null`). `src/test/env.test.ts:8-10` asserts this, so leaking real values would fail the suite. Good, but only those two names are overridden; a future `VITE_*` in a developer's `.env.local` would still reach tests.

**Verified clean**
- CI: `pull_request` (not `pull_request_target`), `permissions: contents: read`, no `secrets.*`, no `${{ github.event.* }}` in `run:`. The new step is plain `pnpm test:coverage`; no coverage artifact upload.
- Dependencies: exact pins (vitest / @vitest/coverage-v8 5.1.0, jsdom 27.4.0). About 65 new lockfile entries, all expected transitive deps (css-tree, tough-cookie, parse5, ws, chai…). No typosquats, no `requiresBuild`, no git/tarball sources. No `pnpm.onlyBuiltDependencies` / `ignoredBuiltDependencies`, so pnpm 10's default of blocking build scripts still applies.
- `coverage/` is in `.gitignore:3` and `.prettierignore:9`; nothing under it is tracked.
- Tests contain no keys, JWTs or Supabase URLs (only the dummy `https://x/y.jpg`, `mappers.test.ts:152`); `setup.ts` clears localStorage after each test.

**Recommendations**
1. Keep `env.test.ts` as a required guard ("tests never use real Supabase").
2. Optional: SHA-pin actions in a separate chore ticket.

**Risks**
- Low. Any future `onlyBuiltDependencies` addition is security-relevant and must be reviewed.

**Open questions**
1. Blank every future `VITE_*` in `test.env`? Default: yes, in the ticket that introduces it.
