# Security review — T-016

## Attempt 1 — 2026-11-13 (security-ai-generated-code-auditor)

**Verdict: no blockers.** I found one 🟡 to fix in this ticket (a single-line change), plus a few 🟢 notes and Ming reminders.

**Limitation:** I only had Read, Grep and Glob, so I could not run `git diff origin/main`. I checked the files as they are on the branch against what plan.md and impl-log.md say changed. I did not see the deleted text of the old `== bundle mode` section in `check-image.sh` or the old lines of `release.yml`. The reviewer should confirm with `git diff origin/main -- scripts/check-image.sh .github/workflows/release.yml` that nothing outside the listed lines was dropped, especially in the secret scans.

### Findings

**🟡 1. The legacy cleanup can crash startup when storage is blocked.** `src/lib/legacySession.ts:6`, called from `src/main.tsx:10`
```ts
storage: Pick<Storage, "length" | "key" | "removeItem"> = localStorage,
): number {
  try {
```
- **Problem:** JavaScript evaluates the default value before the function body runs, so `try` does not cover the `localStorage` read. In a browser where site data is blocked (for example Chrome's "Block all cookies" setting, or some sandboxed embeds), reading `window.localStorage` throws a `SecurityError`.
- **Effect:** in production builds the error is thrown at the top level of `main.tsx` before `detectMode()` runs. The page stays blank, even in API mode, which otherwise never needs localStorage.
- **Old code was safe:** `applySavedTheme` (`src/lib/theme.ts:6-10`) already guards this read, so this is a new failure path.
- **Test gap:** the "storage throws" test (`legacySession.test.ts:47-64`) passes a fake storage object, so it never exercises the default-value path.
- **Fix:** take `storage?` and resolve `const s = storage ?? localStorage` inside the `try`. Add one test that stubs the global `localStorage` getter to throw and expects 0.
- This is about availability, not data exposure. It touches AC 5 ("does not throw when storage throws") and R1.

**🟢 2. The legacy key match is correct and tightly scoped.** `legacySession.ts:3`, `/^sb-[^\s]+-auth-token(-code-verifier)?$/`
- It matches the default storage keys used by the old Supabase client (`sb-<ref>-auth-token` and `-code-verifier`). No custom `storageKey` and no use of `sessionStorage` in the history.
- Keys are collected first and then removed. `tu-do-items` and `tu-do-theme` are tested as kept.
- It does not match a `-user` suffix, written only when `userStorage` is configured; that option was never used here.
- It runs in production builds only and in both modes, as A4 requires.

**🟢 3. No secrets and no stray `VITE_*` variables.**
- `import.meta.env` is now read only for `VITE_APP_VERSION` (`src/lib/version.ts:7`), plus `DEV` and `PROD`.
- `.env.example:1` has no values and no "ai" substring.
- `Dockerfile:16` has only `ARG VITE_APP_VERSION`, with format validation at lines 17-21.
- `release.yml:100-101` passes only `VITE_APP_VERSION`. `ci.yml:84-85` passes only `VITE_APP_VERSION=v0.0.0`.
- Neither workflow references `secrets.VITE_SUPABASE_*` any more.
- `.gitignore:6` still ignores `.env*`, and `.dockerignore:14-15` still excludes `.env*`.
- `vite.config.ts` has no `envPrefix` or `define` override.
- No secret value anywhere in the diff, so nothing needs rotating.

**🟢 4. Nothing left in the app reaches Supabase.**
- `grep -i supabase` (excluding `node_modules`, `.git`, `work/`) hits only: `src/lib/legacySession.ts:1` (comment), `src/shared/ai/boundary.test.ts:15-16` (`FORBIDDEN` list), `scripts/check-image.sh:77-78` (new check), `README.md:15` (history), `server/ai/crypto.js:3` (comment, out of scope as planned), `.claude/agents/*`, `run.md:94`, `CLAUDE.md` and docs (planned follow-ups or Ming's to edit).
- `package.json` has no `@supabase/*` dependency and no `db:types` script.
- `index.html` has no preconnect; nothing references `supabase.co` outside `work/`.
- `server/static.js:60` serves `index.html` with `no-cache` and there is no service worker, so the next release replaces the old bundle on the next page load.

**🟢 5. The CI and release changes do not weaken the image checks.** `scripts/check-image.sh`
- Lines 9-12 now require exactly one argument.
- Every other check is still present (secret-like env names, `VITE_` in image config and history, non-root user, no `.env` files, `sb_secret_` scan, Google/refresh-token scan, no source maps, Cmd, env, port, layout, version, start-check matrix incl. `TUDO_ACCESS_DISABLED=1` refused in production, smoke run `/api/items` 401, db smoke `/api/locations` 401).
- The new `== bundle` check (lines 76-79) fails on `supabase` (any case) in `dist/assets`.
- It runs on both CI builds (`ci.yml:87,90`) and on the pushed release digest (`release.yml:116`).
- Release guards, tag reservation, `provenance: false`, `sbom: false`, digest pinning and the "only release.env" guard (`release.yml:138-140`) are intact.
- Dropping the `check-public-supabase-env` steps is correct.

**🟢 6. Without in-app login, API mode is protected by Cloudflare Access plus a server-side check** (code untouched by T-016): `server/app.js:76-84`, `server/access.js:28-31,44-58`, `server/api.js:63-65`, `/healthz` returns only `{status:"ok"}`, `mode.ts:20` treats an Access redirect as API mode. Access logout link is follow-up A5.

**🟢 7. README tells developers to run the API with Access disabled.** `README.md:13` (`TUDO_ACCESS_DISABLED=1 … pnpm start`) and `server/index.js:71` listens on `0.0.0.0`. Dev-only; `server/` out of scope. Follow-up: bind to `127.0.0.1` when Access is off, or add a README warning.

**🟢 8. `.github/risk-tiers.yml:7-10` and `.claude/commands/run.md:46` are updated correctly.**

### Recommendations
1. Fix 🟡 1 in this attempt: resolve `localStorage` inside the `try` and add the test for a throwing global getter.
2. Reviewer: run the `git diff origin/main` checks for `check-image.sh` and `release.yml`.

### Risks and Ming items
- **The old refresh token stays valid until revoked.** Ming should sign out all sessions in stoktok Supabase (A6) now, not after the merge.
- **Delete the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` repo secrets after the merge (A6).** The anon key was public by design; no rotation needed.
- **Accepted A2 risk:** a failed `/healthz` probe silently falls back to local mode; follow-up adds a banner.

### Open questions
- None that block the ticket.

### Resolution — 2026-11-13
🟡 1 fixed on the PR branch (see impl-log "Follow-up fix"): `localStorage` is now resolved inside the `try`, with a test for a throwing global getter.
