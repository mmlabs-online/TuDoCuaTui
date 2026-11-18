// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEATHER_PLACES as CLIENT_PLACES } from "../src/constants/weather.ts";
import { createApp } from "./app.js";
import { fixedAuth, headerAuth, OWNER_A } from "./test/auth.js";
import { createWeatherService, parseForecast, WEATHER_PLACES } from "./weather.js";

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => {
      s.closeAllConnections();
      return new Promise((r) => s.close(r));
    }),
  );
});

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 18, 3);
const forecast = (over: Record<string, unknown> = {}) => ({
  daily: {
    time: ["2026-11-18"],
    temperature_2m_min: [18.2],
    temperature_2m_max: [23.9],
    precipitation_probability_max: [70],
    ...over,
  },
});
const ok = (body: unknown = forecast(), status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

type Fake = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
const fakeFetch = (impl: (n: number) => Response | Promise<Response> = () => ok()): Fake => {
  let n = 0;
  return vi.fn(async () => impl(++n));
};

async function start(fetchFn: Fake, over: Partial<Parameters<typeof createApp>[0]> = {}) {
  const logs: Record<string, unknown>[] = [];
  const clock = { t: T0 };
  const server = http.createServer(
    createApp({
      pool: null,
      distDir: "/nonexistent",
      auth: fixedAuth(OWNER_A),
      log: (e) => logs.push(e),
      now: () => clock.t,
      weatherFetch: fetchFn as unknown as typeof fetch,
      ...over,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (q: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/weather${q}`, { headers });
  return { base, logs, clock, get };
}

describe("GET /api/weather validation", () => {
  it("400 for missing, unknown, repeated or prototype-key place; provider not called", async () => {
    const f = fakeFetch();
    const { get } = await start(f);
    for (const q of [
      "",
      "?place=",
      "?place=paris",
      "?place=ha-noi&place=hue",
      "?place=__proto__",
      "?place=constructor",
      "?place=HA-NOI",
    ]) {
      const res = await get(q);
      expect(res.status, q).toBe(400);
      expect(await res.json()).toEqual({ error: { code: "invalid_input", field: "place" } });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("405 for non-GET", async () => {
    const { base } = await start(fakeFetch());
    const res = await fetch(`${base}/api/weather?place=ha-noi`, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });
});

describe("GET /api/weather provider call", () => {
  it("calls api.open-meteo.com with the place's coordinates and fixed params", async () => {
    const f = fakeFetch();
    const { get } = await start(f);
    await get("?place=da-lat");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.host).toBe("api.open-meteo.com");
    expect(u.pathname).toBe("/v1/forecast");
    expect(u.searchParams.get("latitude")).toBe(String(WEATHER_PLACES.get("da-lat")!.lat));
    expect(u.searchParams.get("longitude")).toBe(String(WEATHER_PLACES.get("da-lat")!.lon));
    expect(u.searchParams.get("daily")).toBe(
      "temperature_2m_min,temperature_2m_max,precipitation_probability_max",
    );
    expect(u.searchParams.get("timezone")).toBe("Asia/Ho_Chi_Minh");
    expect(u.searchParams.get("forecast_days")).toBe("1");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(init.headers ?? {}).toLowerCase()).not.toMatch(/cookie|authorization/);
  });

  it("200 returns the weather shape", async () => {
    const { get } = await start(fakeFetch());
    const res = await get("?place=ha-noi");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      weather: { place: "ha-noi", date: "2026-11-18", minC: 18.2, maxC: 23.9, rainChance: 70 },
    });
  });

  it("null rain chance is accepted", async () => {
    const { get } = await start(
      fakeFetch(() => ok(forecast({ precipitation_probability_max: [null] }))),
    );
    const res = await get("?place=ha-noi");
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).weather.rainChance).toBeNull();
  });

  it("502 weather_unavailable on non-2xx, bad JSON, oversized body, missing or out-of-range fields", async () => {
    const bad: [string, () => Response][] = [
      ["500", () => ok("{}", 500)],
      ["html", () => ok("<html>")],
      ["oversized", () => ok(`{"pad":"${"x".repeat(40 * 1024)}"}`)],
      ["no daily", () => ok({})],
      ["empty arrays", () => ok(forecast({ temperature_2m_min: [], temperature_2m_max: [] }))],
      ["string max", () => ok(forecast({ temperature_2m_max: ["20"] }))],
      ["min 99", () => ok(forecast({ temperature_2m_min: [99], temperature_2m_max: [99] }))],
      ["min > max", () => ok(forecast({ temperature_2m_min: [30], temperature_2m_max: [20] }))],
      ["rain 101", () => ok(forecast({ precipitation_probability_max: [101] }))],
      ["rain -1", () => ok(forecast({ precipitation_probability_max: [-1] }))],
      ["bad date", () => ok(forecast({ time: ["18/11"] }))],
    ];
    for (const [name, make] of bad) {
      const { get } = await start(fakeFetch(make));
      const res = await get("?place=ha-noi");
      expect(res.status, name).toBe(502);
      expect(await res.json(), name).toEqual({ error: { code: "weather_unavailable" } });
    }
  });

  it("504 weather_unavailable on timeout, 502 on a network error", async () => {
    const waiting = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        }),
    );
    const slow = createWeatherService({ fetch: waiting as unknown as typeof fetch, timeoutMs: 50 });
    expect(await slow.get("ha-noi")).toMatchObject({ ok: false, status: 504 });
    const down = createWeatherService({
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    expect(await down.get("ha-noi")).toMatchObject({ ok: false, status: 502 });
  });
});

describe("GET /api/weather cache", () => {
  it("second call within TTL hits the cache", async () => {
    const f = fakeFetch();
    const { get } = await start(f);
    await get("?place=ha-noi");
    await get("?place=ha-noi");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL", async () => {
    const f = fakeFetch();
    const { get, clock } = await start(f);
    await get("?place=ha-noi");
    clock.t += HOUR + 1;
    await get("?place=ha-noi");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("refetches on a new VN day", async () => {
    const f = fakeFetch();
    const { get, clock } = await start(f);
    clock.t = Date.UTC(2026, 10, 18, 16, 59);
    await get("?place=ha-noi");
    clock.t = Date.UTC(2026, 10, 18, 17, 0);
    await get("?place=ha-noi");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("concurrent calls share one provider fetch", async () => {
    let release!: (r: Response) => void;
    const f = vi.fn(() => new Promise<Response>((r) => (release = r))) as unknown as Fake;
    const { get } = await start(f);
    const calls = [get("?place=hue"), get("?place=hue"), get("?place=hue")];
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    release(ok());
    const res = await Promise.all(calls);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a failure is cached for 5 minutes, then retried", async () => {
    const f = fakeFetch((n) => (n === 1 ? ok("{}", 500) : ok()));
    const { get, clock } = await start(f);
    expect((await get("?place=ha-noi")).status).toBe(502);
    clock.t += 5 * 60_000 - 1;
    expect((await get("?place=ha-noi")).status).toBe(502);
    expect(f).toHaveBeenCalledTimes(1);
    clock.t += 2;
    expect((await get("?place=ha-noi")).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/weather limits and logs", () => {
  it("61st call in an hour is 429 for that user only", async () => {
    const { get } = await start(fakeFetch(), { auth: headerAuth() });
    for (let i = 0; i < 60; i++) expect((await get("?place=ha-noi")).status).toBe(200);
    const res = await get("?place=ha-noi");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "rate_limited" } });
    expect((await get("?place=ha-noi", { "x-test-user": "b" })).status).toBe(200);
  });

  it("logs fixed fields only", async () => {
    const f = fakeFetch((n) => (n === 1 ? ok() : ok("{}", 500)));
    const { get, logs } = await start(f);
    await get("?place=ha-noi");
    await get("?place=hue");
    await get("?place=paris");
    const entries = logs.filter((l) => l.event === "weather");
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(
        Object.keys(e).every((k) => ["event", "id", "place", "code", "cached"].includes(k)),
      ).toBe(true);
    }
    const text = JSON.stringify(entries);
    expect(text).not.toMatch(/open-meteo|latitude|21\.03/);
  });
});

describe("places", () => {
  it("client and server place ids match", () => {
    expect([...WEATHER_PLACES.keys()]).toEqual(CLIENT_PLACES.map((p) => p.id));
    expect(WEATHER_PLACES.size).toBe(15);
    for (const [id, { lat, lon }] of WEATHER_PLACES) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(lat).toBeGreaterThan(8);
      expect(lat).toBeLessThan(24);
      expect(lon).toBeGreaterThan(102);
      expect(lon).toBeLessThan(110);
    }
  });

  it("parseForecast keeps a valid day", () => {
    expect(parseForecast(forecast())).toEqual({
      date: "2026-11-18",
      minC: 18.2,
      maxC: 23.9,
      rainChance: 70,
    });
  });
});
