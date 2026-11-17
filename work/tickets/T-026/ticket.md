# T-026: Accept 12-hour Identity access tokens

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-17 |
| Claimed by | — |
| PR | — |

## Goal
The TuDo server accepts Identity access tokens up to 12 hours old, so a dev token from `scripts/dev-token.sh` (and a
signed-in session) lasts 12 hours instead of 15 minutes.

## Feature reference
None in `docs/feature-list.md`. Decision **D46** (Ming 2026-11-17, "token 12 hours", option C); Identity side is
org-admin-api **USR-13** (raise the TTL bound, amend ADR-0005). Amends the T-019.5 verifier contract
(`server/README.md` → Identity tokens: "tokens older than 15 min rejected").

## Scope
- `server/identity.js:114`: `maxTokenAge` 900 → 43200 (12 h). Keep every other check (ES256, `iss`, `aud`, `typ`,
  required claims, 30 s leeway, `email_verified`, `sub`, roles).
- Tests for the new bound: a token 11 h 59 min old is accepted, one older than 12 h (+ leeway) is rejected.
- Check the SPA token store (`src/features/auth/tokenStore.ts`: reuse until `expires_in - 60 s`) still behaves with a
  12 h `expires_in`; change it only if a test shows a problem.
- Docs: `server/README.md` (Identity tokens), README dev-loop ("lasts 15 minutes" → 12 hours), the
  `scripts/dev-token.sh` header comment.

## Out of scope
- Any change in org-admin-api (USR-13) or the deployment repo (M-29).
- A refresh / watch mode for `dev-token.sh` (option A, not chosen).

## Acceptance criteria
- [ ] The verifier accepts a valid token issued up to 12 hours ago and rejects one older than 12 hours plus the
      30 s leeway (unit tests).
- [ ] All other verifier checks are unchanged (existing tests still pass).
- [ ] `server/README.md`, README and the `dev-token.sh` header state 12 hours and cite D46.
- [ ] Checks green.

## Technical notes
- Files: `server/identity.js`, its tests, `server/README.md`, `README.md`, `scripts/dev-token.sh` (comment only).
- Gate `plan-approval`: auth verification is High tier.
- Order: this can merge before USR-13 (a 12 h bound only widens what is accepted; Identity keeps issuing 15-minute
  tokens until M-29). The 12-hour effect starts only after USR-13 is deployed with `ACCESS_TOKEN_TTL_SECONDS=43200`.
- Risks: D46 consequences (ban latency 12 h, leaked token 12 h, global for all apps).

## Test plan
- Unit: verifier with tokens of age 0, 11 h 59 min, 12 h + 31 s; unchanged claim checks.
- Manual (after M-29): `scripts/dev-token.sh` → `expires_in` 43200; the dev app still works after 1 hour.

## Notes / answers from Ming
- 2026-11-17: "tôi muốn kéo xài. token 12 hours", then "chọn C" (D46).

## Handoff
