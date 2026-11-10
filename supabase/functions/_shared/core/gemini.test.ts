// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { testGeminiKey } from "./gemini";

const KEY = "AIza-test-key-0123456789";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("testGeminiKey", () => {
  it("sends the key in a header, never in the URL", async () => {
    const f = vi.fn(async () => json(200, {}));
    expect(await testGeminiKey(f as unknown as typeof fetch, KEY, "m-1")).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect(url.endsWith("/models/m-1")).toBe(true);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
  });

  it("maps error statuses and the invalid-key reason", async () => {
    const run = (res: Response) => testGeminiKey((async () => res) as typeof fetch, KEY, "m");
    expect(await run(json(404, {}))).toEqual({ ok: false, code: "model_unavailable", status: 404 });
    expect(await run(json(429, {}))).toMatchObject({ code: "provider_rate_limited" });
    expect(await run(json(500, { not: "json-error" }))).toMatchObject({
      code: "provider_unavailable",
    });
    expect(
      await run(json(400, { error: { details: [{ reason: "API_KEY_INVALID" }] } })),
    ).toMatchObject({
      code: "invalid_key",
    });
    expect(await run(new Response("not json", { status: 403 }))).toMatchObject({
      code: "key_forbidden",
    });
  });

  it("maps a thrown fetch to provider_unavailable", async () => {
    const f = (async () => {
      throw new Error("boom " + KEY);
    }) as typeof fetch;
    expect(await testGeminiKey(f, KEY, "m")).toEqual({ ok: false, code: "provider_unavailable" });
  });

  it("aborts after the timeout", async () => {
    const f = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(new Error("aborted")));
      })) as unknown as typeof fetch;
    expect(await testGeminiKey(f, KEY, "m", 10)).toEqual({
      ok: false,
      code: "provider_unavailable",
    });
  });
});
