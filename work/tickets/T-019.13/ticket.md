# T-019.13: Abuse limits before Access removal

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-019.5 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-14 |
| Claimed by | claude@2026-11-15T06:56:10Z |
| PR | — |

## Goal
Before Cloudflare Access is removed and strangers can sign up and join (`join_policy = open`), a handful of accounts must not be able to lock everyone out of AI calls or photo uploads.

## Feature reference
Slice of T-019 (D31). From the T-019.3 security review F8/F9 and the T-019.2 security review (photo-upload slowloris); split out of T-019.5 (its plan A-T5, 2026-11-14). Today the risk is not reachable: Access still admits only allowed emails, and identity mode (M-21) keeps Access on.

## Scope
- The plan picks among (and Ming approves):
  - (a) owner budget: exempt the owner `sub` from the global AI ceilings;
  - (b) a per-IP dimension (e.g. `CF-Connecting-IP`, trustworthy only because the container has no published ports);
  - (c) a shorter body deadline for photo and tag-photo uploads (e.g. 10 s for ≤ 2 MiB) / slow-sender handling;
  - (d) keep the `tudocuatui` join policy `closed` (staff-assigned members only) until (a)–(c) land — a temporary amendment to D31's "open".
- Numbers today: global AI ceilings test 300/h, save 600/h, tag 2000/24h (≈ 15–20 accounts exhaust them); photo uploads 2/user, 3 total, 30 s body deadline; tag-photo 1/user, 2 total.

## Out of scope
- Per-user quotas on item/photo counts or Drive bytes (separate follow-up, umbrella A7).

## Acceptance criteria
- [ ] With the chosen options, N cooperating accounts cannot make the owner's AI calls or photo uploads fail (tests per option).
- [ ] Slow uploads cannot hold every upload / tag slot for the full deadline (test).
- [ ] All checks pass.

## Notes / answers from Ming
- 2026-11-15 (Ming: "duyệt T-019.13"): **Plan approved.** Orchestrator step 6 done on `main`: T-019.14 created, added to T-019.9 `Depends on`; privacy-notice AC on T-019.10; D38; M-22 note.
- 2026-11-15 (Ming, after the architect consult — see `consult-software-architect.md` open questions):
  1. **Drive: Ming's Drive for everyone** (option B), not owner-only photo storage. The consult notes this needs per-user quotas (umbrella A7) and a privacy notice (Ming can see users' photos) before strangers can upload; planner decides whether quotas fit this ticket or become a new slice that also gates T-019.9 / M-22.
  2. **Owner lane: yes** — owner exempt from the global AI ceilings and gets its own upload/tag slots; per-user limits still apply (R1, R2).
  3. **Upload body deadline: 15 s total + 5 s idle** (not the recommended 10 s + 4 s).
  4. **Join policy `open` at M-19; no per-IP limits now.** Do not run M-22 until T-019.13 is released (R7 as a ming-todo note).
- 2026-11-14 (T-019.5 security review): also decide here, before M-22 / T-019.10, **whose Google Drive holds other users' photos** — today `server/photos.js` writes every user's photos through the one configured Drive client (Ming's Drive, D27). Options: keep Ming's Drive with per-user quotas, per-user folders, or photos only for allow-listed users until a storage decision.
- 2026-11-14: created by the orchestrator per T-019.5 plan A-T5; gates T-019.9 (and so M-22, Access removal) and T-019.10 (join UX).

## Handoff

### 2026-11-15 — claude — BLOCKED
- Done: architect consult; Ming's answers (owner lane, 15 s + 5 s, open join, no per-IP, Ming's Drive for everyone); plan.md READY: owner lane on AI ceilings and slots, body deadline, `TUDO_OWNER_SUB` required in identity mode, `check-image.sh` update. Quotas split to a new slice T-019.14 (text in plan); privacy notice goes to T-019.10; shared Drive rate limit accepted as residual.
- In progress / next: Ming approves the plan. Then on `main`: create T-019.14 (from plan), add it to T-019.9 `Depends on`, add the privacy-notice AC to T-019.10, record D38, extend the M-22 note; then implement.
- Gotchas: T-019.9 and F-701.1 touch the same server files; whichever merges second rebases.
