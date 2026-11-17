# T-025 security review

## Attempt 1 — 2026-11-17 — security-ai-generated-code-auditor (read-only)

I read these files: `dev/devTokenProxy.ts`, `dev/devTokenProxy.test.ts` (grep only), `scripts/dev-token.sh`, `vite.config.ts`, `src/main.tsx`, `src/lib/startup.ts`, `src/data/serverProbe.ts`, `src/features/auth/AuthRoot.tsx`, `index.html`, `Dockerfile`, `.dockerignore`, `.gitignore` (grep only), the CSP in `server/http.js:8-12`, `README.md` (grep only), `plan.md` and `impl-log.md`. I did not read any `.env*` file and ran no commands, so nothing below has been executed.

**Verdict: no blockers.** Two items should be fixed, ideally in this ticket because both are small and live in the new plugin. Everything else is a note.

### Findings

**🟡 1. One CLI flag puts the token on the LAN.** `vite.config.ts:9,20` and `dev/devTokenProxy.ts:77-107`
- The config sets the host to loopback, but `pnpm dev --host`, `pnpm dev --host 0.0.0.0` or `vite --host` overrides it.
- Vite's host check allows Host headers that are raw IPs by default. So a browser on the LAN opening `http://<pc-ip>:8443` sends `sec-fetch-site: same-origin`, and the proxy adds Ming's real bearer token. That gives anyone on the LAN read/write on the local server, and a token that the production API also accepts (audience `tudocuatui`).
- The loopback guarantee depends on nobody typing a common flag. The plan's verification step 5 (from another device on the LAN, `http://<wsl-or-pc-ip>:8443` is refused) only tests the default.
- **Fix:** add a `configResolved(c)` hook in the plugin that throws unless `c.server.host` is `127.0.0.1`, `localhost` or `::1`. Also refuse `allowedHosts === true`. Add a unit test for both.

**🟡 2. `TUDO_DEV_API` can send the token to any host.** `dev/devTokenProxy.ts:22-24,88`
- The target is taken from the env var with no check. Setting it to a non-loopback host sends the bearer to that host. With an `http://` remote it goes in cleartext.
- Pointing it at the production URL also makes the dev UI write to production data with a real token. That defeats the "local DB only" rule the README states at `README.md:14`.
- **Fix:** parse the URL and require the hostname to be `127.0.0.1`, `localhost` or `::1` (throw at config time otherwise). Add a test that `http://example.com` and `https://tudocuatui.mmlabs.online` are rejected.

**🟢 3. Header handling is correct.** `dev/devTokenProxy.ts:59-70,97-99`
- The client's `Authorization` is always removed from both the copied headers and `proxyReq`.
- The token is only added when `sec-fetch-site` is `same-origin` or absent. Other localhost ports (`same-site`), pages from other sites (`cross-site`) and URLs typed into the address bar (`none`) get no header, which also blocks other localhost dev servers that Vite's default CORS policy would allow.
- Residual risk: a browser that sends no `Sec-Fetch-Site` header is treated like curl, so a cross-site form POST or image request from such a browser would get the token. Safari before 16.4 is one example. This is acceptable for one developer on current Chrome/Firefox/Safari; mention it in the README dev-loop section.
- Any local process can also call `127.0.0.1:8443/api/...` without the header and be authenticated. On WSL this includes Windows processes through localhost forwarding. Accepted: the same user can read the token file anyway.

**🟢 4. DNS rebinding is blocked, but please confirm one ordering.** A rebinding attack sends a foreign `Host` header, which Vite's host check rejects with 403. I believe that middleware runs before the proxy middleware in Vite 6+, but I could not check it in Vite 8's source here. The reviewer should confirm with `curl -H 'Host: evil.example' http://127.0.0.1:8443/healthz`, which should return 403. The plugin never sets `allowedHosts`, which is correct.

**🟢 5. Build, preview, `dist/` and Docker are clean.**
- `apply` (`devTokenProxy.ts:82`) excludes both `build` and preview, `preview.proxy: {}` (`vite.config.ts:22`) is an extra guard, and the tests at `devTokenProxy.test.ts:42-45` cover it.
- The token is read only at request time from `~/.config/tudocuatui/dev-token`, outside the repo. It is never in `import.meta.env` or any `VITE_*` variable, and the impl-log reports that grepping `dist/` finds nothing.
- Docker: `dev/` is copied into the build stage (`Dockerfile:13`) but only `dist`, `server` and `db/migrations` reach the runtime image (`Dockerfile:35-39`). The token file is outside the build context.
- Removing the `.figma` lines from `.dockerignore` weakens nothing; `.env*` is still excluded (`.dockerignore:14-15`, `.gitignore:6`).

**🟢 6. Logs never contain the token.** `warningFor` (`devTokenProxy.ts:72-75`) prints only the status word, and Vite's proxy error and debug logs show the URL and target, not headers.

**🟢 7. `dev-token.sh` keeps the password and token out of argv, history, files and stdout.**
- `read -rs ... </dev/tty` keeps the password out of history and the environment.
- The password goes from the `printf` builtin through a pipe to node's stdin, so it is in no process argument list (`:53-55`), and `pw` is unset afterwards (`:56`).
- The token is captured with `$(...)` and written with the `printf` builtin, so it is not in argv either (`:76-85`).
- `umask 077` is set before `mktemp -d`, `mkdir -p` and writing the file, so the file is 600 and a newly created directory is 700. The write goes to a temp file and then `mv`, so it is atomic.
- Errors print only an Identity error code filtered to `^[a-z_]{1,40}$` (`:34`); stdout gets only the path and `expires_in` (`:87`).
- Minor items:
  - `trap ... EXIT` (`:23`) may not run on SIGTERM/HUP, which would leave the cookie jar and the last response in `$TMPDIR`. The response holds the access token until the logout overwrites it. Use `trap 'rm -rf "$work"' EXIT INT TERM HUP`.
  - `read -rs pw` without `IFS=` strips leading and trailing spaces from the password. This is a correctness bug, not a leak. Use `IFS= read -rs pw` (and the same for the email).
  - The fixed name `$FILE.tmp` races if two runs happen at once. Harmless.
- `TUDO_DEV_EMAIL` is only an email address, so it is not a secret.

**🟢 8. Faking the `Origin` header is no new risk.** `scripts/dev-token.sh:6,17,40`
- Identity's Origin plus `X-MM-App` check only protects browsers from cross-site requests; it cannot stop a client that holds the credentials. The script only uses Ming's own credentials and sets no other headers.
- What it does mean: anyone holding valid credentials can mint a token for any app audience from outside a browser. That is a property of Identity, so it is worth one line in `decisions.md` or the README so nobody later treats Origin as an authentication factor.
- The token the script writes is a full production credential for about 15 minutes, which is another reason for finding 2.

**🟢 9. A production build cannot skip sign-in.**
- `dev: import.meta.env.DEV` (`src/main.tsx:47`) is replaced by `false` at build time, so `startup` always returns `{kind:"auth"}` when the probe succeeds (`src/lib/startup.ts:22`). There is no runtime switch, no URL, header or storage flag, and nothing read from `/healthz`.
- The probe now ignores the `auth` field (`serverProbe.ts:19-20`). As I understand it, the old `needsAuth`/`identity` path could render the app without the gate depending on the server's answer. Removing it tightens auth.
- `AuthRoot` (`AuthRoot.tsx:64-72`) now always ends at `AuthGate` with a token store; the removed `renderApp()` fallthrough was the only path that skipped the gate.
- Even if the dev branch were reached, the server still checks every `/api` call, so the result would be an empty app returning 401s, not a data leak.
- `takeTokenHash()` still runs before any request (`main.tsx:16`, D36).

**🟢 10. The static `index.html` is compatible with the CSP.** It has no inline `<script>`, `<style>` or `style=` attributes. Its only script is the module entry, which the build turns into a same-origin chunk, and the stylesheet is same-origin. Both fit `script-src 'self'` and `style-src 'self'` (`server/http.js:8-9`). `src/test/indexHtml.test.ts` locks the absence of inline code.

**🟢 11. Nothing removed weakens auth.** The removed pieces are `needsAuth`, the `identity` prop, the local repo and demo data, and the mock AI UI; each of these was a path around auth or a non-authenticated data path. `clearLegacyAuthKeys()` stays (PROD only). No server, migration or auth-verification code changed.

### Recommendations
1. Add a loopback assertion on `server.host` in `configResolved` (finding 1). It ties to AC5 ("the token never reaches other hosts") and makes the plan's verification step 5 hold under `--host`.
2. Validate that the `TUDO_DEV_API` target is loopback (finding 2). This also ties to AC5, and to the README's "local DB only" rule.
3. In `dev-token.sh`: trap `INT TERM HUP` as well as EXIT, and use `IFS=` on both `read` calls (finding 7).
4. Add a README line saying browsers without `Sec-Fetch-Site` are treated as same-origin, so use a current browser (finding 3).
5. The reviewer should confirm that Vite 8 checks the Host header before proxying, as described in finding 4.

### Risks
- The dev token is accepted by production. Any slip in the dev loop (`--host`, `TUDO_DEV_API`, the file copied elsewhere) exposes production data for up to about 15 minutes. Fixes 1 and 2 close the code-level paths.
- `dev-token.sh` has never been run against Identity (impl-log). Whether logout invalidates the token (A8) and how Turnstile behaves are still checks for Ming after merge.

### Open questions
1. Should the plugin refuse to start when `TUDO_DEV_API` is not loopback, or only warn? Proposed default: refuse, since overriding the target remotely has no legitimate use under D44.
2. Should the Identity "Origin is not an authentication factor" note go into `work/decisions.md`, or into an Identity-side debt issue? Proposed default: a one-line README note plus a `debt` issue against Identity.

## Attempt 2 — 2026-11-17 — security-ai-generated-code-auditor (read-only)

**Verdict: no blockers.** Both 🟡 findings from attempt 1 are fixed, and so is the minor `dev-token.sh` item (finding 7). I tried the bypasses you listed against both new guards and none got through. The D45 README guardrails are mostly accurate. One of them conflicts with the README's own example command, so I'm marking it 🟡 (finding C1). The rest are 🟢 hardening notes.

**Coverage:**
- **Read:** `dev/devTokenProxy.ts`, `dev/devTokenProxy.test.ts`, `scripts/dev-token.sh`, `vite.config.ts`, `README.md:1-60`, `server/index.js`, `server/ai/routes.js`, the auth-mode grep, `secrets.refs.yaml` (grep), and the Vite 8.0.5 source in `node_modules/.pnpm/vite@8.0.5…/dist/node/chunks/node.js`.
- **Not done:** I have no shell tool, so I could not run `git show 01f856b` or `git show origin/main:work/decisions.md`. I checked the D45 wording against the README and the server code, not against the decision text itself. I ran nothing and read no `.env*` file.

### A. Attempt-1 findings

**🟢 1 (was 🟡) — non-loopback `server.host`: fixed.**
- `dev/devTokenProxy.ts:40-52` with `configResolved` at `:111-113`. The check rejects any host that is not a string in the loopback set, and rejects `allowedHosts === true`.
- Bypasses tried, all rejected: `--host` with no value (Vite gets `true`, not a string); `--host 0.0.0.0`, `""`, `::`, `127.1`, `::ffff:127.0.0.1`, `LOCALHOST` (none is a member of the set); setting the value in config instead of the CLI (CLI options are merged before `configResolved`).
- Some values are rejected even though they are loopback or harmless (`false`, `127.0.0.2`). That is fine. `"[::1]"` is accepted, but `listen("[::1]")` simply fails. Harmless.
- Tests: `devTokenProxy.test.ts:195-207`.
- Attempt-1 ordering question (finding 4) confirmed in Vite 8.0.5: `node.js:26228` adds the Host-validation middleware before `node.js:26239` adds the proxy, so DNS rebinding gets a 403 before the token is added. Caveat: Vite skips Host validation when `server.https` is set; rebinding against https needs a valid certificate for the attacker's name, so this is acceptable.

**🟢 2 (was 🟡) — `TUDO_DEV_API`: fixed.**
- `dev/devTokenProxy.ts:25-37` checks the WHATWG `new URL(target).hostname` against the exact set.
- Tricks tried, all rejected: `http://127.0.0.1@evil.com`, `http://localhost.evil.com`, `http://evil.com#@127.0.0.1`, `http://127.0.0.1.nip.io`, `http://localhost.` (trailing dot). No DNS lookup is involved.
- Decimal and hex forms like `127.1` or `0x7f000001` normalize to `127.0.0.1` and pass; those are loopback, so that is correct. For IPv6 the WHATWG hostname is `[::1]`, so the `"::1"` entry only matters for `server.host`.
- Tests: `devTokenProxy.test.ts:187-193`. The check runs only in `config()`, which only applies under `serve` (`:110`).

**🟢 7 — `dev-token.sh` minor items: fixed.**
- `:24-25`: `trap 'rm -rf "$work"' EXIT` plus `trap 'exit 130' INT TERM HUP`; `exit` inside the signal trap runs the EXIT trap, so the work dir is removed on Ctrl-C, TERM and HUP.
- `:49` and `:52` now use `IFS= read -r` and `IFS= read -rs`.
- The fixed `$FILE.tmp` name (`:87`) can still race if two runs overlap. Harmless.
- No regressions: the password still goes only through the pipe (`:55-58`), `account_id` is checked against the UUID pattern before `printf` (`:71`), and stdout gets only the path and `expires_in` (`:89`).

**🟢 3 / 8 — README notes added.** `README.md:29-31`.

### B. New observations on the guards (hardening, not required)

**🟢 B1. Validate the URL you return, not the raw string.** `proxyTarget` validates `new URL(target)` but returns the raw `target` (`:36`). Fix: `return new URL(target).origin` and require `protocol` `http:` or `https:`; add tests for `http://127.0.0.1@evil.com`, `http://localhost.evil.com`, `http://evil.com#@127.0.0.1` (all rejected today).

**🟢 B2. A tunnel can bypass the loopback bind.** A local tunnel or port forwarder (VS Code port forwarding, `ngrok --host-header=rewrite`, `cloudflared --http-host-header localhost`) can expose `:8443` with the Host rewritten to `localhost`; the proxy then adds the token for anyone with the URL. Cheap guard: in `rewriteAuth`, add no bearer when `x-forwarded-for`, `forwarded`, `x-forwarded-host` or `cf-connecting-ip` is present. README line: "the D45 tunnel is to the database only; never tunnel or port-forward the dev server."

### C. D45 README guardrails (`README.md:14-15`, `:32-36`)

**🟡 C1. The documented command writes the production `DATABASE_URL` into a file.** `README.md:15` shows `… DATABASE_URL=<local> pnpm start` typed inline; the same pattern for production puts the connection string in `~/.bash_history`, breaking the guardrail at `:33` and workspace rule §3. Fix: for production, give the value through `scripts/with-secrets.sh DATABASE_URL… -- pnpm start`, or `read -rs` plus `export`, never inline. No tudocuatui entry in `secrets.refs.yaml` today (Ming's step). Same rule for `AI_KEK` and the Google credentials (`:34-35`).

**🟢 C2. `AI_KEK` wording.** With a different KEK nothing is re-encrypted automatically; reads fail locally with `key_unreadable`, and only a save (`server/ai/routes.js:143-148`) re-seals the key under the dev KEK, after which production answers `key_unreadable`. Suggested: "with a different KEK, saving an AI key in dev re-seals it and production can no longer read it." Consider "keep `AI_KEK` unset" with no exception.

**🟢 C3. The migrate guardrail holds.** `pnpm start` is `node server/index.js`, which does not run migrations. `TUDO_AUTH_MODE` can only be `identity`, so a local server on the production database still verifies every bearer token.

**🟢 C4. The local Node server listens on all interfaces** (`server/index.js:81`). Auth is always enforced; only unauthenticated `/healthz` and `/readyz` reveal a connected database. Optional: a `HOST` env var, `HOST=127.0.0.1` in the dev command.

**🟢 C5. Say where the `pg_dump` goes:** outside the repo, mode 600 (a full copy of production data, including encrypted AI keys); the DB tunnel listens on `127.0.0.1` only.

### Recommendations
1. Fix the README for production values (C1).
2. Optionally harden `proxyTarget` (B1).
3. Optionally refuse the bearer when forwarding headers are present, plus the README line (B2).
4. Reword the `AI_KEK` sentence and say where the `pg_dump` output goes (C2, C5).

### Risks
- Under D45 the dev token plus the production database gives real production read/write. The remaining code-level paths are a host-rewriting tunnel (B2) and production values leaking through shell history (C1).
- I did not read the D45 decision text itself.

### Open questions
1. C1 in T-025 (README only) or a `debt` issue? Proposed default: fix in T-025.
2. B1 and B2 in this ticket or a follow-up? Proposed default: a follow-up `debt` issue.
