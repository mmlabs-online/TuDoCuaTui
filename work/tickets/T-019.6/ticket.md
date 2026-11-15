# T-019.6: Photos under bearer auth (blob URLs)

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, ui |
| Gate | none |
| Depends on | T-019.5 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/53 |

## Goal
Photos keep working once `/api` needs a bearer token (D34).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.6). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.6, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] In API + identity mode the SPA fetches photos with the bearer and renders `blob:` URLs, revoked on sign-out.
- [ ] Local mode unchanged (demo URLs).
- [ ] Server photo responses are `private, no-cache` + ETag; 304 only after the ownership check.
- [ ] All checks pass; 390px and dark mode.

## Technical notes
- Files (likely): `src/data/repo.http.ts`, `src/data/mappers.ts`, item card/photo components, `server/photos.js`

## Test plan
- See the umbrella plan *Tests to write* (T-019.6 rows).

## Notes / answers from Ming
- 2026-11-14 (T-019.2 plan A17, recommendation): photo responses are `private, max-age=31536000, immutable` today; a shared browser can show a cached photo after a user switch. Fix before identity mode.
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan.

## Handoff

### 2026-11-15 — claude — DONE
- Done: attempt 1 REWORK (stuck queued photos), attempt 2 REWORK (impl-log count), attempt 3 PASS; security review no 🔴. PR https://github.com/mmlabs-online/TuDoCuaTui/pull/53.
- In progress / next: Ming merges PR #53; decide disk-cache residual (`no-cache` vs `no-store` in identity mode). Next: T-019.7 (obligations recorded there).
- Gotchas: loader created once per App mount; T-019.7 must remount or `clear()` on sign-out / account switch.
