# Tủ đồ của tôi

Personal wardrobe tracker: React 19 + Vite + Tailwind v4 (UI exported from Figma Make), with a Supabase backend (Postgres + Auth + Storage).

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + anon key, or leave empty for local mode
pnpm dev
```

- **No env vars:** local mode. Data lives in localStorage and the demo items are loaded; no login. This keeps the Figma Make preview working.
- **With env vars:** Supabase mode. You log in with email + password (the stoktok account), and each user only sees their own data (RLS).

## Set up Supabase (one time)

TuDoCuaTui runs on the existing **stoktok** Supabase project (shared Postgres and Auth, decision D17). Every TuDo
object is prefixed `tudo_`. Setup is dashboard-only; the steps are M-1 in `work/ming-todo.md`.

1. Copy the stoktok **Project URL** and **anon key** (Project Settings → API) into `.env.local`.
2. Paste each file in `supabase/migrations/`, in filename order, into Dashboard → SQL Editor and run it.
   **Never run `db push`, `supabase link`, `db reset --linked`, `db pull` or `db diff --linked` against the shared
   project**: its migration history holds stoktok's versions.
3. Auth: no changes are needed for TuDo login (D18/D19). Do not change the Site URL (it stays stoktok's) or any other
   Auth settings. Log in with your existing stoktok email + password.
4. Run the smoke test: [docs/qa/smoke-test.md](docs/qa/smoke-test.md). It also describes a local stack (`npx supabase start`, ports 553xx, `npx supabase stop` when done).
5. Regenerate the DB types after any migration change (needs Docker; use Git Bash on Windows, not PowerShell, whose `>` writes UTF-16):
   ```bash
   npx supabase start
   npx supabase db reset   # local DB = supabase/migrations/
   pnpm db:types
   npx supabase stop
   ```
   The script introspects the **local** stack only (`--local --schema public`, D11), so the output covers `public` and
   comes from `supabase/migrations/`; it also formats the file. Commit the result. Never point it at the shared project
   (`--linked`, `--project-id`): that pulls in stoktok's tables (D17).
   Run `db reset` first: the generator reads the running DB, not the migration files, so a stack started before a
   migration change gives stale types. Do not run it while `scripts/test-db-shared.sh` is running.
   The CLI is pinned to `3.0.0`; `--local` is deprecated and goes away in CLI v4, so bump the pin deliberately.

## Deploy (Cloudflare Pages)

Production is Cloudflare Pages with Git integration (decision D5); every PR gets a preview deploy. This is M-4 in
`work/ming-todo.md`. Dashboard only; write names, never values, into the repo.

1. Prerequisite: [Set up Supabase](#set-up-supabase-one-time) (M-1) is done on the stoktok project.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → the **Pages** tab (not Workers) → **Connect to Git** →
   authorise GitHub → pick `mmlabs-online/TuDoCuaTui`.
3. Project name `tudocuatui`, production branch `main`.
4. Build settings:
   - Framework preset **None**
   - Build command `pnpm build`
   - Build output directory `dist`
   - Root directory `/`
   - Pages installs dependencies from `pnpm-lock.yaml` itself. If the build log shows no install step, use
     `pnpm install --frozen-lockfile && pnpm build`.
5. Environment variables (plain text):
   - **Production and Preview:** `NODE_VERSION` = `22`, `PNPM_VERSION` = `10.34.3`. Keep them equal to `.node-version`,
     `.mise.toml` and `package.json` → `packageManager` (Pages reads `.node-version`, not mise).
   - **Production only:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, copied from the stoktok project (Supabase →
     Project Settings → API). Use the anon/publishable key only, never the service role key (R3). Never add them to
     Preview: previews must stay in local mode (demo items, no login).
   - Never set `FIGMA_PUBLIC_URL`; it changes Vite's `base`.
6. Save and deploy. `VITE_*` values are baked in at build time, so after changing them use Deployments → latest
   production → **Retry deployment**. This also applies if they were added after the first build.
7. Copy the real production URL from the project page (it may be `tudocuatui-xxx.pages.dev` if the name was taken).
8. Password login needs no Redirect URL (Google sign-in, F-102, will). Do not change the Site URL (it stays
   stoktok's; D17).
9. Phone check: open the production URL, sign in with the stoktok email + password on the phone and confirm you are
   logged in. Open a PR's preview URL and confirm local mode.

Why there is no `public/_redirects`: Pages serves `index.html` for unknown paths when the build has no top-level
`404.html`, and the app has no client routes. Do not add a `404.html`, because it turns this fallback off.
Not used: a custom domain, a separate staging Supabase project, `wrangler.toml`.

## Running DB tests

pgTAP tests in `supabase/tests/` check that RLS and the storage policies keep each user out of other users' data.

Prerequisites: Docker Desktop running, and Node (the CLI runs via `npx supabase`). Ports 55320-55329 must be free.

```bash
npx supabase start       # first time pulls images
npx supabase test db     # runs every file in supabase/tests/
npx supabase stop               # when done
```

- Each file runs in a transaction that rolls back, so no data is left behind and runs are repeatable.
- `rls_tables.sql`: `tudo_locations`, `tudo_items`, photos, wear logs and the `tudo_items_with_stats` view. `rls_storage.sql`: bucket `wardrobe`.
- `rls_hardening.sql`: parent/path ownership checks on `tudo_locations` and `tudo_item_photos`, plus update-path guards.
- `grants.sql`: `authenticated` has exactly the grants it needs and `anon` has none; every object is prefixed `tudo_`
  (the naming checks assume a local DB that holds only TuDo objects).
- `bash scripts/test-db-shared.sh`: resets the local DB with stoktok's default-privilege revoke applied first, then runs
  all tests. Afterwards run `npx supabase db reset` to return to the default variant. Local only.
- Raw TAP for one file (no host `psql` or password needed):
  ```bash
  docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q < supabase/tests/rls_hardening.sql
  ```
- CI does not run these tests yet.

## Code map

| Path | Purpose |
|---|---|
| `src/App.tsx` | UI (from Figma Make). It talks to data only through `useWardrobe()` |
| `src/data/useWardrobe.ts` | Hook: items, locations, save/remove/wear/importMany |
| `src/data/repo.ts` | `WardrobeRepo` interface with two implementations: local (localStorage) and Supabase |
| `src/types/database.ts` | Generated by `pnpm db:types`; do not edit by hand |
| `src/data/mappers.ts` | Maps Vietnamese UI labels ↔ DB enum ids |
| `src/data/photos.ts` | Client-side image resize before upload |
| `src/features/auth/AuthGate.tsx` | Email + password login (only in Supabase mode) |
| `supabase/migrations/` | Schema, RLS, storage bucket and policies |
| `supabase/tests/` | pgTAP RLS and storage policy tests |
| `docs/data-model.md` | ERD and design decisions |
