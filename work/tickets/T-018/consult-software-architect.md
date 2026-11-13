# T-018 consult: software-architect (read-only)

## Findings

**F1. The image does not ship `src/`, and CI enforces that.** This is the main blocker for "reuse `src/shared/ai`".
- The runtime stage copies only `package.json`, `node_modules`, `dist`, `server` and `db/migrations` (`Dockerfile:39-43`). D26 records the same file set.
- `scripts/check-image.sh:73` asserts `test ! -e /app/src`.
- The server is plain JS (`// @ts-check`, `tsconfig.server.json` with `checkJs`, `noEmit`) and runs as `node server/index.js` with no build step. `src/shared/ai/*.ts` is TypeScript, and `validate.ts` imports `./catalog.ts`.
- Running those files in production would need one of two things: Node 22's type stripping, which depends on the floating `node:22-bookworm-slim` tag being 22.18 or later and prints an ExperimentalWarning, or a build step. Either way, the image would need a new `src/` path, which changes D26 and `check-image.sh`.
- The ticket's "Files" list does not mention any of this.

**F2. `server/api.js` cannot take the new routes as they are written.**
- `match()` only knows items, locations and photos.
- Lines 59-62 check `parts[3]` as a UUID for every route. `/api/ai-settings/key` and `/api/ai-settings/test` would get `400 invalid_input idInvalid`.
- Lines 83-100 run `parseItemInput` / `parseWearInput` on every PUT/POST.
- So AI routes must be dispatched before the UUID check and before body parsing, the same way photos are dispatched to `photos.js`.

**F3. The shared code is shaped for the old Edge Function.**
- `validate.parseRequest` and `AiRequest` describe an RPC style (`{action:"get"|"save"|...}`). REST routes do not need them. What can be reused is `isAllowedProvider`, `isAllowedModel`, `validateApiKeyFormat` and `MAX_BODY_BYTES`.
- `settingsHandler.ts` also has things that do not port:
  - Bearer/`getUserId` and CORS/origins.
  - DB-backed rate limiting through the `tudo_ai_calls` table.
  - `class Fail` with parameter properties, which type stripping cannot handle.
- `providerErrors.ts` (Claude half) and the `crypto.ts` logic port almost verbatim. Node 22 has `globalThis.crypto.subtle`, `btoa` and `atob`.
- The Claude adapter uses `@anthropic-ai/sdk`, which is not a server dependency.

**F4. The error envelope already matches, but the code sets differ.**
- Server: `sendError` returns `{error:{code}}`. Edge Function `errorResponse`: same shape.
- The `/api` codes `invalid_json`, `unsupported_media_type`, `invalid_input`, `db_unavailable` and `forbidden_origin` are **not** in `AI_ERROR_STATUS`.
- The T-009 client pattern (`isServerErrorCode(code) ? code : "internal"`) would collapse all of them to `internal`.
- `unauthorized` (Access 401), `method_not_allowed`, `payload_too_large` and `internal` do overlap.

**F5. How `/api` is protected today.**
- `app.js` runs `access.verify` (Cloudflare Access JWT) before `handleApi`.
- `handleApi` refuses writes with `Sec-Fetch-Site: cross-site|same-site` (`403 forbidden_origin`).
- `readJson` requires `Content-Type: application/json`. That forces a CORS preflight, which the server never answers.
- Together these are adequate CSRF defenses for a single user, as long as the AI routes go through the same guard and through `readJson`. No extra origin allowlist is needed. The old Edge Function `origins` env is not needed either.

**F6. Deploy wiring (D28 pattern).**
- The TuDo-side drafts are in `deploy/deployment-repo/`:
  - `.github/workflows/deploy-tudocuatui.yml`: `envfile` step, lines 90-144
  - `apps/tudocuatui/compose.yml`
  - `README.md`
- `scripts/deploy-envfile.test.ts:198` asserts that the env mapping is "exactly the four TUDOCUATUI_* secrets". It will fail as soon as the KEK is added.
- The Drive pattern maps prefixed repo secrets to **unprefixed** names in the env file (`GOOGLE_CLIENT_ID=`…). The ticket says the server env is `TUDOCUATUI_AI_KEK`, which breaks that convention.
- `compose.yml:21-22` still says "GitHub environment `tudocuatui`". That is stale since D28.
- The env file is shared with the `migrate` service, so `migrate` would also receive the KEK. Exposure is low because `migrate` sits on the `db` network only, but it is unnecessary.

**F7. Boundary test.**
- `src/shared/ai/boundary.test.ts` forbids `TUDO_AI_KEK` and `tudo_ai_settings`. Neither matches the new names (`TUDOCUATUI_AI_KEK`, `ai_settings`), so the R3 guard silently stops covering the new secret.
- `.env.example` must stay free of AI/KEK, which is fine.

**F8. Interaction with T-016.**
- T-016's plan deletes `mirror.test.ts`, `src/data/aiSettings.ts` and `supabase/functions/**`.
- It rewrites line 1 of each `src/shared/ai/*.ts` and adds entries to `FORBIDDEN` in `boundary.test.ts`.
- Its header text ("no runtime caller until T-010 is re-planned on the Node backend") becomes stale once T-018 lands.

**F9. Backlog.** F-701 still lists `Depends on: T-009` and "Edge Function `tag-item-photo`". It should depend on T-018 and be renamed for the Node server.

## Recommendations

**R-1. Module layout. Default: JS ports in `server/ai/` plus a parity test (ACs 2-3, D26, R3).**
- Files:
  - `server/ai/catalog.js` (providers, models, `AI_ERROR_STATUS`, `defaultModelOf`)
  - `server/ai/validate.js` (`isAllowedProvider`, `isAllowedModel`, `validateApiKeyFormat`, `MAX_BODY_BYTES`)
  - `server/ai/mask.js`
  - `server/ai/crypto.js`
  - `server/ai/providerErrors.js`
  - `server/ai/claude.js`
  - `server/ai/store.js` (SQL)
  - `server/ai/config.js` (`loadAiConfig(env)`, like `loadDriveConfig`)
  - `server/ai/routes.js` (`handleAiSettings(req, res, ctx)`)
- `server/ai/parity.test.ts` imports both trees and checks:
  - deep-equal on `AI_PROVIDERS`, `AI_MODELS` and `AI_ERROR_STATUS`
  - a fixture table run through both `validate` implementations (keys of length 19, 20, 256 and 257, inner whitespace, non-ASCII, case variants)
  - `maskHint` / `keyHintOf` equality
- This replaces `mirror.test.ts`, which T-016 deletes. It needs no change to the image, D26 or `check-image.sh`, and `/app/src` stays absent.
- Alternatives:
  - (b) Copy `src/shared/ai` into the image and rely on Node type stripping. This needs a D26 amendment, a `check-image.sh` change and pinning Node at 22.18 or later. It is fragile, so not recommended.
  - (c) Move the source of truth to a top-level `shared/ai/*.js` (JSDoc), imported by Vite via an alias and by the server, and copied into the image. This is the cleanest long-term option but touches Vite config, tsconfig and the image. Defer it unless T-010 or F-701 grows the shared surface.
- Tradeoff: (a) duplicates about 80 lines, but the test guarantees they stay equal. The ticket's "reuse `src/shared/ai`" then reads as "reuse the rules, enforced by a parity test". Say this explicitly in the plan, because it deviates from the ticket text.

**R-2. Routing in `api.js`.**
- Add `/api/ai-settings` (`GET, PUT`), `/api/ai-settings/key` (`DELETE`) and `/api/ai-settings/test` (`POST`) to `match()`.
- Dispatch to `handleAiSettings` right after the method check and the `Sec-Fetch-Site` check, before the UUID check on line 59. The origin guard stays shared, not duplicated.
- Inside the AI handler, use `readJson(req, { limit: MAX_BODY_BYTES })`.
- `POST /test` requires `Content-Type: application/json` with body `{}`. Keep the content-type requirement as a CSRF defense rather than allowing an empty body.
- Reject unknown fields in the PUT body: `{provider, model, apiKey?}` only.

**R-3. Endpoint contract (for T-010 and F-701).**

| Endpoint | 200 response | Errors |
|---|---|---|
| `GET /api/ai-settings` | `{ settings: AiSettingsView \| null }`, the existing `AiSettingsView` shape: `provider`, `model`, `keyHint` (masked `••••abcd`), `hasKey`, `modelSupported`, `updatedAt` | — |
| `PUT /api/ai-settings` | `{ settings }` | `invalid_provider`, `invalid_model`, `invalid_key_format`, `key_required` (provider change while a key exists and no new key is given; T-009 semantics) |
| `DELETE /api/ai-settings/key` | `{ settings }` (idempotent: 200 even with no key; T-009 returned the view) | — |
| `POST /api/ai-settings/test` | `{ ok: true }` | `not_configured` (no key), `invalid_model`, `key_unreadable`, `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`, `provider_unavailable`, optionally `rate_limited` |

- Any AI route without a KEK returns `503 server_misconfigured`. That code is already in the table, so T-010 can show "AI chưa được cấu hình trên máy chủ".
- Decide how the generic `/api` codes reach the client. Default: add `invalid_json`, `unsupported_media_type`, `db_unavailable` and `forbidden_origin` to `AI_ERROR_STATUS` in both trees, and use them as-is.
  - `invalid_json` and the shape errors map to `bad_request`, or keep `invalid_json`; pick one and document it.
  - Without this step the T-010 client turns them into `internal`.

**R-4. KEK config.**
- Add `loadAiConfig(process.env)` in `index.js`, following the Drive pattern:
  - unset: `{mode:"off"}`, log `"ai not configured"`, AI routes return 503 `server_misconfigured`, and everything else works (AC 4)
  - malformed (not base64 of exactly 32 bytes): `AiConfigError`, exit 2
- Import the key once at startup as a non-extractable CryptoKey. Never re-read the env per request.
- Exit 2 makes the deploy health check fail and roll back. That is the right outcome for a typo, and it is also validated earlier in the envfile step (R-6).
- Add `expect_exit 2 "server with malformed AI KEK"` to `check-image.sh`.
- Env name: follow the Drive convention.
  - The repo secret is `TUDOCUATUI_AI_KEK`, and the container env is `AI_KEK`, unprefixed. Alternatively, keep the prefix in both places. Either way, D30 must state the choice.
  - Add the container name to `boundary.test.ts` `FORBIDDEN`, together with `ai_settings`. Adding `ai_settings` would also flag client code that names the table, which is intended. Check for false positives such as `aiSettings` (no underscore, so fine).

**R-5. Crypto.**
- Port `crypto.ts` to `server/ai/crypto.js` using WebCrypto. It is nearly verbatim, keeps the `v1:` format and has no new dependency.
- AAD: `tudocuatui-ai-key|v1|single|<provider>`. Keep the provider in the AAD, so a ciphertext cannot be reused across providers.
- Document in D30 that adding users later (D25) changes the AAD scope and requires keys to be re-entered.
- Tests:
  - round trip
  - wrong KEK, wrong provider, flipped byte, truncated input and unknown version all fail
  - two seals of the same plaintext produce different ciphertexts (random IV)

**R-6. Deploy-side change (TuDo repo drafts, then copied by Ming).**
- In `deploy-tudocuatui.yml`, step `envfile`:
  - add `AI_KEK: ${{ secrets.TUDOCUATUI_AI_KEK }}`
  - make it independent of the Drive all-or-none group
  - validate it when set: `^[A-Za-z0-9+/]{43}=$`
  - append `AI_KEK=%s` with `printf` (no echo, no argv)
- Update `scripts/deploy-envfile.test.ts`: four becomes five, plus tests for format validation and "unset leaves the line out".
- Update `README.md` with a "AI key encryption (T-018)" section, and fix the stale "GitHub environment" comment in `compose.yml`.
- New Ming item M-n:
  1. Generate with `openssl rand -base64 32` locally.
  2. Store in Bitwarden.
  3. `gh secret set TUDOCUATUI_AI_KEK -R mmlabs-online/deployment`.
  4. Open a setup PR on a non-`release/` branch with the workflow draft.
  5. Run `workflow_dispatch`.
- Rollout order does not matter. An old image ignores `AI_KEK`, and a new image without it returns 503 on AI routes only.

**R-7. Claude test call.**
- Use plain injected `fetch` (Drive pattern, no SDK): `GET https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`.
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`.
- Options: `redirect: "error"`, `AbortSignal.timeout(10_000)`.
- Base URL is a hard-coded constant with no env override. This keeps the T-009 review's "pinned baseURL" property.
- Read only `res.status` and map it via `mapClaudeError`. Never read or log the body.
- Network error or timeout returns `provider_unavailable`. Tests use a fake fetch.

**R-8. Store and migration.**
- Table `ai_settings`:
  - `id smallint primary key default 1 check (id = 1)`
  - `provider text not null check (provider in ('claude','gemini'))`
  - `model text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$')`
  - `key_ciphertext text`, `key_hint text`, `key_updated_at timestamptz`
  - `updated_at timestamptz not null default now()`
  - key-pair check `((key_ciphertext is null) = (key_hint is null))`
  - trigger using the existing `set_updated_at()`
  - rollback comment as in `init.sql`
- Do **not** enforce the model allowlist in the DB. The `modelSupported` flag handles catalog drift.
- The PUT "keep the existing key unless the provider changes" logic runs in one transaction (`select … for update`, then upsert), or as a single `insert … on conflict (id) do update` with a `CASE`.
- Store interface: `get()`, `getSecret()`, `save()`, `clearKey()`. Use a fake store for route tests and a `*.db.test.ts` for the SQL. Update `schema.db.test.ts` and the migrator tests (AC 5).

**R-9. Rate limiting.**
- Do not port `tudo_ai_calls`. Use an in-memory limiter in `routes.js` (injected `now`):
  - `test`: 20 per hour; it costs nothing, but avoids hammering the provider
  - `save`: optional
- Single user behind Access, so a reset on restart is acceptable. Return `429 rate_limited`.

**R-10. Key-leak tests (AC 1).**
- Use one sentinel key, e.g. `sk-ant-SENTINEL-…` (at least 20 characters).
- Through PUT, GET, test (fake fetch failing and succeeding), DELETE, a DB error path and a malformed body, assert the sentinel never appears in any of these:
  - response bodies or headers
  - every captured `log()` entry, JSON-stringified
  - thrown error messages
- The fake fetch asserts that the sentinel appears only in the `x-api-key` header sent to the pinned host.
- Never pass `err.detail` or `err.where` from pg into logs. `dbLogFields` already restricts logging to code, constraint and routine; keep it that way for AI DB errors.

**R-11. Coordinating with T-016.**
- T-018 should **not** edit the headers of `src/shared/ai/*.ts`, `mirror.test.ts` or `aiSettings.ts`. T-016 owns those.
- T-018 only appends to `FORBIDDEN` in `boundary.test.ts`, a trivial conflict.
- Whichever lands second updates T-016's header text to "mirrored by `server/ai/*.js`; `server/ai/parity.test.ts` enforces equality", and documents the server env (`AI_KEK`) in `server/README.md`.
- Add this as a note on T-016's ticket.

**R-12. Decisions and backlog.**
- D30 records:
  - D21 is amended to "API mode only"
  - storage: a single row, AES-256-GCM, KEK in server env, repo secret per D28
  - the AAD scope and its consequence for multi-user
  - the R-1 choice (JS port plus parity test, D26 unchanged)
- Re-point F-701 to `Depends on: T-018`, and rename it away from "Edge Function".

## Risks
- **Lost or rotated KEK** makes the stored key unreadable. `test` returns `key_unreadable`, and the fix is to re-enter the key. A rollback restores the image, never the KEK. Rotation is out of scope; the `v1:` prefix leaves room for it.
- **Co-location.** The KEK in the host env file and the ciphertext in the `pgdata` dumps sit on the same host, so encryption protects backups and dumps, not a compromised host. That is acceptable, but D30 should say so.
- **`migrate` receives the KEK** through the shared `env_file`. Low risk because it has no egress. A follow-up debt item could be a separate env file.
- **Parity drift.** Without the parity test, the browser and the server can disagree on allowed models. The test is the only guard.
- **Cloudflare Access session expiry.** The edge answers with a 302 to the login page, so the SPA's fetch sees a network or redirect error, not 401. T-010 should map that to "đăng nhập lại", not "lỗi mạng". Note it for T-010 and F-701.
- **Ticket text vs. reality.** "Reuse `src/shared/ai`" cannot work at runtime as written (F1). If the planner follows it literally, either the image check fails or Node type stripping becomes a silent production dependency.
- `deploy-tudocuatui.yml` is a `deploy*` workflow, so the High tier applies (already `plan-approval`). Ming copies it into the deployment repo by hand.

## Open questions (batch for Ming, each with a default)
1. **Container env name.** Should it be `AI_KEK`, unprefixed like the Drive values, or `TUDOCUATUI_AI_KEK` everywhere? Default: `AI_KEK` in the container and `TUDOCUATUI_AI_KEK` as the repo secret, consistent with D28.
2. **Sharing code with `src/shared/ai`.** Options: JS port plus parity test, ship TS in the image, or a top-level `shared/` JS module. Default: JS port plus parity test, no D26 change.
3. **Malformed KEK.** Should the server exit 2 (deploy rolls back), or treat it like "unset" (AI returns 503, the app stays up)? Default: exit 2, plus format validation in the envfile step so it never reaches the server.
4. **Generic `/api` error codes in the AI contract.** Default: add `invalid_json`, `unsupported_media_type`, `db_unavailable` and `forbidden_origin` to `AI_ERROR_STATUS` (both trees, parity-tested).
5. **Rate limit.** Default: in-memory, `test` 20/hour, `save` 30/hour, no table.
6. **Bitwarden location.** The ticket says the KEK goes in the "personal" collection. The workspace rule keeps agents out of it, but this is a human step. Default: as the ticket says, with only the name listed in `secrets.refs.yaml` if Ming wants it tracked.

## Relevant files
- d:\mmlabs\spaceM\projects\tudocuatui\work\tickets\T-018\ticket.md
- d:\mmlabs\spaceM\projects\tudocuatui\Dockerfile
- d:\mmlabs\spaceM\projects\tudocuatui\scripts\check-image.sh (line 73: `test ! -e /app/src`)
- d:\mmlabs\spaceM\projects\tudocuatui\server\api.js (lines 59-62 UUID check, lines 83-100 body parsing)
- d:\mmlabs\spaceM\projects\tudocuatui\server\app.js
- d:\mmlabs\spaceM\projects\tudocuatui\server\index.js
- d:\mmlabs\spaceM\projects\tudocuatui\server\http.js
- d:\mmlabs\spaceM\projects\tudocuatui\server\drive.js (config and injected-fetch pattern)
- d:\mmlabs\spaceM\projects\tudocuatui\src\shared\ai\{catalog,errors,validate,mask,boundary.test,mirror.test}.ts
- d:\mmlabs\spaceM\projects\tudocuatui\supabase\functions\_shared\core\{crypto,providerErrors,settingsHandler,rateLimit}.ts
- d:\mmlabs\spaceM\projects\tudocuatui\supabase\functions\_shared\deno\claude.ts
- d:\mmlabs\spaceM\projects\tudocuatui\deploy\deployment-repo\.github\workflows\deploy-tudocuatui.yml (envfile step, lines 90-144)
- d:\mmlabs\spaceM\projects\tudocuatui\deploy\deployment-repo\apps\tudocuatui\compose.yml
- d:\mmlabs\spaceM\projects\tudocuatui\deploy\deployment-repo\README.md
- d:\mmlabs\spaceM\projects\tudocuatui\scripts\deploy-envfile.test.ts (line 198: "exactly the four")
- d:\mmlabs\spaceM\projects\tudocuatui\db\migrations\20261110120000_init.sql (`set_updated_at`)
- d:\mmlabs\spaceM\projects\tudocuatui\work\tickets\T-016\plan.md (lines 75, 78, 88, 100)
- d:\mmlabs\spaceM\projects\tudocuatui\work\decisions.md (D21, D23, D25, D26, D28)
