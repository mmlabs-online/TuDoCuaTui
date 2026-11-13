// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CLAUDE_MODELS_URL, checkClaudeKey } from "./claude.js";

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
