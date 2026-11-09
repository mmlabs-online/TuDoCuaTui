# Security review — F-007

## Attempt 1 — 2026-11-08 (security-ai-generated-code-auditor, read-only)

**Verdict: no blocking issues.** I found no 🔴 findings. Two 🟡 items are worth a small README tweak, and one open question needs Ming to check the stoktok dashboard.

Files checked:
- `D:\mmlabs\spaceM\projects\.wt-tudocuatui\F-007\README.md`
- `D:\mmlabs\spaceM\projects\.wt-tudocuatui\F-007\.node-version`
- `impl-log.md` and `ticket.md` in that worktree
- `src/features/auth/AuthGate.tsx`, `src/lib/supabase.ts`, `vite.config.ts`, `.env.example`, to see how the code uses the env vars and redirect URL

### Findings

**🟢 Passes**
1. **No env values or keys in the diff** (AC3). `.node-version` contains only `22`. In the README, names appear only at :53–58. `.env.example` has placeholders only (`YOUR-PROJECT-REF`, `YOUR-ANON-KEY`) and the diff doesn't touch it. The impl-log grep for the JWT prefix, `supabase.co`, `sb_publishable_`/`sb_secret_` and `.env*` files found nothing.
2. **Supabase vars are production-only** (README.md:55–57). Preview gets only `NODE_VERSION`/`PNPM_VERSION` (:53). It says "Never add them to Preview". `src/lib/supabase.ts:4-5` reads only those two `VITE_*` names, so a preview build has no Supabase client and runs in local mode (R1, D5). A PR branch therefore can't reach the shared stoktok project or a real session.
3. **R3 is respected.** README.md:56 says to use the anon/publishable key only and never the service role key. The anon key in the production bundle is public by design; RLS is the real gate.
4. **Redirect URL guidance is correct.** README.md:62–65 and :25–26 ask for exact URLs only (no wildcards, no preview or hash URLs) and leave the Site URL alone (D17). This matches the code: `AuthGate.tsx:46` sends `emailRedirectTo: window.location.origin + window.location.pathname`. On production that is exactly `https://<project>.pages.dev/`, the value step 8 adds. Preview hosts are never allowlisted, and previews have no keys, so they can't send a magic link anyway.
5. **`FIGMA_PUBLIC_URL` stays unset on the host** (README.md:58, matches `vite.config.ts:15`).
6. **No step asks Ming to paste a secret anywhere an agent can see it.** All values are copied dashboard to dashboard by Ming (step M-4).

**🟡 Should fix (small README edits)**
1. **Per-deployment hash URLs** (README.md:62–67). Each production deploy is also served at `https://<hash>.<project>.pages.dev`, and those URLs carry the production build with the keys. A magic link requested there uses a redirect that isn't allowlisted. Supabase then falls back to stoktok's Site URL, so the login token lands in the stoktok app instead. That is not a third-party leak (same project, Ming's own app), but it is confusing.
   - **Fix:** add one line under step 9: "Log in only on the production URL `https://<project>.pages.dev/`, never on a per-deployment hash URL."
   - Supports AC2 and the phone-login check.
2. **New Supabase key names** (README.md:56). The line forbids "the service role key" but not the new-style secret key (`sb_secret_…`), which is the same kind of secret on projects that use the new API keys.
   - **Fix:** "Use the anon / publishable (`sb_publishable_…`) key only; never the service_role or secret (`sb_secret_…`) key."
   - Supports R3.

**🟢 Optional, not needed for this ticket**
- Preview and production URLs are public. Previews show demo data only, so the risk is low. Cloudflare Access on `*.<project>.pages.dev` previews would hide unreleased UI. This is a follow-up, not F-007 scope.
- The "also add the URL without the trailing slash" fallback at README.md:64–65 is harmless because it is still an exact URL. Given `AuthGate.tsx:46` it should never be needed.
- The impl-log follow-up (`public/_headers` and adding `.node-version`/`_headers` to High in `.github/risk-tiers.yml`) is sensible and should become a `debt` issue. Right now `.node-version` controls the production build Node version but may not be classed as High.

### Recommendations
- Make the two 🟡 edits in README.md, then let the reviewer pass it. That closes AC2 and R3 wording.
- Have the orchestrator file the `_headers` / risk-tier follow-up as a `debt` issue (workspace §8).

### Risks
- **Shared Auth allowlist (D17):** stoktok's redirect list may already contain a wildcard such as `https://*.pages.dev/**` or `**`. If it does, the "no wildcards" guidance for TuDo does nothing, because TuDo preview and hash hosts would also be accepted as redirect targets. The README can't control this.
- If Ming ever adds the `VITE_*` vars to Preview by mistake, any PR branch would run against the shared stoktok project in a browser where Ming might log in. The README warning is the only guard, and agents can't check the dashboard.

### Open questions for Ming
1. Does stoktok's Auth → URL Configuration → Redirect URLs already contain any wildcard entry? Proposed default: if yes, Ming replaces it with exact URLs before M-4, or records an accepted risk in `work/decisions.md`.
2. Should the M-4 checklist get one more tick: "Preview environment shows no `VITE_*` variables"? Proposed default: yes, add it to `work/ming-todo.md` M-4.
