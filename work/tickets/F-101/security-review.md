## Attempt 1 — 2026-11-07 — security-ai-generated-code-auditor

Verdict: no blockers. The auth flow is substantively unchanged and matches the plan's Security summary.

**Findings**
- 🟡 `src/features/auth/AuthGate.tsx:46`: `emailRedirectTo` is still `window.location.origin + pathname` (this line is unchanged). The origin is always the app's own, and Supabase sends the token in the URL fragment, so the code has no open redirect. The real safeguard is the Supabase Redirect URLs allowlist: a broad wildcard (e.g. `https://*.vercel.app/**`) would let preview or other deployments receive a working magic link.
- 💭 `src/features/auth/authMessages.ts`: errors map to 3 fixed Vietnamese strings; no raw `error.message`, body or email is shown or logged. Good. One enumeration signal remains, and it predates this change: if sign-ups are ever disabled (`shouldCreateUser` / signups off), unknown emails get the generic error while known ones succeed.
- 💭 `src/features/auth/cooldown.ts:1-3`: UI-only, and nothing treats it as a security control. Plan A2 says this, but the code does not. A 429 maps to `errRateLimit` without starting a cooldown, which is correct.
- ✅ XSS: the email renders as escaped React text (`AuthGate.tsx:94`); no `dangerouslySetInnerHTML` or `innerHTML` anywhere in `src`.
- ✅ `src/lib/theme.ts`: the stored value is only compared strictly (`=== "dark"`), never put into `classList`; storage access is wrapped in try/catch; nothing is written.
- ✅ No secrets and no new `VITE_` variables; `src/lib/supabase.ts` is unchanged (URL + anon key only).
- ✅ Local mode: `AuthGate.tsx:34` `if (!supabase || session)` is unchanged; `supabase` is null only when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is unset.

**Recommendations**
1. Add a one-line comment in `cooldown.ts`: "UX only; Supabase's server-side rate limit is the control."
2. Optional: wrap the `signInWithOtp` call in try/finally so `busy` cannot stay stuck if the call throws.

**Risks**
- The redirect allowlist cannot be checked from the code; it is a dashboard setting, so checking it is a human step.

**Open questions**
1. Does the hosted Auth Redirect URLs list contain only exact prod and localhost URLs (no `**`)? Default: assume yes; Ming checks it during M-1 / M-4.
2. Will `shouldCreateUser` / open sign-ups stay on? Default: yes, so the success path gives no enumeration signal.
