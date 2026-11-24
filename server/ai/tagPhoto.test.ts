// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { importKek } from "./crypto.js";
import type { AiStore } from "./store.js";
import { fixedAuth, headerAuth, OWNER_A } from "../test/auth.js";
import { fakeAppKeys, fakeCredits, fakeSpend, SHARED_KEY } from "../test/fake-ai.js";
import { fakePool } from "../test/fake-pool.js";

const URL_ = "/api/ai/tag-photo";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(
    servers.map((s) => {
      s.closeAllConnections();
      return new Promise((r) => s.close(r));
    }),
  );
});

const jpeg = (n = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(n, 7)]);
const JPEG_H = { "Content-Type": "image/jpeg" };
const geminiAnswer = (obj: unknown, finishReason = "STOP") =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(obj) }] } }],
    }),
  );
const googleError = (st: number, reason?: string) => () =>
  new Response(
    JSON.stringify({
      error: {
        code: st,
        message: `bad key ${SHARED_KEY}`,
        ...(reason
          ? { details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }] }
          : {}),
      },
    }),
    { status: st },
  );
const GOOD = {
  name: "Áo sơ mi trắng",
  category: "top",
  colors: ["trang"],
  seasons: ["summer"],
  material: "cotton",
  brand: null,
  tags: ["basic"],
};

type Fetch = (url: string, init: RequestInit) => Response | Promise<Response>;

async function start(
  opts: {
    pool?: boolean;
    ai?: boolean;
    fetch?: Fetch;
    now?: () => number;
    headerAuth?: boolean;
    ownerSub?: string | null;
    bodyTimeouts?: { totalMs: number; idleMs: number };
    balance?: number;
    welcomePending?: boolean;
    cap?: boolean;
    unpriced?: boolean;
    appKeys?: Parameters<typeof fakeAppKeys>[0];
  } = {},
) {
  const kek = await importKek(randomBytes(32).toString("base64"));
  const state = { getSecret: 0, fetches: [] as { url: string; init: RequestInit }[] };
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
  const spend = fakeSpend({ cap: opts.cap, unpriced: opts.unpriced });
  const fetchFn = (async (url: string, init: RequestInit) => {
    state.fetches.push({ url, init });
    return (opts.fetch ?? (() => geminiAnswer(GOOD)))(url, init);
  }) as unknown as typeof globalThis.fetch;
  const logs: Record<string, unknown>[] = [];
  const server = http.createServer(
    createApp({
      pool: (opts.pool === false ? null : fakePool({ query: async () => ({ rows: [] }) })) as never,
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
      now: opts.now,
      ownerSub: opts.ownerSub,
      bodyTimeouts: opts.bodyTimeouts,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, port, logs, state, appKeys, credits, spend };
}

const post = (
  base: string,
  body: RequestInit["body"] = jpeg(),
  headers: Record<string, string> = {},
  key: string | null = randomUUID(),
) =>
  fetch(base + URL_, {
    method: "POST",
    headers: { ...JPEG_H, ...(key ? { "Idempotency-Key": key } : {}), ...headers },
    body,
  });
const err = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("shared key and credits", () => {
  it("shared key: uses appKeys.open(gemini) key and gemini-2.5-flash, reserves photo_fill and commits", async () => {
    const dirty = {
      name: "x".repeat(121),
      category: "bag",
      colors: ["purple", "den"],
      seasons: ["winter", "winter"],
      material: "cotton",
      brand: null,
      tags: [],
    };
    const s = await start({ fetch: () => geminiAnswer(dirty) });
    const res = await post(s.base);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      suggestion: {
        name: null,
        category: null,
        colors: ["den"],
        seasons: ["winter"],
        material: "cotton",
        brand: null,
        tags: [],
      },
    });
    expect(s.appKeys.calls).toEqual(["gemini"]);
    expect(s.state.fetches).toHaveLength(1);
    expect(s.state.fetches[0].url).toBe(GEMINI_URL);
    expect((s.state.fetches[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      SHARED_KEY,
    );
    expect(s.credits.log).toEqual(["reserve:photo_fill", "commit"]);
    expect(s.credits.state.balance).toBe(999);
    expect(s.spend.reserves).toEqual([
      { provider: "gemini", model: "gemini-2.5-flash", kind: "photo_fill" },
    ]);
    expect(s.spend.settles.map((x) => x.outcome)).toEqual(["ok"]);
  });

  it("BYOK row present: getSecret never called, provider gets the shared key", async () => {
    const s = await start();
    expect((await post(s.base)).status).toBe(200);
    expect(s.state.getSecret).toBe(0);
  });

  it("no shared key -> 409 not_configured, no reserve, body not read", async () => {
    const s = await start({ appKeys: { key: null } });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([409, "not_configured"]);
    expect(res.headers.get("connection")).toBe("close");
    expect(s.credits.log).toEqual([]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("unreadable shared key -> 409 key_unreadable, no reserve", async () => {
    const s = await start({ appKeys: { unreadable: true } });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([409, "key_unreadable"]);
    expect(s.credits.log).toEqual([]);
  });

  it("out of credits -> 402 credits_exhausted, body not read, no provider call", async () => {
    const s = await start({ balance: 0 });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([402, "credits_exhausted"]);
    expect(res.headers.get("connection")).toBe("close");
    expect(s.state.fetches).toHaveLength(0);
    expect(s.spend.reserves).toHaveLength(0);
  });

  it("welcome pending and no monthly left -> 402 welcome_pending", async () => {
    const s = await start({ balance: 0, welcomePending: true });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([402, "welcome_pending"]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("missing or invalid Idempotency-Key -> 400 bad_request before any reserve", async () => {
    const s = await start();
    for (const key of [null, "", "x".repeat(129), "bad key!"]) {
      const res = await post(s.base, jpeg(), {}, key);
      expect([res.status, await err(res)]).toEqual([400, "bad_request"]);
    }
    expect(s.credits.log).toEqual([]);
    expect(s.appKeys.calls).toEqual([]);
  });

  it("replay: same key + same photo -> 200 stored suggestion, provider called once, one credit", async () => {
    const s = await start();
    const a = await post(s.base, jpeg(), {}, "op-1");
    const first = await a.json();
    const b = await post(s.base, jpeg(), {}, "op-1");
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual(first);
    expect(s.state.fetches).toHaveLength(1);
    expect(s.credits.state.balance).toBe(999);
    expect(s.spend.reserves).toHaveLength(1);
  });

  it("same key + other photo -> 400 bad_request, no provider call", async () => {
    const s = await start();
    await (await post(s.base, jpeg(64), {}, "op-2")).text();
    const res = await post(s.base, jpeg(80), {}, "op-2");
    expect([res.status, await err(res)]).toEqual([400, "bad_request"]);
    expect(s.state.fetches).toHaveLength(1);
  });

  it("live reservation -> 503 ai_busy Retry-After 5", async () => {
    const s = await start();
    s.credits.ops.set(`${OWNER_A}:op-3`, {
      opKey: "op-3",
      kind: "photo_fill",
      state: "reserved",
      expired: false,
      requestHash: null,
      result: null,
      errorCode: null,
    });
    const res = await post(s.base, jpeg(), {}, "op-3");
    expect([res.status, await err(res), res.headers.get("retry-after")]).toEqual([
      503,
      "ai_busy",
      "5",
    ]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("refunded key replays the stored error code", async () => {
    const s = await start({ fetch: googleError(500) });
    const a = await post(s.base, jpeg(), {}, "op-4");
    expect([a.status, await err(a)]).toEqual([502, "provider_unavailable"]);
    const b = await post(s.base, jpeg(), {}, "op-4");
    expect([b.status, await err(b)]).toEqual([502, "provider_unavailable"]);
    expect(s.state.fetches).toHaveLength(1);
    expect(s.credits.state.balance).toBe(1000);
  });
});

describe("failures", () => {
  it("provider failure refunds credits and settles spend with the provider code", async () => {
    const cases: [Fetch, number, string, string][] = [
      [googleError(400, "API_KEY_INVALID"), 422, "invalid_key", "invalid_key"],
      [googleError(403), 422, "key_forbidden", "key_forbidden"],
      [googleError(404), 422, "model_unavailable", "model_unavailable"],
      [googleError(429), 429, "provider_rate_limited", "provider_rate_limited"],
      [googleError(500), 502, "provider_unavailable", "provider_unavailable"],
      [
        () => geminiAnswer(GOOD, "MAX_TOKENS"),
        502,
        "provider_bad_response",
        "provider_bad_response",
      ],
    ];
    for (const [f, status, code, outcome] of cases) {
      const s = await start({ fetch: f });
      const res = await post(s.base);
      expect([res.status, await err(res)]).toEqual([status, code]);
      expect(s.credits.log).toEqual(["reserve:photo_fill", "refund"]);
      expect(s.credits.state.balance).toBe(1000);
      expect(s.spend.settles.map((x) => x.outcome)).toEqual([outcome]);
    }
  });

  it("invalid photo after reserve -> refund, spend settled not_sent, 400 invalid_photo", async () => {
    const s = await start();
    for (const body of [Buffer.from("not a jpeg at all"), Buffer.alloc(0)]) {
      const res = await post(s.base, body);
      expect([res.status, await err(res)]).toEqual([400, "invalid_photo"]);
    }
    expect(s.state.fetches).toHaveLength(0);
    expect(s.credits.state.balance).toBe(1000);
    expect(s.spend.settles.map((x) => x.outcome)).toEqual(["not_sent", "not_sent"]);
  });

  it("cap reached -> 503 ai_cap_reached, credits refunded, provider count 0, body not read", async () => {
    const s = await start({ cap: true });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([503, "ai_cap_reached"]);
    expect(res.headers.get("connection")).toBe("close");
    expect(s.state.fetches).toHaveLength(0);
    expect(s.credits.log).toEqual(["reserve:photo_fill", "refund"]);
    expect(s.credits.state.balance).toBe(1000);
  });

  it("at the cap GET /api/ai-settings and /api/auth/me still answer 200", async () => {
    const s = await start({ cap: true });
    expect((await fetch(s.base + "/api/ai-settings")).status).toBe(200);
    expect((await fetch(s.base + "/api/auth/me")).status).toBe(200);
  });

  it("unpriced model -> refund, 503 server_misconfigured", async () => {
    const s = await start({ unpriced: true });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([503, "server_misconfigured"]);
    expect(s.credits.state.balance).toBe(1000);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("ai null -> 503 server_misconfigured; no pool with injected fakes still serves", async () => {
    const a = await start({ ai: false });
    const res = await post(a.base);
    expect([res.status, await err(res)]).toEqual([503, "server_misconfigured"]);
    const b = await start({ pool: false });
    const r2 = await post(b.base);
    // Without a pool the app builds no ledger of its own, but the injected fakes still serve.
    expect(r2.status).toBe(200);
  });
});

describe("upload guards", () => {
  it("415 for another content type, nothing reserved, connection closed", async () => {
    const s = await start();
    const res = await post(s.base, jpeg(), { "Content-Type": "image/png" });
    expect([res.status, await err(res)]).toEqual([415, "unsupported_media_type"]);
    expect(res.headers.get("connection")).toBe("close");
    expect(s.credits.log).toEqual([]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("413 for a declared length over 2 MB", async () => {
    const s = await start();
    const res = await post(s.base, Buffer.alloc(2 * 1024 * 1024 + 1, 1));
    expect([res.status, await err(res)]).toEqual([413, "payload_too_large"]);
    expect(s.credits.log).toEqual([]);
  });

  it("413 for a streamed body over 2 MB without a length, credits refunded", async () => {
    const s = await start();
    const chunk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1024 * 1024)]);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(chunk);
        c.enqueue(chunk);
        c.enqueue(chunk);
        c.close();
      },
    });
    // The server answers 413 and then closes the socket with the upload unread, so the client may see a reset
    // instead of the response; the server-side log is the reliable witness in that case.
    const res = await fetch(s.base + URL_, {
      method: "POST",
      headers: { ...JPEG_H, "Idempotency-Key": randomUUID() },
      body: stream,
      duplex: "half",
    } as RequestInit).catch(() => null);
    if (res) expect([res.status, await err(res)]).toEqual([413, "payload_too_large"]);
    while (!s.logs.some((l) => l.event === "ai_tag")) await new Promise((r) => setTimeout(r, 10));
    expect(s.logs.find((l) => l.event === "ai_tag")?.code).toBe("payload_too_large");
    await new Promise((r) => setTimeout(r, 50));
    expect(s.state.fetches).toHaveLength(0);
    expect(s.credits.state.balance).toBe(1000);
  });

  it("invalid_photo when the client hangs up before the declared length arrived", async () => {
    const s = await start();
    const sock = net.connect(s.port, "127.0.0.1", () => {
      sock.write(
        `POST ${URL_} HTTP/1.1\r\nHost: x\r\nContent-Type: image/jpeg\r\nIdempotency-Key: hang-1\r\nContent-Length: 100\r\n\r\n`,
      );
      sock.write(jpeg(10));
      setTimeout(() => sock.destroy(), 30);
    });
    sock.on("error", () => {});
    while (!s.logs.some((l) => l.event === "ai_tag")) await new Promise((r) => setTimeout(r, 10));
    expect(s.logs.find((l) => l.event === "ai_tag")?.code).toBe("invalid_photo");
    expect(s.state.fetches).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(s.credits.state.balance).toBe(1000);
  });
});

describe("rate limit", () => {
  it("100 pass, the 101st is 429 before any key is opened; passes again 24 h later", async () => {
    let t = 1_000_000;
    const s = await start({ now: () => t });
    for (let i = 0; i < 100; i++) expect((await post(s.base)).status).toBe(200);
    expect(s.state.fetches).toHaveLength(100);
    const before = s.appKeys.calls.length;
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([429, "rate_limited"]);
    expect(s.appKeys.calls.length).toBe(before);
    t += 24 * 60 * 60 * 1000 + 1;
    expect((await post(s.base)).status).toBe(200);
  }, 30_000);
});

describe("in-flight cap", () => {
  it("1 per user, 2 in total: A's second and C are busy, B is accepted; release frees a slot", async () => {
    const release: (() => void)[] = [];
    const s = await start({
      headerAuth: true,
      fetch: () => new Promise<Response>((r) => release.push(() => r(geminiAnswer(GOOD)))),
    });
    const as = (u: string) => ({ "x-test-user": u });
    const a = post(s.base, jpeg(), as("a"));
    while (release.length < 1) await new Promise((r) => setTimeout(r, 5));
    const a2 = await post(s.base, jpeg(), as("a"));
    expect([a2.status, await err(a2)]).toEqual([503, "ai_busy"]);
    expect(a2.headers.get("retry-after")).toBe("5");
    const b = post(s.base, jpeg(), as("b"));
    while (release.length < 2) await new Promise((r) => setTimeout(r, 5));
    const c = await post(s.base, jpeg(), as("c"));
    expect([c.status, await err(c)]).toEqual([503, "ai_busy"]);
    release.forEach((f) => f());
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    const c2 = post(s.base, jpeg(), as("c"));
    while (release.length < 3) await new Promise((r) => setTimeout(r, 5));
    release[2]();
    expect((await c2).status).toBe(200);
  });

  it("is released after an error path", async () => {
    const s = await start({ fetch: () => new Response("{}", { status: 500 }) });
    for (let i = 0; i < 4; i++) expect((await post(s.base)).status).toBe(502);
  });
});

describe("client disconnect", () => {
  it("aborts the provider call, refunds, and releases the counter", async () => {
    let signal: AbortSignal | undefined;
    let calls = 0;
    const s = await start({
      fetch: (_u, init) => {
        if (++calls > 1) return geminiAnswer(GOOD);
        signal = init.signal as AbortSignal;
        return new Promise<Response>((_, reject) => {
          signal!.addEventListener("abort", () => reject(new Error("aborted " + SHARED_KEY)));
        });
      },
    });
    const ctl = new AbortController();
    const p = fetch(s.base + URL_, {
      method: "POST",
      headers: { ...JPEG_H, "Idempotency-Key": "disc-1" },
      body: jpeg(),
      signal: ctl.signal,
    }).catch(() => null);
    while (!signal) await new Promise((r) => setTimeout(r, 5));
    ctl.abort();
    await p;
    while (!signal.aborted) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 50));
    expect(s.logs.filter((l) => l.event === "ai_tag")).toHaveLength(1);
    expect(JSON.stringify(s.logs)).not.toContain(SHARED_KEY);
    expect(s.credits.state.balance).toBe(1000);
    expect((await post(s.base)).status).toBe(200);
    expect((await post(s.base)).status).toBe(200);
  });
});

describe("method and origin", () => {
  it("405, 403 and 404", async () => {
    const s = await start();
    const get = await fetch(s.base + URL_);
    expect([get.status, get.headers.get("allow")]).toEqual([405, "POST"]);
    const x = await post(s.base, jpeg(), { "Sec-Fetch-Site": "cross-site" });
    expect([x.status, await err(x)]).toEqual([403, "forbidden_origin"]);
    expect((await fetch(s.base + URL_ + "/x", { method: "POST" })).status).toBe(404);
    expect((await fetch(s.base + "/api/ai", { method: "POST" })).status).toBe(404);
  });
});

describe("secrets and logs", () => {
  it("logs carry fixed fields only; key and result never logged", async () => {
    const s = await start();
    await (await post(s.base)).text();
    await (await post(s.base, Buffer.from("junk"))).text();
    const tags = s.logs.filter((l) => l.event === "ai_tag");
    expect(tags).toHaveLength(2);
    for (const l of tags) {
      expect(Object.keys(l).sort()).toEqual(["code", "event", "id", "ms"]);
      expect(l.ms as number).toBeGreaterThanOrEqual(0);
    }
    expect(tags.map((l) => l.code)).toEqual(["ok", "invalid_photo"]);
    expect(JSON.stringify(s.logs)).not.toContain("Áo sơ mi");
  });

  it("the shared key never leaves the server", async () => {
    const cases: Fetch[] = [
      () => geminiAnswer(GOOD),
      googleError(400, "API_KEY_INVALID"),
      () => {
        throw new TypeError("fetch failed " + SHARED_KEY);
      },
    ];
    for (const f of cases) {
      const image = jpeg(40);
      const s = await start({ fetch: f });
      const res = await post(s.base, image);
      const text = await res.text();
      const headers = JSON.stringify([...res.headers]);
      expect(text + headers + JSON.stringify(s.logs)).not.toContain(SHARED_KEY);
      expect(s.state.fetches).toHaveLength(1);
      const { url, init } = s.state.fetches[0];
      expect(url).toBe(GEMINI_URL);
      expect(url).not.toContain(SHARED_KEY);
      const { headers: sent, ...rest } = init;
      expect(sent).toEqual({ "x-goog-api-key": SHARED_KEY, "content-type": "application/json" });
      expect(JSON.stringify(rest)).not.toContain(SHARED_KEY);
      const b64 = image.toString("base64");
      expect(text + JSON.stringify(s.logs)).not.toContain(b64);
      expect(String(init.body)).toContain(b64);
    }
  });
});

/** Sends the headers of a tag-photo POST that declares 1000 bytes and only 10 of them; resolves with the reply. */
function slowPost(port: number, user: string) {
  const sock = net.connect(port, "127.0.0.1", () => {
    sock.write(
      `POST ${URL_} HTTP/1.1\r\nHost: x\r\nx-test-user: ${user}\r\nContent-Type: image/jpeg\r\nIdempotency-Key: slow-${user}\r\nContent-Length: 1000\r\n\r\n`,
    );
    sock.write(Buffer.alloc(10, 1));
  });
  let out = "";
  sock.on("data", (d) => (out += d.toString()));
  sock.on("error", () => {});
  const reply = new Promise<string>((resolve) => sock.on("close", () => resolve(out)));
  return { sock, reply, text: () => out };
}

describe("body timeouts and owner lane", () => {
  it("slow tag-photo body -> 408 at idle, slot released, credits refunded", async () => {
    const s = await start({ bodyTimeouts: { totalMs: 2000, idleMs: 100 } });
    const slow = slowPost(s.port, "a");
    expect(await slow.reply).toMatch(/^HTTP\/1.1 408/);
    expect(s.credits.state.balance).toBe(1000);
    const next = await post(s.base);
    expect(next.status).toBe(200);
  });

  it("owner tag-photo is accepted while two other users hold both shared slots", async () => {
    const s = await start({ headerAuth: true, ownerSub: OWNER_A });
    const b = slowPost(s.port, "b");
    const c = slowPost(s.port, "c");
    try {
      await new Promise((r) => setTimeout(r, 150));
      const as = (u: string) => ({ "x-test-user": u });
      const a = await post(s.base, jpeg(), as("a"));
      expect(a.status).toBe(200);
      const b2 = await post(s.base, jpeg(), as("b"));
      expect([b2.status, await err(b2)]).toEqual([503, "ai_busy"]);
    } finally {
      b.sock.destroy();
      c.sock.destroy();
    }
  });

  it("the cap applies to the owner too", async () => {
    const s = await start({ headerAuth: true, ownerSub: OWNER_A, cap: true });
    const res = await post(s.base, jpeg(), { "x-test-user": "a" });
    expect([res.status, await err(res)]).toEqual([503, "ai_cap_reached"]);
  });
});
