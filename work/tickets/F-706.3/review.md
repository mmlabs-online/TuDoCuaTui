## Attempt 1 — 2026-11-22
Verdict: PASS

### Checks (run by reviewer)
- `pnpm typecheck` — clean (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- `pnpm format:check` — clean (`oxfmt --check`, 353 files checked).
- `pnpm test` — all relevant test suites passed against real Postgres 17 test cluster (`TEST_DATABASE_URL`):
  - `openai.test.ts` (5 passed)
  - `crypto.test.ts` (10 passed)
  - `appKeys.test.ts` (5 passed)
  - `adminRoutes.test.ts` (2 passed)
  - `appKeys.db.test.ts` (3 passed)
  - `rls.db.test.ts` (19 passed)
  - `schema.db.test.ts` (26 passed)
  - `migrator.db.test.ts` (39 passed)
- `pnpm build` — client build succeeded (`vite build`).

### Acceptance criteria
- [x] 1. One shared key per provider (`claude`, `gemini`, `openai`) stored in table `ai_app_keys`. Evidence: migration `20261122160000_ai_app_keys.sql`, schema test `server/schema.db.test.ts`.
- [x] 2. Encrypted with `AI_KEK` using AES-256-GCM, with provider-bound AAD and distinct format `app-v1:`. Evidence: `server/ai/crypto.js`, `server/ai/crypto.test.ts`.
- [x] 3. RLS ENABLE + FORCE on `ai_app_keys` with maintenance policies keyed on `tudo.maintenance = 'app-keys'`. Evidence: `server/rls.db.test.ts`, `server/migrator.db.test.ts`.
- [x] 4. Owner-only admin endpoints `/api/admin/ai-keys*`: non-owners receive 403 `forbidden` with no secrets or presence leaked. Evidence: `server/ai/adminRoutes.js`, `server/ai/adminRoutes.test.ts`.
- [x] 5. Owner can list (masked hints), replace (upsert), delete, and test keys. Evidence: `server/ai/adminRoutes.test.ts`, `server/ai/appKeys.db.test.ts`.
- [x] 6. Key testing validates credentials against provider APIs without spending generation tokens. Evidence: `server/ai/openai.js`, `server/ai/openai.test.ts`, `server/ai/appKeys.db.test.ts`.
- [x] 7. Inert: AI routes (`tagPhoto.js`, `suggestOutfits.js`) do not import or consume shared keys yet. Evidence: `server/ai/appKeys.test.ts`.
- [x] 8. Documentation updated in `docs/data-model.md`, `db/migrations/README.md`, `server/README.md`.
- [x] 9. All automated quality gates (`format:check`, `typecheck`, `test`, `build`) pass.

### Blockers from review agents
None (`security-review.md` verdict: PASS).
