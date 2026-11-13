import { describe, expect, it, vi } from "vitest";

import { AiSettingsError, createHttpAiSettings, localAiSettings } from "./aiSettings";

const VIEW = {
  provider: "claude",
  model: "claude-haiku-5-5",
  keyHint: "••••wxyz",
  hasKey: true,
  modelSupported: true,
  updatedAt: "2026-11-13T00:00:00Z",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const make = (res: () => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async () => res());
  return { fetchFn, client: createHttpAiSettings(fetchFn as unknown as typeof fetch) };
};
const codeOf = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(AiSettingsError);
  return e as AiSettingsError;
};

describe("createHttpAiSettings", () => {
  it("get returns the view and null", async () => {
    expect(await make(() => json({ settings: VIEW })).client.get()).toEqual(VIEW);
    expect(await make(() => json({ settings: null })).client.get()).toBeNull();
  });

  it("save sends apiKey only when given, with the request options", async () => {
    const { fetchFn, client } = make(() => json({ settings: VIEW }));
    await client.save({ provider: "claude", model: "m" });
    await client.save({ provider: "claude", model: "m", apiKey: "k".repeat(20) });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ai-settings");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ provider: "claude", model: "m" }));
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init).toMatchObject({
      redirect: "manual",
      credentials: "same-origin",
      cache: "no-store",
    });
    const second = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(second[1].body as string)).toEqual({
      provider: "claude",
      model: "m",
      apiKey: "k".repeat(20),
    });
  });

  it("deleteKey and test use the right method, path and body", async () => {
    const del = make(() => json({ settings: null }));
    await del.client.deleteKey();
    expect(del.fetchFn.mock.calls[0]).toMatchObject(["/api/ai-settings/key", { method: "DELETE" }]);
    const t = make(() => json({ ok: true }));
    await t.client.test();
    expect(t.fetchFn.mock.calls[0]).toMatchObject([
      "/api/ai-settings/test",
      { method: "POST", body: "{}" },
    ]);
  });

  it("maps a thrown fetch to network", async () => {
    const e = await codeOf(make(() => Promise.reject(new TypeError("x"))).client.get());
    expect([e.code, e.status]).toEqual(["network", 0]);
  });

  it("maps an opaque redirect to unauthorized", async () => {
    const res = { type: "opaqueredirect", status: 0, ok: false } as unknown as Response;
    expect((await codeOf(make(() => res).client.get())).code).toBe("unauthorized");
  });

  it("maps server error codes and keeps the requestId", async () => {
    const a = await codeOf(make(() => json({ error: { code: "invalid_key" } }, 422)).client.test());
    expect([a.code, a.status]).toEqual(["invalid_key", 422]);
    const b = await codeOf(
      make(() => json({ error: { code: "internal", requestId: "r1" } }, 500)).client.get(),
    );
    expect(b.requestId).toBe("r1");
  });

  it("maps unknown codes, non-JSON and malformed 200 to internal", async () => {
    for (const res of [
      () => json({ error: { code: "conflict" } }, 409),
      () => json({ error: { code: "not_found" } }, 404),
      () => new Response("<html>", { status: 502 }),
      () => json({}),
    ]) {
      expect((await codeOf(make(res).client.get())).code).toBe("internal");
    }
    expect((await codeOf(make(() => json({ ok: false })).client.test())).code).toBe("internal");
  });

  it("never writes to localStorage or sessionStorage", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    await make(() => json({ settings: VIEW })).client.save({
      provider: "claude",
      model: "m",
      apiKey: "k".repeat(20),
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("localAiSettings", () => {
  it("rejects every call with not_available and never fetches", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const p of [
      localAiSettings.get(),
      localAiSettings.save({ provider: "claude", model: "m" }),
      localAiSettings.deleteKey(),
      localAiSettings.test(),
    ]) {
      expect((await codeOf(p)).code).toBe("not_available");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
