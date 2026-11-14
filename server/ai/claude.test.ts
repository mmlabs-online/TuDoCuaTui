// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CLAUDE_MODELS_URL, checkClaudeKey, tagPhotoWithClaude } from "./claude.js";
import { TAG_INSTRUCTION, buildTagSchema } from "./tagging.js";

const SENTINEL = "sk-ant-SENTINEL-0123456789abcdef";
const fetchOf = (f: (url: string, init: RequestInit) => Promise<unknown>) =>
  vi.fn(f) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;

/** A response whose body readers throw: proves only the status is read. */
function guarded(status: number) {
  const cancel = vi.fn(async () => {});
  const boom = () => {
    throw new Error("body read");
  };
  const res = {
    ok: status >= 200 && status < 300,
    status,
    body: { cancel },
    json: boom,
    text: boom,
    arrayBuffer: boom,
  };
  return { res, cancel };
}

describe("checkClaudeKey", () => {
  it("sends the key only in x-api-key to the pinned URL", async () => {
    const f = fetchOf(async () => guarded(200).res);
    await checkClaudeKey({ fetch: f, key: SENTINEL, model: "claude-haiku-5-5" });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.anthropic.com/v1/models/claude-haiku-5-5");
    expect(CLAUDE_MODELS_URL).toBe("https://api.anthropic.com/v1/models/");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "x-api-key": SENTINEL, "anthropic-version": "2023-06-01" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect("body" in init).toBe(false);
    const { headers, ...rest } = init;
    expect(JSON.stringify([url, rest])).not.toContain(SENTINEL);
    expect(headers).toBeDefined();
  });

  it("model id is URL-encoded", async () => {
    const f = fetchOf(async () => guarded(200).res);
    await checkClaudeKey({ fetch: f, key: SENTINEL, model: "a/b" });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      CLAUDE_MODELS_URL + "a%2Fb",
    );
  });

  it("200 -> ok; non-2xx -> mapped code", async () => {
    const cases: [number, unknown][] = [
      [200, { ok: true }],
      [401, { ok: false, code: "invalid_key" }],
      [403, { ok: false, code: "key_forbidden" }],
      [404, { ok: false, code: "model_unavailable" }],
      [429, { ok: false, code: "provider_rate_limited" }],
      [500, { ok: false, code: "provider_unavailable" }],
    ];
    for (const [status, want] of cases) {
      const f = fetchOf(async () => guarded(status).res);
      expect(await checkClaudeKey({ fetch: f, key: SENTINEL, model: "m" })).toEqual(want);
    }
  });

  it("reads only the status and cancels the body", async () => {
    for (const status of [200, 401]) {
      const g = guarded(status);
      const f = fetchOf(async () => g.res);
      const r = await checkClaudeKey({ fetch: f, key: SENTINEL, model: "m" });
      expect(g.cancel).toHaveBeenCalledTimes(1);
      expect(Object.keys(r).sort()).toEqual(status === 200 ? ["ok"] : ["code", "ok"]);
      expect(JSON.stringify(r)).not.toContain(SENTINEL);
    }
  });

  it("network error, redirect error and timeout -> provider_unavailable", async () => {
    const unavailable = { ok: false, code: "provider_unavailable" };
    const net = fetchOf(async () => {
      throw new TypeError("fetch failed: " + SENTINEL);
    });
    const r = await checkClaudeKey({ fetch: net, key: SENTINEL, model: "m" });
    expect(r).toEqual(unavailable);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    const abort = fetchOf(async () => {
      throw new DOMException("t", "TimeoutError");
    });
    expect(await checkClaudeKey({ fetch: abort, key: SENTINEL, model: "m" })).toEqual(unavailable);
    const hang = fetchOf(
      (_url, init) =>
        new Promise((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    expect(await checkClaudeKey({ fetch: hang, key: SENTINEL, model: "m", timeoutMs: 20 })).toEqual(
      unavailable,
    );
  });
});

describe("tagPhotoWithClaude", () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const toolInput = { name: "Áo", category: "top" };
  const good = {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "tag_item", input: toolInput }],
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const run = (f: ReturnType<typeof fetchOf>, extra: object = {}) =>
    tagPhotoWithClaude({ fetch: f, key: SENTINEL, model: "claude-haiku-5-5", image, ...extra });
  const callOf = (f: ReturnType<typeof fetchOf>) =>
    (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it("tag: key only in x-api-key to the pinned URL", async () => {
    const f = fetchOf(async () => json(good));
    await run(f);
    const [url, init] = callOf(f);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({
      "x-api-key": SENTINEL,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(url).not.toContain(SENTINEL);
    expect(init.body as string).not.toContain(SENTINEL);
  });

  it("tag: request body shape", async () => {
    const f = fetchOf(async () => json(good));
    await run(f);
    const body = JSON.parse(callOf(f)[1].body as string);
    expect(Object.keys(body).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "tool_choice",
      "tools",
    ]);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(1024);
    const [img, txt] = body.messages[0].content;
    expect(body.messages).toHaveLength(1);
    expect(img.source.media_type).toBe("image/jpeg");
    expect(Buffer.from(img.source.data, "base64").equals(image)).toBe(true);
    expect(txt).toEqual({ type: "text", text: TAG_INSTRUCTION });
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("tag_item");
    expect(body.tools[0].input_schema).toEqual(JSON.parse(JSON.stringify(buildTagSchema())));
    expect(body.tool_choice).toEqual({ type: "tool", name: "tag_item" });
  });

  it("tag: success returns raw tool input", async () => {
    expect(await run(fetchOf(async () => json(good)))).toEqual({ ok: true, input: toolInput });
  });

  it("tag: bad responses -> provider_bad_response", async () => {
    const tu = { type: "tool_use", name: "tag_item", input: {} };
    const bad: Response[] = [
      json({ stop_reason: "tool_use", content: [{ type: "text", text: "hi" }] }),
      json({ ...good, stop_reason: "max_tokens" }),
      json({ ...good, stop_reason: "refusal" }),
      json({ stop_reason: "tool_use", content: [tu, tu] }),
      json({ stop_reason: "tool_use", content: [{ ...tu, name: "other" }] }),
      json({ stop_reason: "tool_use", content: [{ ...tu, input: "x" }] }),
      json({ stop_reason: "tool_use", content: [{ ...tu, input: [] }] }),
      new Response("not json"),
      json({ stop_reason: "tool_use" }),
      json(null),
    ];
    for (const res of bad) {
      expect(await run(fetchOf(async () => res))).toEqual({
        ok: false,
        code: "provider_bad_response",
      });
    }
  });

  it("tag: body over 64 KB is cancelled, not buffered", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(16 * 1024));
      },
      cancel,
    });
    const r = await run(fetchOf(async () => new Response(stream)));
    expect(r).toEqual({ ok: false, code: "provider_bad_response" });
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(10);
  });

  it("tag: HTTP errors", async () => {
    const cases: [number, string][] = [
      [401, "invalid_key"],
      [403, "key_forbidden"],
      [404, "model_unavailable"],
      [429, "provider_rate_limited"],
      [400, "provider_unavailable"],
      [500, "provider_unavailable"],
      [529, "provider_unavailable"],
    ];
    for (const [status, code] of cases) {
      const g = guarded(status);
      const r = await run(fetchOf(async () => g.res));
      expect(r).toEqual({ ok: false, code });
      expect(g.cancel).toHaveBeenCalledTimes(1);
    }
  });

  it("tag: timeout, network, abort", async () => {
    const unavailable = { ok: false, code: "provider_unavailable" };
    const hang = () =>
      fetchOf(
        (_url, init) =>
          new Promise((_, reject) => {
            init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
          }),
      );
    expect(await run(hang(), { timeoutMs: 20 })).toEqual(unavailable);
    const net = fetchOf(async () => {
      throw new TypeError("fetch failed " + SENTINEL);
    });
    const r = await run(net);
    expect(r).toEqual(unavailable);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    const ctl = new AbortController();
    const h = hang();
    const p = run(h, { signal: ctl.signal });
    ctl.abort();
    expect(await p).toEqual(unavailable);
    expect(callOf(h)[1].signal!.aborted).toBe(true);
  });
});
