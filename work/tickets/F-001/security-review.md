## Attempt 1 — 2026-11-07 — security-ai-generated-code-auditor

**Findings**
- ✅ No secret values are committed. Every credential field in `supabase/config.toml` is `env(...)` or empty: Studio OpenAI (L102), Twilio (L298), Apple (L330), S3 (L405–411). README and `docs/qa/smoke-test.md` contain no key values; they only name `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (the anon key is designed to be public). No mention of service_role, disabling RLS or a public bucket. smoke-test.md:17 says explicitly never to paste keys.
- 🟡 `config.toml:183,186`: `minimum_password_length = 6`, no password requirements. Low impact locally (the app uses magic links), but copied to hosted it would weaken password sign-up if that is ever enabled.
- 🟡 `config.toml:228,230`: `enable_confirmations = false`, `secure_password_change = false`. Fine locally; on hosted they must stay ON (the hosted default).
- 🟡 `config.toml:164`: redirect wildcard `http://localhost:8443/**`. Harmless locally. Hosted should allow only the exact prod/dev origins; a broad wildcard or a localhost entry on prod widens redirect/token-leak attacks. README step 3 ("add dev and prod URLs") does not warn against wildcards.
- 🟡 `config.toml:76-82`: network restrictions off (`0.0.0.0/0`). The local default, but it must not be read as hosted guidance.
- 💭 `config.toml:119`: global storage limit 50MiB. Acceptable: the migration caps the `wardrobe` bucket at 10 MB, private, MIME-limited (`init.sql:163-164`), and storage policies are scoped to `auth.uid()` folders (L168-182).
- 💭 `config.toml:72`: seed path `./seed.sql` does not exist. Not a security issue; only a CLI warning.
- 💭 `supabase/.gitignore` covers `.temp`, `.branches`, `.env.keys`, `.env.local`, `.env.*.local`, but not a bare `supabase/.env`. The root `.gitignore` already has `.env*`, so it is covered in practice.
- ✅ The rest is fine: `jwt_expiry` 3600, refresh-token rotation on, anonymous sign-ins off, `email_sent` = 2/h, SMTP block commented out.

**Recommendations**
1. Add a line to README step 3 or smoke-test "Run B": "Hosted: add exact URLs only (no `/**`), keep email confirmations ON, never put the service_role key in `.env.local`."
2. Optional: add `.env` to `supabase/.gitignore` (defence in depth).

**Risks**
- A later `supabase config push` would copy these local auth settings (confirmations off, weak passwords, wildcard redirects) to the hosted project.

**Open questions**
1. Keep password auth unused (magic link only)? Default: yes; note it in decisions.
2. Add the "don't push config.toml to hosted" warning now or later? Default: now; it is a one-line docs change (Low).
