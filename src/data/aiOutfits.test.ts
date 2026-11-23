import { describe, expect, it, vi } from "vitest";

import { createHttpAiOutfits, type AiSuggestInput } from "./aiOutfits";
import { AiSettingsError } from "./aiSettings";
import type { AuthOptions } from "./authFetch";

const OUTFITS = [
  { itemIds: ["a", "b"], reason: "Hợp trời nóng" },
  { itemIds: ["c"], reason: "Chưa mặc lần nào" },
];
const INPUT: AiSuggestInput = {
  candidateIds: ["a", "b", "c"],
  season: "winter",
  weather: { cold: true, hot: false, rain: false },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const make = (res: () => Response | Promise<Response>, auth?: AuthOptions) => {
  const fetchFn = vi.fn(async (..._a: unknown[]) => res());
  return {
    fetchFn,
    client: createHttpAiOutfits(fetchFn as unknown as typeof fetch, undefined, auth),
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
const bodyOf = (fetchFn: ReturnType<typeof make>["fetchFn"]) =>
  JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);

it("season only accepts DB ids", () => {
  // @ts-expect-error a label is not a DbSeason
  const bad: AiSuggestInput["season"] = "Đông";
  expect(bad).toBe("Đông");
});

describe("createHttpAiOutfits", () => {
  it("posts JSON to /api/ai/suggest-outfits", async () => {
    const { fetchFn, client } = make(() => json({ outfits: OUTFITS }));
    const ctl = new AbortController();
    await client.suggest(INPUT, ctl.signal);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai/suggest-outfits");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(init.redirect).toBe("manual");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(ctl.signal);
    expect(JSON.parse(init.body as string)).toEqual({
      candidateIds: ["a", "b", "c"],
      season: "winter",
      weather: { cold: true, hot: false, rain: false },
    });
  });

  it("sends avoidIds only when non-empty", async () => {
    for (const avoidIds of [[], undefined]) {
      const { fetchFn, client } = make(() => json({ outfits: [] }));
      await client.suggest({ ...INPUT, avoidIds });
      expect(bodyOf(fetchFn)).not.toHaveProperty("avoidIds");
    }
    const { fetchFn, client } = make(() => json({ outfits: [] }));
    await client.suggest({ ...INPUT, avoidIds: ["u1"] });
    expect(bodyOf(fetchFn).avoidIds).toEqual(["u1"]);
  });

  it("adds the bearer token", async () => {
    const { fetchFn, client } = make(() => json({ outfits: [] }), { getToken: async () => "t1" });
    await client.suggest(INPUT);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer t1" });
  });

  it("returns the outfits", async () => {
    const { client } = make(() => json({ outfits: OUTFITS }));
    expect(await client.suggest(INPUT)).toEqual({ outfits: OUTFITS });
  });

  it("drops malformed entries", async () => {
    const good = { itemIds: ["a"], reason: "ok" };
    const { client } = make(() =>
      json({
        outfits: [
          null,
          "x",
          { itemIds: "a", reason: "r" },
          { itemIds: ["a", 5], reason: "r" },
          { itemIds: ["a"] },
          good,
        ],
      }),
    );
    expect(await client.suggest(INPUT)).toEqual({ outfits: [good] });
  });

  it("malformed 200 -> internal", async () => {
    for (const body of [{}, { outfits: "x" }, null]) {
      const { client } = make(() => json(body));
      expect((await failure(client.suggest(INPUT))).code).toBe("internal");
    }
  });

  it("non-JSON body -> internal", async () => {
    for (const status of [200, 502]) {
      const { client } = make(() => new Response("<html>", { status }));
      const e = await failure(client.suggest(INPUT));
      expect([e.status, e.code]).toEqual([status, "internal"]);
    }
  });

  it.each([
    [429, "rate_limited"],
    [503, "ai_busy"],
    [409, "not_configured"],
    [502, "provider_bad_response"],
    [408, "request_timeout"],
  ])("maps server error codes: %i %s", async (status, code) => {
    const { client } = make(() => json({ error: { code } }, status));
    const e = await failure(client.suggest(INPUT));
    expect([e.status, e.code]).toEqual([status, code]);
  });

  it("unknown code -> internal, request id kept", async () => {
    const { client } = make(() => json({ error: { code: "zzz", requestId: "r1" } }, 500));
    const e = await failure(client.suggest(INPUT));
    expect([e.status, e.code, e.requestId]).toEqual([500, "internal", "r1"]);
  });

  it("network rejection -> network", async () => {
    const { client } = make(() => Promise.reject(new TypeError("down")));
    expect((await failure(client.suggest(INPUT))).code).toBe("network");
  });

  it("401 twice -> unauthorized and onAuthLost", async () => {
    const onAuthLost = vi.fn();
    const { client } = make(() => json({}, 401), { getToken: async () => "t", onAuthLost });
    const e = await failure(client.suggest(INPUT));
    expect([e.status, e.code]).toEqual([401, "unauthorized"]);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it("aborted signal rejects with the abort error, not network", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { client } = make(() => Promise.reject(new DOMException("aborted", "AbortError")));
    const e = await client.suggest(INPUT, ctl.signal).then(
      () => null,
      (x) => x,
    );
    expect(e).not.toBeInstanceOf(AiSettingsError);
    expect((e as Error).name).toBe("AbortError");
  });
});
