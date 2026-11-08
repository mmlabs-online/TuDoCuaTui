# Tủ đồ của tôi

Personal wardrobe tracker: React 19 + Vite + Tailwind v4 (UI exported from Figma Make), with a Supabase backend (Postgres + Auth + Storage).

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + anon key, or leave empty for local mode
pnpm dev
```

- **No env vars:** local mode. Data lives in localStorage and the demo items are loaded; no login. This keeps the Figma Make preview working.
- **With env vars:** Supabase mode. You log in with a magic link, and each user only sees their own data (RLS).

## Set up Supabase (one time)

TuDoCuaTui runs on the existing **stoktok** Supabase project (shared Postgres and Auth, decision D17). Every TuDo
object is prefixed `tudo_`. Setup is dashboard-only; the steps are M-1 in `work/ming-todo.md`.

1. Copy the stoktok **Project URL** and **anon key** (Project Settings → API) into `.env.local`.
2. Paste each file in `supabase/migrations/`, in filename order, into Dashboard → SQL Editor and run it.
   **Never run `db push`, `supabase link`, `db reset --linked`, `db pull` or `db diff --linked` against the shared
   project**: its migration history holds stoktok's versions.
3. Go to Auth → URL Configuration and **add** your dev and prod URLs (e.g. `http://localhost:8443`) to **Redirect URLs**
   so magic links work. Do not change the Site URL (it stays stoktok's). First confirm under Authentication → Sign In / Providers that
   *Allow new users to sign up* and *Allow anonymous sign-ins* are both OFF (if not, stop). Sign-ups being off, your login
   email must already exist under Authentication → Users.
4. Run the smoke test: [docs/qa/smoke-test.md](docs/qa/smoke-test.md). It also describes a local stack (`npx supabase start`, ports 553xx, `npx supabase stop` when done).
5. Optional: regenerate the DB types after any schema change (from the local stack, after `npx supabase db reset`):
   ```bash
   npx supabase gen types typescript --local > src/types/database.ts
   pnpm format
   ```

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
| `src/data/mappers.ts` | Maps Vietnamese UI labels ↔ DB enum ids |
| `src/data/photos.ts` | Client-side image resize before upload |
| `src/features/auth/AuthGate.tsx` | Magic-link login (only in Supabase mode) |
| `supabase/migrations/` | Schema, RLS, storage bucket and policies |
| `supabase/tests/` | pgTAP RLS and storage policy tests |
| `docs/data-model.md` | ERD and design decisions |
