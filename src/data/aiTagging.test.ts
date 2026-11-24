import { describe, expect, it, vi } from "vitest";

import { AiSettingsError } from "./aiSettings";
import { createHttpAiTagger } from "./aiTagging";
import type { AuthOptions } from "./authFetch";

const SUGGESTION = {
  name: "Áo sơ mi trắng",
  category: "top",
  colors: ["trang"],
  seasons: ["summer"],
  material: null,
  brand: null,
  tags: ["đi làm"],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const make = (res: () => Response | Promise<Response>, auth?: AuthOptions) => {
  const fetchFn = vi.fn(async (..._a: unknown[]) => res());
  return {
    fetchFn,
    tagger: createHttpAiTagger(fetchFn as unknown as typeof fetch, undefined, auth),
  };
};
const failure = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(AiSettingsError);
  return e as AiSettingsError;
};
const blob = () => new Blob(["jpeg"], { type: "image/jpeg" });

describe("createHttpAiTagger", () => {
  it("posts the blob to /api/ai/tag-photo", async () => {
    const { fetchFn, tagger } = make(() => json({ suggestion: SUGGESTION }));
    const image = blob();
    const ctl = new AbortController();
    await tagger.tag(image, ctl.signal);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai/tag-photo");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "image/jpeg",
      Accept: "application/json",
    });
    expect(init.body).toBe(image);
    expect(init.redirect).toBe("manual");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(ctl.signal);
  });

  it("sends Idempotency-Key: the given opKey, else a fresh UUID per call", async () => {
    const { fetchFn, tagger } = make(() => json({ suggestion: SUGGESTION }));
    await tagger.tag(blob(), undefined, "op-123");
    await tagger.tag(blob());
    await tagger.tag(blob());
    const keys = fetchFn.mock.calls.map(
      (c) =>
        ((c as unknown[])[1] as RequestInit & { headers: Record<string, string> }).headers[
          "Idempotency-Key"
        ],
    );
    expect(keys[0]).toBe("op-123");
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).not.toBe(keys[2]);
  });

  it.each([
    [402, "credits_exhausted"],
    [402, "welcome_pending"],
    [503, "ai_cap_reached"],
  ])("maps %i %s to AiSettingsError", async (status, code) => {
    const { tagger } = make(() => json({ error: { code } }, status));
    const e = await failure(tagger.tag(blob()));
    expect([e.status, e.code]).toEqual([status, code]);
  });

  it("returns the suggestion", async () => {
    const { tagger } = make(() => json({ suggestion: SUGGESTION }));
    expect(await tagger.tag(blob())).toEqual(SUGGESTION);
  });

  it("malformed 200 -> internal", async () => {
    const bodies: (() => Response)[] = [
      () => new Response("nope", { status: 200 }),
      () => json({}),
      () => json({ suggestion: null }),
      () => json({ suggestion: [] }),
      () => json({ suggestion: { ...SUGGESTION, colors: "trang" } }),
    ];
    for (const body of bodies) {
      const { tagger } = make(body);
      expect((await failure(tagger.tag(blob()))).code).toBe("internal");
    }
  });

  it("normalises wrong-typed single fields", async () => {
    const { tagger } = make(() =>
      json({ suggestion: { ...SUGGESTION, name: 5, brand: {}, tags: [1, "x"] } }),
    );
    const s = await tagger.tag(blob());
    expect(s.name).toBeNull();
    expect(s.brand).toBeNull();
    expect(s.tags).toEqual(["x"]);
  });

  it("maps every server error code", async () => {
    const cases: [number, string][] = [
      [409, "not_configured"],
      [422, "invalid_key"],
      [422, "key_forbidden"],
      [400, "invalid_model"],
      [409, "key_unreadable"],
      [429, "rate_limited"],
      [429, "provider_rate_limited"],
      [502, "provider_unavailable"],
      [502, "provider_bad_response"],
      [400, "invalid_photo"],
      [415, "unsupported_media_type"],
      [413, "payload_too_large"],
      [408, "request_timeout"],
      [503, "ai_busy"],
      [503, "server_misconfigured"],
      [503, "db_unavailable"],
    ];
    for (const [status, code] of cases) {
      const { tagger } = make(() => json({ error: { code } }, status));
      const e = await failure(tagger.tag(blob()));
      expect([e.status, e.code]).toEqual([status, code]);
    }
  });

  it("unknown code -> internal, request id kept", async () => {
    const { tagger } = make(() => json({ error: { code: "zzz", requestId: "r1" } }, 500));
    const e = await failure(tagger.tag(blob()));
    expect([e.status, e.code, e.requestId]).toEqual([500, "internal", "r1"]);
  });

  it("non-JSON error body -> internal", async () => {
    const { tagger } = make(() => new Response("<html>", { status: 502 }));
    expect((await failure(tagger.tag(blob()))).code).toBe("internal");
  });

  describe("auth", () => {
    it("adds the bearer and retries a 401 once with the refreshed token", async () => {
      const getToken = vi.fn(async (rejected?: string) => (rejected ? "t2" : "t1"));
      let n = 0;
      const { fetchFn, tagger } = make(
        () => (++n === 1 ? json({}, 401) : json({ suggestion: SUGGESTION })),
        { getToken },
      );
      const image = blob();
      await tagger.tag(image);
      const calls = fetchFn.mock.calls as [string, RequestInit][];
      expect(calls).toHaveLength(2);
      expect(calls[0][1].headers).toMatchObject({ Authorization: "Bearer t1" });
      expect(calls[1][1].headers).toMatchObject({ Authorization: "Bearer t2" });
      expect(calls[1][1].body).toBe(image);
    });

    it("401 twice -> onAuthLost and unauthorized", async () => {
      const onAuthLost = vi.fn();
      const { tagger } = make(() => json({}, 401), { getToken: async () => "t", onAuthLost });
      const e = await failure(tagger.tag(blob()));
      expect([e.status, e.code]).toEqual([401, "unauthorized"]);
      expect(onAuthLost).toHaveBeenCalledTimes(1);
    });
  });

  it("a network rejection -> network", async () => {
    const { tagger } = make(() => Promise.reject(new TypeError("down")));
    expect((await failure(tagger.tag(blob()))).code).toBe("network");
  });

  it("an aborted signal rejects with the abort error, not network", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { tagger } = make(() => Promise.reject(new DOMException("aborted", "AbortError")));
    const e = await tagger.tag(blob(), ctl.signal).then(
      () => null,
      (x) => x,
    );
    expect(e).not.toBeInstanceOf(AiSettingsError);
    expect((e as Error).name).toBe("AbortError");
  });
});
