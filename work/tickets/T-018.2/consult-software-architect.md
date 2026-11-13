# Consult — software-architect — T-018.2 (2026-11-13)

## Findings

1. **What T-019.3 will rewrite in `server/ai/*` is small and easy to locate.** D33 / T-019 plan A6 change three things:
   - Store methods get `userId` first.
   - The AAD becomes `…|v2|<sub>|<provider>` (only `aad()` / `sealKey` / `openKey` in `crypto.js`).
   - The limiter becomes a per-user `Map`.

   Nothing in T-018.2's provider half depends on ownership: `claude.js`, `providerErrors.js`, the pinned URL, header rules, timeout and status mapping. Only these lines in the `/test` route are ownership-dependent: `store.getSecret()`, the `openKey(...)` call and `limiter.check("test")`. That is about three call sites.
2. **`getSecret()` does not exist yet** (`server/ai/store.js` has only `get` / `save` / `clearKey`). T-018.1 planned it for T-018.2, so T-018.2 adds it.
3. **The current request context has no `userId`.** `ctx.userId` arrives in T-019.2 (`app.js`/`api.js`, Access mapped to `TUDO_OWNER_SUB`). If T-018.2 added an owner parameter now, it would have no source except a constant. That would be speculative plumbing and outside the ticket (R7).
4. **The KEK deploy wiring does not depend on T-019 at all:**
   - the envfile `AI_KEK` line, its regex and the five-secret test
   - the README section
   - the compose comment fix (line 21 still says "GitHub environment `tudocuatui`", which is stale since D28)
   - M-16 (Ming's KEK steps)
   - G1 (`delete process.env.AI_KEK`)

   D33 keeps one server KEK; only the AAD changes. `scripts/check-image.sh` already allow-lists `AI_` and already checks "malformed AI_KEK → exit 2" (line 105), so it probably needs no change.
5. **T-019 plan A6 assumes the KEK is not deployed yet.** Its text: "Legacy v1 ciphertext is cleared (the KEK is not yet deployed: T-018.2 is BACKLOG)". If T-018.2 ships first and Ming saves a real key (by curl; T-010 is still blocked), T-019.3 will wipe it and he must enter it again. The cost is small, but the assumption becomes stale.
6. **Y1 (AI usable with no auth when Access is off) is phrased in terms of Access.** T-019.5 replaces Access on/off with `TUDO_AUTH_MODE=access|identity`. A check written as `access.mode === "off"` becomes wrong in identity mode, where `access` is null but auth is enforced.
7. **Ming item numbering:** `work/ming-todo.md` moved the T-019 items up by one (M-17–M-22), so M-16 is free for T-018.2. No clash.
8. **Hotspots (T-019 plan A17):** T-018.2 and T-019.2 / T-019.3 / T-019.5 all touch `server/index.js` and `server/ai/{routes,store,rateLimit}.js`, and T-019.2 also touches `compose.yml`. Whichever merges second rebases. T-018.2's deploy changes are in the workflow's envfile step, which T-019 does not touch.

## Recommendations

**R1. Do not defer T-018.2. Ship it now, before T-019.1.**
- T-019.1 waits on M-17 → M-19 → upstream USR-07, so the T-019 chain may sit for a while. T-010 and F-701 stay blocked on T-018.2 meanwhile.
- The deploy wiring and the Claude adapter are needed under every ownership model.

**R2. Do not add `userId` / owner parameters in T-018.2. Shape the seams instead, so T-019.3 changes about three lines:**
- **`store.getSecret()`** returns `{ provider, model, ciphertext } | null`, as SQL only. Decryption stays out of the store. T-019.3 then just turns it into `getSecret(userId)`.
- **One helper, `openStoredKey(kek, secret)`**, in `server/ai/` (in `crypto.js` or a small `keys.js`). It returns `{ ok: true, key } | { ok: false, code: "not_configured" | "key_unreadable" }` and maps every `openKey` failure to `key_unreadable`, never logging the error (G2). This is the only place T-019.3 must change for AAD v2; F-701 reuses it.
- **`claude.js` stays a pure adapter:** `checkClaudeKey({ fetch, key, model, signal })` → `{ ok: true } | { ok: false, code: AiErrorCode }`. It knows nothing about the store, KEK, user or limiter.
- **The route only wires things together:** limiter → strict `{}` body → `getSecret` → `openStoredKey` → model in catalog → `checkClaudeKey` → log fixed fields.

**R3. Keep the body strictly `{}` and reject any field, explicitly including `apiKey`.** Testing only the stored key keeps the endpoint safe under BYOK; accepting a key in the body would make the server an open key-validity oracle after open join. Add a route test: `{ "apiKey": … }` → 400, and fetch is never called.

**R4. Leave the limiter as is (`check("test")`, 20 per hour).** Under Access there is one caller. The per-user `Map` with eviction is T-019.3's AC. Order the checks so the limiter runs before any decryption or provider call.

**R5. Implement Y1 as a predicate about auth, not about Access.** In `index.js`, enable AI only if requests are authenticated (today: `access !== null`); otherwise `ai = null` and log `ai disabled: request auth off`. Comment that T-019.5 must change the predicate to "auth mode is access or identity".

**R6. Keep the deploy half exactly as ticketed. Apply G1 after `importKek`** (`delete process.env.AI_KEK`). The `AI_KEK` envfile line is independent of the Drive all-or-none group, matches `^[A-Za-z0-9+/]{43}=$`, is written with `printf`, and is left out when unset. `migrate` receiving `AI_KEK` through the shared env file stays accepted (T-018 A12).

**R7. Write a forward note into `work/tickets/T-019.3/ticket.md` (orchestrator, at T-018.2 DONE).** If T-018.2 has merged, T-019.3 must also: scope `getSecret(userId)`; move `openStoredKey` to v2 AAD; make the `test` limiter per user; add a two-user `/test` isolation test (B never sends A's key, gets `not_configured`); test that a leftover v1 ciphertext gives `key_unreadable`. Also correct A6's "KEK not yet deployed" rationale.

**R8. Update T-018.2's Feature reference to cite D33 alongside D30.**

## Risks
- **Ming's key gets wiped** by T-019.3 if saved after M-16. Add one line to M-16.
- **Key-validity oracle after open join (T-019.3 / T-019.10):** per-user limits alone do not cap it; T-019.3 should keep a global ceiling on `test` (and probably `save`).
- **Y1 predicate drift** in T-019.5 (fails closed). Covered by the R5 comment plus a T-019.5 test.
- **Rebase churn** on `server/index.js` and `server/ai/routes.js`; low because edits are additive.
- **Provider error body echoes the key:** `claude.js` must cancel the body and never read it into a message; sentinel test required.

## Open questions (for Ming)
1. Y1 default: refuse AI when request auth is off (dev), or warn? Recommend refuse.
2. Saving a real key before T-019.3: allowed (re-enter after T-019.3), or should M-16 say wait?
3. Should T-019.3 list T-018.2 in `Depends on`, or only carry the conditional note (R7)? Recommend the note only.
