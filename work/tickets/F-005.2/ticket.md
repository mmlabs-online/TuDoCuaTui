# F-005.2: Test the Supabase repo and useWardrobe with a fake client

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | data |
| Gate | none |
| Depends on | F-005 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-09T06:41:33Z |
| PR | — |

## Goal
Finish F-005's coverage goal: the Supabase repo and the `useWardrobe` hook are tested without a real backend, and CI enforces ≥ 80% coverage of `src/data/**` (excluding `photos.ts`).

## Feature reference
`docs/feature-list.md` F-005 (split F-005.2, allowed by decision D6). Split proposal in `work/tickets/F-005/plan.md`.

## Scope
- `src/test/fakeSupabase.ts`: a small typed fake client. A chainable thenable query builder with a scripted `{data, error}` FIFO and a call log; `storage.from()` with `createSignedUrls/upload/remove/copy` as `vi.fn`; `auth.getUser`. One `as unknown as SupabaseClient<Database>` cast at the call site, no `any` sprawl.
- `createSupabaseRepo` tests: list (signed URLs), locations, save (new / existing location; the 5 photo branches: data:/blob: upload, removed photo, copy on duplicate, external URL best effort, untouched), remove, wear +1 / −1, and error paths.
- `useWardrobe` tests with React Testing Library (`renderHook`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`): load, save, remove, wear, importMany, and `message()` for codes 23505 / 42501.
- Coverage gate: global `src/data/**` (excluding `photos.ts`) ≥ 80% lines/statements/functions and ≥ 75% branches, enforced by `pnpm test:coverage` in CI.

## Out of scope
- Behaviour changes in the repo or the hook (bugs found → follow-up tickets).
- Tests for F-101's `authMessages.ts` / `cooldown.ts` (separate follow-up once PR #5 is merged).

## Acceptance criteria
- [ ] `pnpm test` and `pnpm test:coverage` are green locally and in CI.
- [ ] Coverage of `src/data/**` (excluding `photos.ts`) ≥ 80% lines, statements and functions; ≥ 75% branches.
- [ ] Tests assert the call log (table, method, args), not only the results.

## Technical notes
- Files: `src/test/fakeSupabase.ts`, `src/data/repo.supabase.test.ts`, `src/data/useWardrobe.test.tsx`, `vitest.config.ts` (thresholds), `package.json`, `pnpm-lock.yaml`.
- Consult notes: `work/tickets/F-005/consult-software-architect.md` §3.
- Expected tier: Low (tests) / Medium (config).

## Test plan
- Unit: as above.
- Manual: `pnpm test:coverage` and read the report.

## Notes / answers from Ming
- 2026-11-07: created by the orchestrator from the F-005 split proposal (decision D6 allows it).

## Handoff

### 2026-11-09 — claude — IN_PROGRESS (takeover)
- Done: took over the stale claim from 2026-11-07T12:29:04Z (no code had been written). Plan READY kept; work continues on the session branch `claude/loving-fermi-t90upb`, rebuilt on latest main.
- In progress / next: implement attempt 1.
- Gotchas: main moved since the plan (F-401, F-004.1, F-601.1 merged): `vitest.config.ts` now also has `src/lib/text.ts` and `csv/parse.ts` coverage entries; `src/data/demo.ts` now exists inside `src/data/**`.
