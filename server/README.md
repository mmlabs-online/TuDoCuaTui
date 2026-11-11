# TuDo Node server (T-013.1)

Start contract (T-015): `node server/index.js`, listens on `0.0.0.0:3000` (`PORT` overrides), serves the built SPA from `../dist`.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `postgres://tudocuatui:<pw>@postgres:5432/tudocuatui` (D24). Unset: starts without a DB, `/readyz` is 503. |
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` (not secret) |
| `CF_ACCESS_AUD` | Access application AUD tag (not secret) |
| `TUDO_ACCESS_DISABLED` | `1` turns the `/api` JWT check off. Dev only; refused when `NODE_ENV=production`. |
| `NODE_ENV` | With `production`, missing `CF_ACCESS_*` exits 2. |
| `PORT` | Default 3000 |

Routes: `/healthz` (liveness), `/readyz` (`select 1`), `/api/*` (Cloudflare Access JWT required; endpoints arrive in T-013.2), everything else is the SPA.

Local run: `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=... pnpm start`.

Logging: one JSON line per request (method, route template, status, ms, id). Never log `DATABASE_URL`, tokens, raw URLs or whole error objects; only `err.code`.

Router note for T-013.2: `server/app.js` computes one `pathname` (after rejecting non-origin-form targets with 400). Dispatch API endpoints from that same `pathname`, inside the guarded `/api` branch, so the access check cannot be bypassed by a second URL parse.
