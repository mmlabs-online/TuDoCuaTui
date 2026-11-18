# F-704.2: Use today's weather in outfit suggestions

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P2 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | data, security, architecture |
| Gate | plan-approval |
| Depends on | F-704.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-18 |
| Claimed by | — |
| PR | — |

## Goal
"Hôm nay mặc gì?" takes today's temperature and rain into account (optional), so suggestions fit the actual day,
not just the season. Second slice of F-704.

## Feature reference
`docs/feature-list.md` F-704: "suggests 3 outfits from active items using season, **weather (optional)** and stale
items first." Split recorded in F-704.1.

## Scope
- A server endpoint (e.g. `GET /api/weather`) that returns today's min/max temperature and rain chance for the
  user's chosen place, fetched server-side from a weather provider and cached (e.g. 1 hour per place).
- A setting for the place: a city picked from a short list or typed (no GPS, no precise location stored in the
  browser storage); off by default.
- `suggest` takes optional weather: cold → prefer outer and winter items, hot → skip outer, rain → note in the reason.
- The modal shows a one-line weather summary when on; when weather is off or fails, suggestions fall back to F-704.1
  rules with no error blocking the modal.

## Out of scope
- GPS / precise geolocation; hourly forecasts; AI ranking (F-704.3).

## Acceptance criteria
- [ ] With weather on, cold/hot/rain change the suggestions as described (unit tests on `suggest` with fake weather).
- [ ] Weather failure or timeout never blocks suggestions (unit tests with a failing client).
- [ ] The server endpoint validates the place, caches results, has a timeout and a per-user rate limit; tests in `server/`.
- [ ] No new secret in client code (R3); any provider key lives only in server env; `.env.example` lists the name.
- [ ] 390px and dark mode for the setting and the summary line.
- [ ] All checks pass.

## Technical notes
- High path: `server/**` → `Gate: plan-approval`; route to `security-ai-generated-code-auditor` at review.
- Open questions for Ming (answer under Notes before the plan is approved): which provider (proposed: Open-Meteo, no
  API key); which place(s) (proposed: a city chosen in Settings, stored per user on the server); the new outbound
  host must be allowed in the home-server deploy.

## Test plan
- Unit: suggest + weather rules; server route with a fake provider. Manual: Ming turns weather on and checks a cold/rainy day.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
Answers (2026-11-18, after the software-architect consult):
- Provider: Open-Meteo (no key; personal use), fixed list of ~15 Vietnamese cities, no free text, no GPS.
- Place storage: **per device** (browser localStorage, off by default) — no table, no migration.
- Thresholds: cold when today's max ≤ **24 °C** (add outer), hot when max ≥ 32 °C (no outer), rain when chance ≥ 60 %.
- **One ticket** (no 2a/2b split); stop for plan approval as usual.

## Handoff

### 2026-11-18 — claude — BLOCKED
- Done: consult software-architect; Ming's answers recorded (Open-Meteo, per-device city, cold ≤ 24 °C, one ticket); plan READY.
- In progress / next: waiting for Ming's plan approval (server/** is a High path); then implement.
- Gotchas: plan is ~350 code + ~450 test lines (over the ~400 guide; Ming chose one ticket).
