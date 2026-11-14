// @vitest-environment node
import { randomBytes } from "node:crypto";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { importKek, sealKey } from "./crypto.js";
import type { AiStore } from "./store.js";

const SENTINEL = "sk-ant-SENTINEL-0123456789abcdef";
const URL_ = "/api/ai/tag-photo";
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
const toolAnswer = (input: unknown) =>
  new Response(
    JSON.stringify({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "tag_item", input }],
    }),
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

type Secret = { provider: string; model: string; ciphertext: string } | null;
type Fetch = (url: string, init: RequestInit) => Response | Promise<Response>;

async function start(
  opts: {
    secret?: Secret | "default";
    store?: AiStore | null;
    ai?: boolean;
    fetch?: Fetch;
    kek?: Awaited<ReturnType<typeof importKek>>;
    now?: () => number;
    getSecretError?: Error;
  } = {},
) {
  const kek = opts.kek ?? (await importKek(randomBytes(32).toString("base64")));
  const secret: Secret =
    opts.secret === undefined || opts.secret === "default"
      ? {
          provider: "claude",
          model: "claude-haiku-5-5",
          ciphertext: await sealKey(kek, "claude", SENTINEL),
        }
      : opts.secret;
  const state = { getSecret: 0, fetches: [] as { url: string; init: RequestInit }[] };
  const store: AiStore | null =
    opts.store === undefined
      ? ({
          async getSecret() {
            state.getSecret++;
            if (opts.getSecretError) throw opts.getSecretError;
            return secret;
          },
        } as unknown as AiStore)
      : opts.store;
  const fetchFn = (async (url: string, init: RequestInit) => {
    state.fetches.push({ url, init });
    return (opts.fetch ?? (() => toolAnswer(GOOD)))(url, init);
  }) as unknown as typeof globalThis.fetch;
  const logs: Record<string, unknown>[] = [];
  const server = http.createServer(
    createApp({
      pool: (opts.store === null ? null : { query: async () => ({ rows: [] }) }) as never,
      ai: opts.ai === false ? null : { kek, store: store as AiStore, fetch: fetchFn },
      distDir: "/nonexistent",
      access: null,
      log: (e) => logs.push(e),
      now: opts.now,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, port, logs, state, kek };
}

const post = (
  base: string,
  body: RequestInit["body"] = jpeg(),
  headers: Record<string, string> = JPEG_H,
) => fetch(base + URL_, { method: "POST", headers, body });
const err = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("success", () => {
  it("returns a sanitized suggestion", async () => {
    const dirty = {
      name: "x".repeat(121),
      category: "bag",
      colors: ["purple", "den"],
      seasons: ["winter", "winter"],
      material: "cotton",
      brand: null,
      tags: [],
    };
    const s = await start({ fetch: () => toolAnswer(dirty) });
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
    expect(s.state.fetches).toHaveLength(1);
    expect(s.state.fetches[0].url).toBe("https://api.anthropic.com/v1/messages");
  });
});

describe("error codes", () => {
  it("ai null -> 503 server_misconfigured", async () => {
    const s = await start({ ai: false });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([503, "server_misconfigured"]);
  });

  it("store null -> 503 db_unavailable", async () => {
    const s = await start({ store: null });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([503, "db_unavailable"]);
  });

  it("no row -> 409 not_configured, no fetch", async () => {
    const s = await start({ secret: null });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([409, "not_configured"]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("gemini or unknown model -> 400 invalid_model (even under another KEK)", async () => {
    const other = await importKek(randomBytes(32).toString("base64"));
    const ct = await sealKey(other, "gemini", SENTINEL);
    for (const secret of [
      { provider: "gemini", model: "gemini-x", ciphertext: ct },
      { provider: "claude", model: "claude-nope", ciphertext: ct },
    ]) {
      const s = await start({ secret });
      const res = await post(s.base);
      expect([res.status, await err(res)]).toEqual([400, "invalid_model"]);
      expect(s.state.fetches).toHaveLength(0);
    }
  });

  it("ciphertext under another KEK -> 409 key_unreadable", async () => {
    const other = await importKek(randomBytes(32).toString("base64"));
    const secret = {
      provider: "claude",
      model: "claude-haiku-5-5",
      ciphertext: await sealKey(other, "claude", SENTINEL),
    };
    const s = await start({ secret });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([409, "key_unreadable"]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("provider statuses map to codes", async () => {
    const cases: [number, number, string][] = [
      [401, 422, "invalid_key"],
      [403, 422, "key_forbidden"],
      [404, 422, "model_unavailable"],
      [429, 429, "provider_rate_limited"],
      [500, 502, "provider_unavailable"],
    ];
    for (const [from, status, code] of cases) {
      const s = await start({ fetch: () => new Response(`{"e":"${SENTINEL}"}`, { status: from }) });
      const res = await post(s.base);
      expect([res.status, await err(res)]).toEqual([status, code]);
    }
  });

  it("bad tool output -> 502 provider_bad_response", async () => {
    const s = await start({ fetch: () => toolAnswer("nope") });
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([502, "provider_bad_response"]);
  });

  it("getSecret errors: 57P01 -> 503, others -> 500 internal with requestId", async () => {
    const down = Object.assign(new Error("x"), { code: "57P01" });
    const a = await start({ getSecretError: down });
    expect((await post(a.base)).status).toBe(503);
    const b = await start({ getSecretError: new Error("boom") });
    const res = await post(b.base);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect([res.status, body.error.code, typeof body.error.requestId]).toEqual([
      500,
      "internal",
      "string",
    ]);
  });
});

describe("upload guards", () => {
  it("415 for another content type, no secret read, connection closed", async () => {
    const s = await start();
    const res = await post(s.base, jpeg(), { "Content-Type": "image/png" });
    expect([res.status, await err(res)]).toEqual([415, "unsupported_media_type"]);
    expect(res.headers.get("connection")).toBe("close");
    expect(s.state.getSecret).toBe(0);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("413 for a declared length over 2 MB", async () => {
    const s = await start();
    const res = await post(s.base, Buffer.alloc(2 * 1024 * 1024 + 1, 1));
    expect([res.status, await err(res)]).toEqual([413, "payload_too_large"]);
    expect(s.state.getSecret).toBe(0);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("413 for a streamed body over 2 MB without a length", async () => {
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
    const res = await fetch(s.base + URL_, {
      method: "POST",
      headers: JPEG_H,
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect([res.status, await err(res)]).toEqual([413, "payload_too_large"]);
    expect(s.state.fetches).toHaveLength(0);
  });

  it("400 invalid_photo for bad magic bytes and an empty body", async () => {
    const s = await start();
    for (const body of [Buffer.from("not a jpeg at all"), Buffer.alloc(0)]) {
      const res = await post(s.base, body);
      expect([res.status, await err(res)]).toEqual([400, "invalid_photo"]);
    }
    expect(s.state.fetches).toHaveLength(0);
  });

  it("invalid_photo when the client hangs up before the declared length arrived", async () => {
    const s = await start();
    const sock = net.connect(s.port, "127.0.0.1", () => {
      sock.write(
        `POST ${URL_} HTTP/1.1\r\nHost: x\r\nContent-Type: image/jpeg\r\nContent-Length: 100\r\n\r\n`,
      );
      sock.write(jpeg(10));
      setTimeout(() => sock.destroy(), 30);
    });
    sock.on("error", () => {});
    while (!s.logs.some((l) => l.event === "ai_tag")) await new Promise((r) => setTimeout(r, 10));
    expect(s.logs.find((l) => l.event === "ai_tag")?.code).toBe("invalid_photo");
    expect(s.state.fetches).toHaveLength(0);
  });
});

describe("rate limit", () => {
  it("100 pass, the 101st is 429 before getSecret; passes again 24 h later", async () => {
    let t = 1_000_000;
    const s = await start({ now: () => t });
    for (let i = 0; i < 100; i++) expect((await post(s.base)).status).toBe(200);
    expect(s.state.fetches).toHaveLength(100);
    const before = s.state.getSecret;
    const res = await post(s.base);
    expect([res.status, await err(res)]).toEqual([429, "rate_limited"]);
    expect(s.state.getSecret).toBe(before);
    expect(s.state.fetches).toHaveLength(100);
    t += 24 * 60 * 60 * 1000 + 1;
    expect((await post(s.base)).status).toBe(200);
  }, 30_000);

  it("does not block /api/ai-settings/test", async () => {
    let t = 1;
    const s = await start({ now: () => t });
    for (let i = 0; i < 101; i++) await (await post(s.base)).text();
    const res = await fetch(s.base + "/api/ai-settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
  }, 30_000);
});

describe("in-flight cap", () => {
  it("a third concurrent call gets 503 ai_busy; the counter is released afterwards", async () => {
    const release: (() => void)[] = [];
    const s = await start({
      fetch: () => new Promise<Response>((r) => release.push(() => r(toolAnswer(GOOD)))),
    });
    const a = post(s.base);
    const b = post(s.base);
    while (release.length < 2) await new Promise((r) => setTimeout(r, 5));
    const c = await post(s.base);
    expect([c.status, await err(c)]).toEqual([503, "ai_busy"]);
    expect(c.headers.get("retry-after")).toBe("5");
    release.forEach((f) => f());
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    const d = post(s.base);
    while (release.length < 3) await new Promise((r) => setTimeout(r, 5));
    release[2]();
    expect((await d).status).toBe(200);
  });

  it("is released after an error path", async () => {
    const s = await start({ fetch: () => new Response("{}", { status: 500 }) });
    for (let i = 0; i < 4; i++) expect((await post(s.base)).status).toBe(502);
  });
});

describe("client disconnect", () => {
  it("aborts the provider call and releases the counter", async () => {
    let signal: AbortSignal | undefined;
    let calls = 0;
    const s = await start({
      fetch: (_u, init) => {
        if (++calls > 1) return toolAnswer(GOOD);
        signal = init.signal as AbortSignal;
        return new Promise<Response>((_, reject) => {
          signal!.addEventListener("abort", () => reject(new Error("aborted " + SENTINEL)));
        });
      },
    });
    const ctl = new AbortController();
    const p = fetch(s.base + URL_, {
      method: "POST",
      headers: JPEG_H,
      body: jpeg(),
      signal: ctl.signal,
    }).catch(() => null);
    while (!signal) await new Promise((r) => setTimeout(r, 5));
    ctl.abort();
    await p;
    while (!signal.aborted) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 50));
    expect(s.logs.filter((l) => l.event === "ai_tag")).toHaveLength(1);
    expect(JSON.stringify(s.logs)).not.toContain(SENTINEL);
    // The counter is back to 0: two more calls pass.
    expect((await post(s.base)).status).toBe(200);
    expect((await post(s.base)).status).toBe(200);
  });
});

describe("method and origin", () => {
  it("405, 403 and 404", async () => {
    const s = await start();
    const get = await fetch(s.base + URL_);
    expect([get.status, get.headers.get("allow")]).toEqual([405, "POST"]);
    const x = await post(s.base, jpeg(), { ...JPEG_H, "Sec-Fetch-Site": "cross-site" });
    expect([x.status, await err(x)]).toEqual([403, "forbidden_origin"]);
    expect((await fetch(s.base + URL_ + "/x", { method: "POST" })).status).toBe(404);
    expect((await fetch(s.base + "/api/ai", { method: "POST" })).status).toBe(404);
  });
});

describe("secrets and logs", () => {
  it("the sentinel never leaves the server", async () => {
    const cases: Fetch[] = [
      () => toolAnswer(GOOD),
      () => new Response(`{"echo":"${SENTINEL}"}`, { status: 401 }),
      () => {
        throw new TypeError("fetch failed " + SENTINEL);
      },
    ];
    for (const f of cases) {
      const image = jpeg(40);
      const s = await start({ fetch: f });
      const res = await post(s.base, image);
      const text = await res.text();
      const headers = JSON.stringify([...res.headers]);
      expect(text + headers + JSON.stringify(s.logs)).not.toContain(SENTINEL);
      expect(s.state.fetches).toHaveLength(1);
      const { init } = s.state.fetches[0];
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe(SENTINEL);
      const b64 = image.toString("base64");
      expect(text + JSON.stringify(s.logs)).not.toContain(b64);
      expect(String(init.body)).toContain(b64);
    }
  });

  it("ai_tag logs have fixed fields only", async () => {
    const s = await start();
    await (await post(s.base)).text();
    await (await post(s.base, Buffer.from("junk"))).text();
    const tags = s.logs.filter((l) => l.event === "ai_tag");
    expect(tags).toHaveLength(2);
    for (const l of tags) {
      expect(Object.keys(l).sort()).toEqual(["code", "event", "id", "ms"]);
      expect(typeof l.ms).toBe("number");
      expect(l.ms as number).toBeGreaterThanOrEqual(0);
    }
    expect(tags.map((l) => l.code)).toEqual(["ok", "invalid_photo"]);
    expect(JSON.stringify(s.logs)).not.toContain("Áo sơ mi");
  });
});
