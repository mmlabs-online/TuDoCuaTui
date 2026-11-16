# Security review — T-022

## Attempt 1 — 2026-11-16 (security-ai-generated-code-auditor)

Read-only. **No blocking findings; safe to ship.**
- 🟢 G1 `server/http.js:12`: `connect-src 'self' https://api.mmlabs.online blob: data:` opens no exfiltration path — `data:` fetches read bytes in the URL, `blob:` URLs are same-origin memory only; outbound channels for injected script stay `'self'` and `api.mmlabs.online`; Turnstile still out of `connect-src`.
- 🟢 G2 `server/http.js:6-18`: no other directive changed vs the T-019.8 target (`work/tickets/T-019.8/plan.md:26-28`); `server/static.test.ts:203-217` pins the full set.
- 🟢 G3 `server/http.js:8`: `script-src 'self' https://challenges.cloudflare.com` only; new guards `static.test.ts:225-226`; no `worker-src`/`child-src`, so workers fall back to `script-src` (no `blob:` workers).
- 🟢 G4 `src/data/repo.http.ts:82-83`: `urlToBlob` only runs for `data:`/`blob:` photos; remote URLs never reach this fetch.
- 🟡 Y1 (pre-existing, not T-022): CSP does not cover navigation; Turnstile `frame-src`/`script-src` residual from T-019.8 Y1 unchanged.
- Client-side decoding instead of `fetch` would not be meaningfully safer (only removes local-URL fetches); passing the picked `File` through is a possible low-priority cleanup that would let `blob:`/`data:` leave `connect-src`.
