Status: READY

# Plan — T-026: Accept 12-hour Identity access tokens

Gate: `plan-approval` (High tier: server auth verification). Ming must also confirm assumptions A1–A3 below, which come
from the consult's open questions, when approving.

## Feature summary
No `docs/feature-list.md` section. The scope comes from decision D46 in `work/decisions.md`:

> D46 | 2026-11-17 | 12-hour access tokens | Identity access tokens live **12 hours** (`ACCESS_TOKEN_TTL_SECONDS=43200`,
> org-admin-api USR-13, which also amends its ADR-0005), and the TuDo server accepts tokens up to 12 hours old
> (`maxTokenAge` 43200 instead of 900). Accepted consequences: the setting is global for every mmlabs app including
> admin; a banned user or removed role keeps access for up to 12 hours (was 15 minutes, ADR-0005); a leaked token,
> including a dev token from `scripts/dev-token.sh`, works for up to 12 hours on production data (D45). Amends D45 and
> the T-019.5 verifier contract.

From the ticket's Scope:

> `server/identity.js:114`: `maxTokenAge` 900 → 43200 (12 h). Keep every other check (ES256, `iss`, `aud`, `typ`,
> required claims, 30 s leeway, `email_verified`, `sub`, roles).
> Check the SPA token store (`src/features/auth/tokenStore.ts`: reuse until `expires_in - 60 s`) still behaves with a
> 12 h `expires_in`; change it only if a test shows a problem.
> Docs: `server/README.md` (Identity tokens), README dev-loop ("lasts 15 minutes" → 12 hours), the
> `scripts/dev-token.sh` header comment.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The verifier accepts a valid token issued up to 12 hours ago and rejects one older than 12 hours plus the 30 s leeway (unit tests). | `server/identity.test.ts` › `verifier` › `token age bound is 12 hours (D46)` passes. It covers ages 0 and 43140 s (accepted), 43229 s (accepted, inside the leeway) and 43231 s (`{ ok: false, code: "expired" }`), each with `exp` in the future. Also check the test uses literal numbers and does not import the constant. Diff `server/identity.js`: the only change in the `jwtVerify` options is `maxTokenAge`. |
| 2 | All other verifier checks are unchanged (existing tests still pass). | `pnpm test`: every other test in `server/identity.test.ts` passes, and `time claims` still has its `exp: now() - 31` → `expired` and `exp: now() - 29` → ok assertions (the `exp` check alone still limits a token). Only the old `iat: now() - 931` line is moved into the new age test. Diff review: `algorithms`, `issuer`, `audience`, `typ`, `requiredClaims`, `clockTolerance: 30` and the post-verify checks (`aud`, `jti`, `email_verified`, `sub`, roles) are untouched. |
| 3 | `server/README.md`, README and the `dev-token.sh` header state 12 hours and cite D46. | Read the diff. `server/README.md:27` says "tokens older than 12 h rejected (D46)". `server/README.md:29` says "up to 12 hours, accepted; D46". `README.md:23` and `scripts/dev-token.sh:2` say 12 hours and cite D46. `scripts/dev-token.sh` has a comment-only change (`git diff` shows only `#` lines). A grep for `15 min` in `server/`, `README.md` and `scripts/` finds no stale references. |
| 4 | Checks green. | In WSL, from a copy on the Linux filesystem (tests run from `/mnt/d` time out in the server CLI tests): `rsync -a --delete --exclude node_modules --exclude dist /mnt/d/project/spaceM/projects/tudocuatui/ ~/tudo-check/ && cd ~/tudo-check && pnpm install --frozen-lockfile && pnpm typecheck && pnpm format:check && pnpm test && pnpm build`. All pass. |
| 5 | (Ticket Scope: "SPA token store still behaves with a 12 h `expires_in`") | `src/features/auth/tokenStore.test.ts` › `getToken` › `caches a 12-hour token until expires_in - 60 s` and `src/features/auth/identityClient.test.ts` › `request shapes` › `token accepts expires_in 43200 (D46)` both pass, with no change to `tokenStore.ts` or `identityClient.ts`. |

## Ming verification after merge
Order matters. T-026 must be **deployed to production** (the new server image rolled out) before M-29 switches
Identity to 12-hour tokens. See consult Risk 1: in the wrong order, tokens are rejected as `expired` after 15 min and
every request after that costs a 401, a `/token` call and a retry.

After T-026 is deployed and M-29 is done:
- A fresh `scripts/dev-token.sh` reports `expires_in` 43200.
- `pnpm dev` with the dev token proxy still loads items more than 1 hour after the token was minted.
- On the real site (phone), a signed-in session keeps working for more than 1 hour with no 401 or retry burst in the
  server logs (no `auth_denied expired` entries for tokens younger than 12 h).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/identity.js` | Add the module constant `const MAX_TOKEN_AGE_S = 43200; // D46: 12-hour Identity tokens` and use `maxTokenAge: MAX_TOKEN_AGE_S` at `:114`. Nothing else changes. | AC1; D46 |
| `server/identity.test.ts` | Remove the `iat: now() - 931` assertion from `time claims` (`:160`) and add the age-bound test. | AC1, AC2. The old assertion fails under the new bound. |
| `src/features/auth/tokenStore.test.ts` | Add one test: with `expiresIn: 43200`, the token is reused at +43,139,999 ms and refetched at +43,140,000 ms. | Ticket scope ("check the SPA token store"); R8 |
| `src/features/auth/identityClient.test.ts` | Add one test: a `/token` response with `expires_in: 43200` is accepted. | Ticket scope. It also stops `EXPIRES_MAX` (`identityClient.ts:31`, 86400) from being lowered below 43200 without anyone noticing. |
| `server/README.md` | `:27` "15 min" → "12 h (D46)". `:29` "(up to 15 minutes, accepted; ADR-0005)" → "(up to 12 hours, accepted; D46)". | AC3 |
| `README.md` | `:23` "It lasts 15 minutes." → "It lasts 12 hours (D46; 15 minutes until Identity issues 12-hour tokens, M-29)." | AC3 |
| `scripts/dev-token.sh` | Header comment `:2` "15-minute bearer token" → "bearer token valid for up to 12 hours (D46)". Comment only. | AC3 |

The expected diff is about 40 changed lines. No changes to `src/App.tsx`, migrations, `tokenStore.ts`,
`identityClient.ts` or `dev/devTokenProxy.ts`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/identity.test.ts` › `verifier` › `token age bound is 12 hours (D46)` | Uses `goodClaims()` with `exp: now() + 600` and these `iat` values: `now()` → ok. `now() - 43140` (11 h 59 min) → ok. `now() - 43229` (12 h + 29 s, inside the 30 s leeway) → ok. `now() - 43231` (12 h + 31 s) → `{ ok: false, code: "expired" }`. Use literal numbers and do not import the constant (consult R-2). The ±1 s margins can be pinned with `vi.useFakeTimers({ toFake: ["Date"] })` as in the existing test at `:303`, if the implementer wants exact timing. |
| `server/identity.test.ts` › `verifier` › `time claims` (edited) | Drop only the `iat: now() - 931` line. Keep the `exp` ±31/29 s, future `iat` and `nbf` assertions. |
| `src/features/auth/tokenStore.test.ts` › `getToken` › `caches a 12-hour token until expires_in - 60 s` | `setup({ expiresIn: 43200 })`. After `advance(43_140_000 - 1)` the token is still `tok1` (1 call). After `advance(1)` it is `tok2` (2 calls). Same shape as the existing 900 s test at `:77`. |
| `src/features/auth/identityClient.test.ts` › `request shapes` › `token accepts expires_in 43200 (D46)` | `json({ ...tokenBody, expires_in: 43200 })` → `{ accessToken: "tok-secret", expiresIn: 43200 }`. |

None of the usual edge cases apply here (Vietnamese diacritics, empty values, local vs Supabase mode, UTC+7 dates).
This is a pure server-auth time bound, and local mode does not use the verifier.

## Approach
1. `server/identity.js`: add `MAX_TOKEN_AGE_S = 43200` next to the other module constants with a `// D46` comment,
   and pass it as `maxTokenAge`. Do not add an env variable (consult R-1). jose rejects when
   `now - iat - clockTolerance > maxTokenAge`, which is the error mapped to `expired` (`codeOf`). So the 30 s leeway
   still applies on top of the bound.
2. `server/identity.test.ts`: edit `time claims` and add the age-bound test.
3. Add the two SPA tests (tests only). If either fails, stop and record it in `impl-log.md`. The ticket allows a
   `tokenStore.ts` change only when a test shows a problem, and that would need a plan amendment because it is outside
   this file list.
4. Update the docs: `server/README.md` (both lines), `README.md:23`, `scripts/dev-token.sh:2`.
5. Run the checks from the Linux-filesystem copy in WSL (AC4 command).

Rules:
- R1: no data-access change; local mode is untouched.
- R3: no secrets, and no new `VITE_*` variable.
- R6: no UI copy change.
- R7: only the files listed above.
- R8: new tests cover the changed bound and pin the SPA behaviour.
- R9: no UI change.
- R10: no Figma Make files.
- R2, R4, R5: not touched.

## Specialist input used
From `consult-software-architect.md`:
- **R-1 adopted**: `maxTokenAge` stays a code constant, not config. It is a High-tier security bound and Identity's
  `exp` controls the effective lifetime anyway (also A3).
- **R-2 adopted**: rewrite `identity.test.ts:160`, use literal ages with `exp` in the future, keep `:157-158`, and add
  the 12 h + 29 s leeway case.
- **R-3 adopted**: one `tokenStore.test.ts` case and one `identityClient.test.ts` case. Tests only.
- **R-4 adopted**: the consult found the second stale line `server/README.md:29`, which is now listed explicitly.
- **R-5 / Risk 1 adopted**: in "Ming verification after merge" the order is "T-026 deployed", not "merged". Changing
  the M-29 wording in `work/ming-todo.md` is outside this plan's files, so it is a follow-up (A2).
- **Finding 2 / Risk 2 (client-side revocation latency)**: not acted on in code, per the ticket ("change it only if a
  test shows a problem"). It is surfaced to Ming as A1.
- Findings 4–6 (rate limits, photo blob URLs, dev token proxy): no change needed. Accepted as is.

## Assumptions
The consult's open questions are not answered by Ming yet. Each default below is applied unless Ming overrides it at
plan approval.

- **A1 — SPA refresh cadence (consult Q1).** Default: **no change in T-026**. The SPA caches a 12 h token for about
  12 h, so a password reset, a sign-out in another mmlabs app or a lost membership is noticed in the app only after up
  to 12 h (before, up to about 14 min). D46 accepts the server-side 12 h validity but does not mention this client
  effect. The orchestrator opens a `debt` issue (`project:tudocuatui`) proposing
  `min(expires_in, 900) - 60` caching in `tokenStore.ts:66` as an option for Ming. Ming may instead choose to include
  that change here, which would add `tokenStore.ts` plus a test to this plan.
- **A2 — M-29 wording (consult Q2).** Default: yes. M-29 in `work/ming-todo.md:336-339` should say "after T-026 is
  deployed to production", not merged. That is an edit outside this ticket's diff, so it goes on the follow-ups list
  for the orchestrator.
- **A3 — Constant vs config (consult Q3).** Default: a code constant (`MAX_TOKEN_AGE_S`), per R-1.
- **A4 — Merge before USR-13 is safe.** Per the ticket's Technical notes, a 43200 bound only widens what is accepted.
  Identity keeps issuing 15-minute tokens (`exp` still enforced) until M-29. This is why the README line keeps a
  "15 minutes until M-29" clause.
- **Hotspots**: T-019 (umbrella, `IN_PROGRESS`) is the only open ticket on the board. This plan does not touch
  `src/App.tsx`. `server/identity.js` and the auth tests were last changed under T-019.5, which has merged. No rebase
  is expected.
- `pnpm test` runs both the server tests and the SPA tests, as in earlier tickets. Any `*.db.test.ts` that needs a
  local database behaves as it does on `main` today.

## Blocking questions
None. A1–A3 have defaults and are confirmed at the plan-approval gate.

## Split proposal
None. About 40 changed lines.
