# T-030: Decide whether a 403 from the API signs the user out

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P2 |
| Size | XS |
| Areas | security |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-23T05:00:17Z |
| PR | — |

## Goal
`authFetch` treats a 403 from the Node API the way Ming decides, and the behaviour is pinned by tests.

## Scope reference
D50; T-028.1 follow-up (PR https://github.com/mmlabs-online/TuDoCuaTui/pull/89): the T-028.1 ticket text said "only 401/403 sign out", but `authFetch` signs out only on a repeated 401.

## Scope
- Apply Ming's decision in `src/data/authFetch.ts` and document it.

## Out of scope
- Server status codes.

## Acceptance criteria
- [ ] Ming's decision is recorded in `work/decisions.md`.
- [ ] Tests cover a 403 (e.g. `forbidden_origin`) per that decision; 401 and 503 behaviour unchanged.
- [ ] All checks pass.

## Technical notes
- Files: `src/data/authFetch.ts`, `authFetch.test.ts`.
- Decision for Ming: (a) keep — a 403 passes through as an error (current; `forbidden_origin` is a config problem, signing out would not help), or (b) treat 403 like a second 401 and call `onAuthLost`. Recommendation: (a), test-pinned.

## Notes / answers from Ming
- 2026-11-23 — Decision (Ming, in chat: "duyệt tất cả"): option (a), the recommendation — a 403 passes through as an error, test-pinned; it does not sign the user out.

## Handoff
