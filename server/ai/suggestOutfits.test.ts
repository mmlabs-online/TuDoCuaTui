// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { importKek } from "./crypto.js";
import type { AiStore } from "./store.js";
import { fixedAuth, headerAuth, OWNER_A, OWNER_B, OWNER_C } from "../test/auth.js";
import { fakeAppKeys, fakeCredits, fakeSpend, SHARED_KEY } from "../test/fake-ai.js";
import { fakePool } from "../test/fake-pool.js";
import { SUGGEST_CATEGORIES } from "./outfitSuggest.js";

const URL_ = "/api/ai/suggest-outfits";
const JSON_H = { "Content-Type": "application/json" };
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NAME_SENTINEL = "Áo-TÊN-RIÊNG-123";
const REASON = "Áo mới chưa mặc, hợp trời lạnh";

const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(
    servers.map((s) => {
      s.closeAllConnections();
      return new Promise((r) => s.close(r));
    }),
  );
});

type Row = {
  id: string;
  user: string;
  name: string | null;
  category: string;
  status: string;
  colors: string[];
  seasons: string[];
  material: string | null;
  wear_count: number;
  last_worn: string | null;
};
const row = (n: number, category: string, over: Partial<Row> = {}): Row => ({
  id: uid(n),
  user: OWNER_A,
  name: n === 1 ? NAME_SENTINEL : `Món ${n}`,
  category,
  status: "active",
  colors: ["trang"],
  seasons: ["winter"],
  material: "cotton",
  wear_count: 0,
  last_worn: null,
  ...over,
});
const WARDROBE = [row(1, "top"), row(2, "bottom"), row(3, "dress"), row(4, "shoes")];

const geminiAnswer = (input: unknown) =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(input) }] } }],
    }),
  );
const GOOD = { outfits: [{ items: ["i1", "i2"], reason: REASON }] };

type Fetch = (url: string, init: RequestInit) => Response | Promise<Response>;

async function start(
  opts: {
    ai?: boolean;
    pool?: boolean;
    fetch?: Fetch;
    now?: () => number;
    queryError?: Error;
    headerAuth?: boolean;
    ownerSub?: string | null;
    wardrobe?: Row[];
    bodyTimeouts?: { totalMs: number; idleMs: number };
    balance?: number;
    welcomePending?: boolean;
    cap?: boolean;
    appKeys?: Parameters<typeof fakeAppKeys>[0];
  } = {},
) {
  const kek = await importKek(randomBytes(32).toString("base64"));
  const state = {
    getSecret: 0,
    fetches: [] as { url: string; init: RequestInit }[],
    queries: [] as { sql: string; params: unknown[] }[],
  };
  // A BYOK row exists: the route must never read it.
  const store = {
    async getSecret() {
      state.getSecret++;
      return { provider: "claude", model: "claude-haiku-5-5", ciphertext: "x" };
    },
    async get() {
      return null;
    },
  } as unknown as AiStore;
  const appKeys = fakeAppKeys(opts.appKeys);
  const credits = fakeCredits({
    balance: opts.balance ?? 1000,
    welcomePending: opts.welcomePending,
  });
  const spend = fakeSpend({ cap: opts.cap });
  const fetchFn = (async (url: string, init: RequestInit) => {
    state.fetches.push({ url, init });
    return (opts.fetch ?? (() => geminiAnswer(GOOD)))(url, init);
  }) as unknown as typeof globalThis.fetch;
  const wardrobe = opts.wardrobe ?? WARDROBE;
  const logs: Record<string, unknown>[] = [];
  const server = http.createServer(
    createApp({
      pool: (opts.pool === false
        ? null
        : fakePool({
            query: async (sql: string, params: unknown[]) => {
              state.queries.push({ sql, params });
              if (opts.queryError) throw opts.queryError;
              const [user, ids, cats] = params as [string, string[], string[]];
              return {
                rows: wardrobe.filter(
                  (r) =>
                    r.user === user &&
                    ids.includes(r.id) &&
                    r.status === "active" &&
                    cats.includes(r.category),
                ),
              };
            },
          })) as never,
      ai:
        opts.ai === false
          ? null
          : {
              kek,
              store,
              appKeys: appKeys as never,
              credits: credits as never,
              spend: spend as never,
              fetch: fetchFn,
            },
      distDir: "/nonexistent",
      auth: opts.headerAuth ? headerAuth() : fixedAuth(OWNER_A),
      log: (e) => logs.push(e),
      now: opts.now ?? (() => Date.parse("2026-11-18T03:00:00Z")),
      ownerSub: opts.ownerSub,
      bodyTimeouts: opts.bodyTimeouts,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, port, logs, state, appKeys, credits, spend };
}

const BODY = {
  candidateIds: [uid(1), uid(2), uid(3), uid(4)],
  season: "winter",
  weather: { cold: true, hot: false, rain: false },
};
const post = (
  base: string,
  body: unknown = BODY,
  headers: Record<string, string> = {},
  key: string | null = randomUUID(),
) =>
  fetch(base + URL_, {
    method: "POST",
    headers: { ...JSON_H, ...(key ? { "Idempotency-Key": key } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const err = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tagPost = (base: string) =>
  fetch(base + "/api/ai/tag-photo", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "Idempotency-Key": randomUUID() },
    body: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)]),
  });

describe("shared key and credits", () => {
  it("shared key: reserves suggest (1 credit) and commits; outfits use the candidates' real ids", async () => {
    const s = await start();
    const res = await post(s.base);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      outfits: [{ itemIds: [uid(1), uid(2)], reason: REASON }],
    });
    expect(s.state.fetches).toHaveLength(1);
    expect(s.state.fetches[0].url).toContain("gemini-2.5-flash:generateContent");
    expect((s.state.fetches[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      SHARED_KEY,
    );
    const sent = String(s.state.fetches[0].init.body);
    expect(sent).toContain(NAME_SENTINEL);
    expect(sent).not.toContain(uid(1));
    expect(sent).not.toContain("inline_data");
    expect(s.credits.log).toEqual(["reserve:suggest", "commit"]);
    expect(s.credits.state.balance).toBe(999);
    expect(s.spend.reserves).toEqual([
      { provider: "gemini", model: "gemini-2.5-flash", kind: "suggest" },
    ]);
    expect(s.state.getSecret).toBe(0);
  });

  it("an alias outside the sent set is dropped; an outfit that breaks the rules is dropped", async () => {
    const s = await start({
      fetch: () =>
        geminiAnswer({
          outfits: [
            { items: ["i1", "i9"], reason: "x" },
            { items: ["i1", "i3"], reason: "dress + top" },
            { items: ["i3", "i4"], reason: REASON },
          ],
        }),
    });
    const res = await post(s.base);
    expect(await res.json()).toEqual({ outfits: [{ itemIds: [uid(3), uid(4)], reason: REASON }] });
  });

  it("missing or invalid Idempotency-Key -> 400 bad_request before any reserve", async () => {
    const s = await start();
    for (const key of [null, "", "x".repeat(129), "bad key!"]) {
      const res = await post(s.base, BODY, {}, key);
      expect([res.status, await err(res)]).toEqual([400, "bad_request"]);
    }
    expect(s.credits.log).toEqual([]);
    expect(s.state.queries).toHaveLength(0);
  });

  it("no shared key -> 409 not_configured, no reserve", async () => {
    const s = await start({ appKeys: { key: null } });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([409, "not_configured"]);
    expect(s.credits.log).toEqual([]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("out of credits -> 402 credits_exhausted; welcome pending -> 402 welcome_pending", async () => {
    const a = await start({ balance: 0 });
    const ra = await post(a.base);
    expect([ra.status, await err(ra)]).toEqual([402, "credits_exhausted"]);
    const b = await start({ balance: 0, welcomePending: true });
    const rb = await post(b.base);
    expect([rb.status, await err(rb)]).toEqual([402, "welcome_pending"]);
    expect(a.state.fetches.length + b.state.fetches.length).toBe(0);
  });

  it("replay same key + same body -> stored outfits, one call, one credit; other body -> 400", async () => {
    const s = await start();
    const a = await post(s.base, BODY, {}, "op-1");
    const first = await a.json();
    const b = await post(s.base, BODY, {}, "op-1");
    expect([b.status, await b.json()]).toEqual([200, first]);
    expect(s.state.fetches).toHaveLength(1);
    expect(s.credits.state.balance).toBe(999);
    const c = await post(s.base, { ...BODY, season: "summer" }, {}, "op-1");
    expect([c.status, await err(c)]).toEqual([400, "bad_request"]);
    expect(s.state.fetches).toHaveLength(1);
  });

  it("refunded key replays the stored error code, no second call", async () => {
    const s = await start({ fetch: () => new Response("{}", { status: 500 }) });
    const a = await post(s.base, BODY, {}, "op-2");
    expect([a.status, await err(a)]).toEqual([502, "provider_unavailable"]);
    const b = await post(s.base, BODY, {}, "op-2");
    expect([b.status, await err(b)]).toEqual([502, "provider_unavailable"]);
    expect(s.state.fetches).toHaveLength(1);
    expect(s.credits.state.balance).toBe(1000);
  });

  it("cap reached -> 503 ai_cap_reached, credits refunded, no provider call; owner too", async () => {
    const s = await start({ cap: true, headerAuth: true, ownerSub: OWNER_A });
    const res = await post(s.base, BODY, { "x-test-user": "a" });
    expect([res.status, await err(res)]).toEqual([503, "ai_cap_reached"]);
    expect(s.state.fetches).toHaveLength(0);
    expect(s.credits.log).toEqual(["reserve:suggest", "refund"]);
    expect(s.credits.state.balance).toBe(1000);
    const me = await fetch(s.base + "/api/auth/me", { headers: { "x-test-user": "a" } });
    expect(me.status).toBe(200);
  });

  it("validation failure -> refund, spend charged (provider_bad_response)", async () => {
    const s = await start({
      fetch: () => geminiAnswer({ outfits: [{ items: ["i1"], reason: "x" }] }),
    });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([502, "provider_bad_response"]);
    expect(s.credits.state.balance).toBe(1000);
    expect(s.spend.settles.map((x) => x.outcome)).toEqual(["provider_bad_response"]);
  });

  it("provider statuses map to codes and refund", async () => {
    const cases: [number, number, string][] = [
      [401, 422, "invalid_key"],
      [403, 422, "key_forbidden"],
      [404, 422, "model_unavailable"],
      [429, 429, "provider_rate_limited"],
      [500, 502, "provider_unavailable"],
    ];
    for (const [from, status, code] of cases) {
      const s = await start({
        fetch: () => new Response(`{"e":"${SHARED_KEY}"}`, { status: from }),
      });
      const res = await post(s.base);
      expect([res.status, await err(res)]).toEqual([status, code]);
      expect(s.credits.state.balance).toBe(1000);
      expect(s.spend.settles.map((x) => x.outcome)).toEqual([code]);
    }
  });
});

describe("candidates", () => {
  it("candidate query is scoped to user, ids, active, allowed categories", async () => {
    const s = await start();
    await (await post(s.base)).text();
    expect(s.state.queries).toHaveLength(1);
    const { sql, params } = s.state.queries[0];
    expect(sql).toContain("user_id = $1");
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("items_with_stats");
    expect(params).toEqual([OWNER_A, BODY.candidateIds, SUGGEST_CATEGORIES]);
  });

  it("ids the DB does not return never reach the prompt", async () => {
    const wardrobe = [
      ...WARDROBE,
      row(5, "top", { user: OWNER_B, name: "TÊN-CỦA-B" }),
      row(6, "top", { status: "stored", name: "TÊN-KHO" }),
      row(7, "bikini", { name: "TÊN-BIKINI" }),
    ];
    const s = await start({ wardrobe });
    const res = await post(s.base, {
      ...BODY,
      candidateIds: [...BODY.candidateIds, uid(5), uid(6), uid(7), uid(99)],
    });
    expect(res.status).toBe(200);
    const sent = String(s.state.fetches[0].init.body);
    for (const n of ["TÊN-CỦA-B", "TÊN-KHO", "TÊN-BIKINI"]) expect(sent).not.toContain(n);
    expect(sent).toContain("i4");
    expect(sent).not.toContain("i5");
  });

  it("fewer than 2 candidates: 200 [] with no reserve and no key open", async () => {
    const s = await start();
    const one = { ...BODY, candidateIds: [uid(1), uid(98), uid(99)] };
    for (let i = 0; i < 31; i++) {
      const res = await post(s.base, one);
      expect([res.status, await res.json()]).toEqual([200, { outfits: [] }]);
    }
    expect(s.state.fetches).toHaveLength(0);
    expect(s.state.getSecret).toBe(0);
    expect(s.credits.log).toEqual([]);
    expect(s.appKeys.calls).toEqual([]);
    const real = await post(s.base);
    expect(real.status).toBe(200);
    expect(s.state.fetches).toHaveLength(1);
  });
});

describe("rate limit", () => {
  it("30 pass, the 31st is 429 before any key is opened; tag-photo is still allowed; passes 24 h later", async () => {
    let t = 1_000_000;
    const s = await start({ now: () => t });
    for (let i = 0; i < 30; i++) expect((await post(s.base)).status).toBe(200);
    const before = s.appKeys.calls.length;
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([429, "rate_limited"]);
    expect(s.appKeys.calls.length).toBe(before);
    expect(s.state.fetches).toHaveLength(30);
    expect((await tagPost(s.base)).status).not.toBe(429);
    t += 24 * 60 * 60 * 1000 + 1;
    expect((await post(s.base)).status).toBe(200);
  }, 30_000);
});

describe("in-flight cap", () => {
  it("second concurrent call -> 503 ai_busy + Retry-After, no quota used", async () => {
    let release: (() => void) | null = null;
    let calls = 0;
    const s = await start({
      fetch: () =>
        ++calls === 1
          ? new Promise<Response>((r) => (release = () => r(geminiAnswer(GOOD))))
          : geminiAnswer(GOOD),
    });
    const first = post(s.base);
    while (!release) await wait(5);
    for (let i = 0; i < 40; i++) {
      const res = await post(s.base);
      expect([res.status, res.headers.get("retry-after")]).toEqual([503, "5"]);
      expect(await err(res)).toBe("ai_busy");
    }
    (release as unknown as () => void)();
    expect((await first).status).toBe(200);
    // One call counted so far: 29 more pass, then 429.
    for (let i = 0; i < 29; i++) expect((await post(s.base)).status).toBe(200);
    expect((await post(s.base)).status).toBe(429);
  }, 30_000);

  it("a held tag-photo call does not block suggest", async () => {
    const release: (() => void)[] = [];
    const s = await start({
      fetch: (_url, init) =>
        String(init.body).includes("inline_data") && release.length === 0
          ? new Promise<Response>((r) => release.push(() => r(geminiAnswer({}))))
          : geminiAnswer(GOOD),
    });
    const tag = tagPost(s.base);
    while (release.length < 1) await wait(5);
    expect((await post(s.base)).status).toBe(200);
    release[0]();
    await tag;
  });

  it("owner passes when two other users hold the total", async () => {
    const release: (() => void)[] = [];
    const s = await start({
      headerAuth: true,
      ownerSub: OWNER_A,
      wardrobe: [OWNER_A, OWNER_B, OWNER_C].flatMap((user) =>
        WARDROBE.map((r) => ({ ...r, user })),
      ),
      fetch: () => new Promise<Response>((r) => release.push(() => r(geminiAnswer(GOOD)))),
    });
    const as = (u: string) => ({ "x-test-user": u });
    const b = post(s.base, BODY, as("b"));
    const c = post(s.base, BODY, as("c"));
    while (release.length < 2) await wait(5);
    const busy = await post(s.base, BODY, as("b"));
    expect([busy.status, await err(busy)]).toEqual([503, "ai_busy"]);
    const owner = post(s.base, BODY, as("a"));
    while (release.length < 3) await wait(5);
    release.forEach((f) => f());
    expect([(await b).status, (await c).status, (await owner).status]).toEqual([200, 200, 200]);
  });
});

describe("request guards", () => {
  it("bad body, wrong content type and over 8 KB -> 400/415/413, no quota, no fetch, nothing reserved", async () => {
    const s = await start();
    const cases: [unknown, Record<string, string>, number, string][] = [
      [{ ...BODY, extra: 1 }, {}, 400, "bad_request"],
      [{ ...BODY, candidateIds: [] }, {}, 400, "bad_request"],
      [{ ...BODY, season: "Đông" }, {}, 400, "bad_request"],
      ["{not json", {}, 400, "invalid_json"],
      [BODY, { "Content-Type": "text/plain" }, 415, "unsupported_media_type"],
      [{ ...BODY, pad: "x".repeat(9000) }, {}, 413, "payload_too_large"],
    ];
    for (const [body, headers, status, code] of cases) {
      const res = await post(s.base, body, headers);
      expect([res.status, await err(res)]).toEqual([status, code]);
    }
    expect(s.state.fetches).toHaveLength(0);
    expect(s.state.getSecret).toBe(0);
    expect(s.state.queries).toHaveLength(0);
    expect(s.credits.log).toEqual([]);
    // None of that used quota: 30 real calls still pass.
    for (let i = 0; i < 30; i++) expect((await post(s.base)).status).toBe(200);
  }, 30_000);

  it("GET -> 405 Allow POST; cross-site -> 403; extra path -> 404", async () => {
    const s = await start();
    const get = await fetch(s.base + URL_);
    expect([get.status, get.headers.get("allow")]).toEqual([405, "POST"]);
    const x = await post(s.base, BODY, { "Sec-Fetch-Site": "cross-site" });
    expect([x.status, await err(x)]).toEqual([403, "forbidden_origin"]);
    expect((await fetch(s.base + URL_ + "/x", { method: "POST" })).status).toBe(404);
  });
});

describe("error codes", () => {
  it("ai null -> 503 server_misconfigured", async () => {
    const s = await start({ ai: false });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([503, "server_misconfigured"]);
  });

  it("no pool -> 503 db_unavailable", async () => {
    const s = await start({ pool: false });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([503, "db_unavailable"]);
  });

  it("DB errors: 57P01 -> 503; others -> 500 internal with requestId", async () => {
    const down = Object.assign(new Error("x"), { code: "57P01" });
    const a = await start({ queryError: down });
    expect((await post(a.base)).status).toBe(503);
    const b = await start({ queryError: new Error("boom") });
    const res = await post(b.base);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect([res.status, body.error.code, typeof body.error.requestId]).toEqual([
      500,
      "internal",
      "string",
    ]);
  });
});

describe("secrets and logs", () => {
  it("the key never leaves the server, and goes only in the provider header", async () => {
    const cases: Fetch[] = [
      () => geminiAnswer(GOOD),
      () => new Response(`{"echo":"${SHARED_KEY}"}`, { status: 401 }),
      () => {
        throw new TypeError("fetch failed " + SHARED_KEY);
      },
    ];
    for (const f of cases) {
      const s = await start({ fetch: f });
      const res = await post(s.base);
      const text = await res.text();
      expect(text + JSON.stringify([...res.headers]) + JSON.stringify(s.logs)).not.toContain(
        SHARED_KEY,
      );
      const { url, init } = s.state.fetches[0];
      expect(url).not.toContain(SHARED_KEY);
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(SHARED_KEY);
      expect(String(init.body)).not.toContain(SHARED_KEY);
    }
  });

  it("one ai_suggest entry with fixed fields; names and the reason never appear in logs", async () => {
    const s = await start();
    await (await post(s.base)).text();
    await (await post(s.base, { ...BODY, season: "x" })).text();
    const entries = s.logs.filter((l) => l.event === "ai_suggest");
    expect(entries).toHaveLength(2);
    for (const l of entries) {
      expect(Object.keys(l).sort()).toEqual(["code", "event", "id", "ms"]);
      expect(typeof l.ms).toBe("number");
    }
    expect(entries.map((l) => l.code)).toEqual(["ok", "bad_request"]);
    const all = JSON.stringify(s.logs);
    for (const secret of [SHARED_KEY, NAME_SENTINEL, REASON]) expect(all).not.toContain(secret);
  });
});
