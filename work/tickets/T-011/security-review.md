# Security review — T-011

## Attempt 1 (2026-11-10) — security-ai-generated-code-auditor

No 🔴 blockers. Drafts are safe as drafts; workflow mirrors the reviewed `deploy-org-admin-api.yml`.

### 🟡 Should fix (before T-013/T-015 ship; not blocking this diff)
1. **API reachable from neighbours on `web`, bypassing Cloudflare Access** — `deploy/deployment-repo/apps/tudocuatui/compose.yml:53` (`networks: [tunnel, db]`). Under D23 the Node API has no in-app auth and holds the DB owner role. Fix: T-013 AC — validate `Cf-Access-Jwt-Assertion` (JWKS signature, `aud`, `iss`).
2. **Cloudflare Access must be live before the first Node release** — `work/ming-todo.md:93` (M-11), T-015. Fix: T-015 `Needs Ming: M-11, M-12`; PR 4 runbook adds `curl -sI https://tudocuatui.mmlabs.online/api/...` → Access redirect check.

### 🟢 Notes
3. Password not masked in the Actions log (`deploy-tudocuatui.yml:98`); add `echo "::add-mask::$pw"`. T-012/T-013 AC: never log `DATABASE_URL` or connection options.
4. `previous` (`deploy-tudocuatui.yml:77`) not validated against the image pattern; optional `[[ "$previous" =~ $pattern ]] || previous=""`. Same upstream.
5. Shell injection: clean — every `${{ }}` passes through `env:`.
6. File permissions fine (umask 077, `$HOME/` guard, install -d 700, mktemp+trap, chmod 600, atomic mv). Post-merge check should include `ls -ld ~/.config/tudocuatui`; never run plain `docker compose config` by hand (prints env_file values).
7. DB exposure good: `db` internal, no ports, `REVOKE ... FROM PUBLIC`, migrate on `db` only, cap_drop/no-new-privileges kept. T-015: image runs as non-root `USER`.
8. Rollback/migrate order sound (backup → migrate → up; rollback never migrates; restores `apps/tudocuatui/` as a unit). Documented residual risks: expand-then-contract by convention; rotation outage window; separate concurrency groups for deploy-postgres vs deploy-tudocuatui.
9. Migrate guard is keyed on compose, which `release/tudocuatui-v*` PRs may change (`pr-scope.yml:31`). Follow-up: restrict TuDo release PRs to `release.env` after PR 4; Ming reads compose diffs on release PRs.
10. No committed secrets (only placeholders `<pw>`, `<48 hex chars>`); M-12 never prints the password.

### Open questions
- Is the T-013 Cloudflare Access JWT check mandatory? (Only control between neighbour containers and the API.)
- After PR 4, should release PRs still change `compose.yml`, or only `release.env`?

Reviewed (read-only, no secrets/.env/release.env opened): the two drafts, deploy README, ming-todo, plan, impl-log; references `deploy-org-admin-api.yml`, `pr-scope.yml`, `postgres/compose.yml`, `app-db.sql`, `add-app-db.sh`.
