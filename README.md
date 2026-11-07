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

1. Create a project at supabase.com and copy the **Project URL** and **anon key** into `.env.local`.
2. Apply the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push         # runs supabase/migrations/*.sql
   ```
   Or paste `supabase/migrations/20261106000000_init.sql` into Dashboard → SQL Editor.
3. Go to Auth → URL Configuration and add your dev and prod URLs (e.g. `http://localhost:8443`) to **Redirect URLs** so magic links work.
4. Run the smoke test: [docs/qa/smoke-test.md](docs/qa/smoke-test.md). It also describes a local stack (`npx supabase start`, ports 553xx, `npx supabase stop --no-backup` when done).
5. Optional: regenerate the DB types after any schema change:
   ```bash
   npx supabase gen types typescript --linked > src/types/database.ts
   ```

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
| `docs/data-model.md` | ERD and design decisions |
