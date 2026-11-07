# Consult — software-architect — F-005 (2026-11-07)

## Findings
- Installed: vite 8.0.5, react 19.2.4; no test packages yet. `coverage/` is in neither `.gitignore` nor `.prettierignore` (oxfmt reads the latter).
- `vite.config.ts` imports `./.figma/make/site.json` at load time and registers 5 Figma plugins (R10, untouchable). A standalone `vitest.config.ts` takes priority over it, so Vitest never loads the Figma plugins.
- `repo.ts` imports `@/lib/supabase`; with no env that resolves to `supabase = null` with no side effects, so it is safe to import in tests. It also imports `./photos` (canvas), so tests must `vi.mock("./photos")`.
- `age` is used in 4 places in App.tsx: the stale filter (508), the "Lâu chưa mặc" sort (518), the hero line and stat card (646, 696, both `>= 90`), and `ItemCard` (passed as a prop, used at 926). `age("") = 999`, so items never worn count as stale; that is current behaviour.
- `tsconfig` includes `src` with `types:["node"]`, so test files are type-checked by `pnpm typecheck`, but Vitest globals are not typed.

## Recommendations
1. **Packages (AC1).** `vitest@^4.1` (first line with Vite 8 support; check with `pnpm view vitest@latest peerDependencies` before pinning), `@vitest/coverage-v8` at the same exact version, `jsdom@^27`, `@testing-library/react@^16.3`, `@testing-library/dom@^10`, `@testing-library/jest-dom@^6`. Skip user-event, it is not needed.
2. **`vitest.config.ts`.** Standalone, no `mergeConfig` with vite.config (R10).
   - `plugins:[react()]`, alias `@` → `./src`.
   - `test:{environment:"jsdom", setupFiles:["src/test/setup.ts"], globals:false, restoreMocks:true}`.
   - Set `process.env.TZ = "Asia/Ho_Chi_Minh"` at the top so date tests behave the same on WSL, macOS and CI.
   - Add `vitest.config.ts` to the tsconfig `include`.
   - `setup.ts`: `import "@testing-library/jest-dom/vitest"` (this also gives the matcher types) and `afterEach(() => localStorage.clear())`.
   - Scripts: `"test":"vitest run"`, `"test:coverage":"vitest run --coverage"`. Add `coverage/` to `.gitignore` and `.prettierignore`.
3. **Fake Supabase client (AC2, D6).** One small `src/test/fakeSupabase.ts`, about 80 lines.
   - A builder whose methods (`select/eq/order/limit/insert/upsert/delete`) log `{table, method, args}` and return `this`. `single`/`maybeSingle` also return the builder.
   - The builder is a thenable, because `delete().eq()` and `select().eq()` are awaited without a terminal call. `then` takes the next result from a scripted FIFO queue of `{data, error}`.
   - `storage.from()` returns `vi.fn`s for `createSignedUrls/upload/remove/copy`; `auth.getUser` is a `vi.fn`.
   - Type it with its own small interfaces and cast once where it is passed in: `createSupabaseRepo(fake as unknown as SupabaseClient<Database>)`. One cast, no `any` sprawl.
   - About 30 tests: list, locations, save (5 photo branches plus new vs existing location), remove, wear ±1, error paths. 80% is realistic in about 2 h; split into F-005.2 only if the queue approach breaks down.
   - `useWardrobe`: `renderHook` with `vi.mock("@/lib/supabase", …supabase:null)`; also test `message()` for 23505 and 42501.
4. **Extraction (out of scope, R7) into `filters.ts`.**
   - `ageInDays(date, now = Date.now())`: same formula; 999 when the date is empty; keeps `new Date(date)`, including the UTC parse of `YYYY-MM-DD` (T-002 fixes that).
   - `isStale(i, now?) = ageInDays(i.lastWorn, now) >= 90`.
   - `matchesFilters(i, {query, category, filters}, now?)`, with the `"Tất cả"` check kept inside.
   - `sortItems(items, sort, now?)` returns `[...items].sort(...)`. Today the sort runs on the new array from `.filter()`, so this changes nothing.
   - App.tsx: `age` becomes `ageInDays`, lines 646 and 696 use `isStale`, and ItemCard keeps its `age` prop (no signature change before F-004).
   - Tests: 89/90/91-day boundaries via `now`; date-only vs ISO strings under the fixed TZ (name them "records current behaviour"); each sort key plus the default fallback; `localeCompare("vi")`.
5. **Other cases to cover.** Local repo `wear(-1)` keeps `lastWorn` (record it), the corrupt-JSON fallback, the `setItem` quota failure, and `locations()` dedupe.
6. **CI (R8).** After `pnpm typecheck`, add `- run: pnpm test:coverage`; it runs the same tests as `pnpm test` and also enforces the threshold. Config: `coverage:{provider:"v8", include:["src/data/**","src/features/items/filters.ts"], exclude:["src/data/photos.ts","**/*.test.*"], thresholds:{lines:80,statements:80,functions:80,branches:75}}`.

## Risks
- If Vitest's peer range does not include Vite 8 yet, pnpm prints a peer warning or installs an older Vite. Check the lockfile for a single Vite.
- `TZ` set in the config may not reach the worker on Windows (outside WSL). Fallback: `cross-env`, or `TZ` in the CI `env:` block.
- A thenable fake can hide call order. Assert the `calls` log, not only the results.
- The App.tsx edit is Medium tier and touches the same file as F-004, so F-005 merges first (as the ticket says).

## Open questions (defaults)
1. Branch threshold 75 or 80? **Default 75**: error branches (`if (error) throw`) double the branch count.
2. Should `filters.ts` count toward the threshold? **Default yes**; it is pure and cheap to cover.
3. Fixed TZ `Asia/Ho_Chi_Minh` or UTC? **Default Asia/Ho_Chi_Minh**: it matches the users, and the T-002 bug only shows there.
