import { describe, expect, it, vi } from "vitest";

import { createHttpWeather, WeatherError } from "./weather";

const W = { place: "ha-noi", date: "2026-11-18", minC: 18.2, maxC: 23.9, rainChance: 70 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const make = (res: () => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async () => res());
  return { fetchFn, client: createHttpWeather(fetchFn as unknown as typeof fetch) };
};
const failure = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(WeatherError);
  return e as WeatherError;
};

describe("createHttpWeather", () => {
  it("today calls /api/weather with the place and request options", async () => {
    const { fetchFn, client } = make(() => json({ weather: W }));
    await client.today("ha-noi");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/weather?place=ha-noi");
    expect(init).toMatchObject({
      redirect: "manual",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  });

  it("returns the parsed weather", async () => {
    expect(await make(() => json({ weather: W })).client.today("ha-noi")).toEqual(W);
    const nul = { ...W, rainChance: null };
    expect(await make(() => json({ weather: nul })).client.today("ha-noi")).toEqual(nul);
  });

  it("maps a thrown fetch / non-ok / bad shape to WeatherError", async () => {
    const thrown = make(() => {
      throw new TypeError("offline");
    });
    expect((await failure(thrown.client.today("ha-noi"))).status).toBe(0);
    const bad = make(() => json({ error: { code: "weather_unavailable" } }, 502));
    expect((await failure(bad.client.today("ha-noi"))).status).toBe(502);
    const shape = make(() => json({ weather: { ...W, maxC: "x" } }));
    await failure(shape.client.today("ha-noi"));
    const none = make(() => new Response("<html>", { status: 200 }));
    await failure(none.client.today("ha-noi"));
    const opaque = make(() => ({ ok: false, status: 0, type: "opaqueredirect" }) as Response);
    expect((await failure(opaque.client.today("ha-noi"))).status).toBe(0);
  });
});
