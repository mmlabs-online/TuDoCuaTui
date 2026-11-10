// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { importKek, sealKey } from "./crypto";
import { LIMITS } from "./rateLimit";
import { handleSettingsRequest, type HandlerDeps, type LogEntry } from "./settingsHandler";
import type { AiStore, SecretRow } from "./store";

const UID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "good-token";
const API_KEY = "sk-ant-test-0123456789ABCDEF";
const KEK = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const ORIGIN = "https://app.example";
const NOW = new Date("2026-11-10T12:00:00.000Z");

function memStore(initial?: SecretRow & { updatedAt?: string }, used = 0) {
  let row: (SecretRow & { updatedAt: string }) | null = initial
    ? { updatedAt: "2026-11-09T00:00:00.000Z", ...initial }
    : null;
  const store = {
    getView: vi.fn(async () =>
      row
        ? {
            provider: row.provider,
            model: row.model,
            keyHint: row.keyHint,
            updatedAt: row.updatedAt,
          }
        : null,
    ),
    getSecret: vi.fn(async () => (row ? { ...row } : null)),
    upsert: vi.fn(async (_uid: string, w: Omit<SecretRow, never>) => {
      row = { ...w, updatedAt: "2026-11-10T12:00:00.000Z" };
    }),
    clearKey: vi.fn(async () => {
      if (row) row = { ...row, keyCiphertext: null, keyHint: null, keyUpdatedAt: null };
    }),
    countCalls: vi.fn(async () => used),
    recordCall: vi.fn(async () => {}),
    pruneCalls: vi.fn(async () => {}),
  };
  return { store: store as unknown as AiStore & typeof store, get: () => row };
}

function setup(opts: { row?: SecretRow; used?: number; env?: HandlerDeps["env"] } = {}) {
  const mem = memStore(opts.row, opts.used);
  const logs: LogEntry[] = [];
  const deps: HandlerDeps = {
    env: opts.env ?? { kek: KEK, origins: ORIGIN },
    getUserId: vi.fn(async (t: string) => (t === TOKEN ? UID : null)),
    store: mem.store,
    testClaude: vi.fn(async () => ({ ok: true as const })),
    testGemini: vi.fn(async () => ({ ok: true as const })),
    now: () => NOW,
    log: (e) => logs.push(e),
  };
  const call = async (
    body: unknown,
    init: { method?: string; auth?: string | null; origin?: string } = {},
  ) => {
    const headers: Record<string, string> = { origin: init.origin ?? ORIGIN };
    if (init.auth !== null) headers.authorization = init.auth ?? `Bearer ${TOKEN}`;
    const res = await handleSettingsRequest(
      new Request("http://fn/", {
        method: init.method ?? "POST",
        headers,
        body: init.method === "GET" || init.method === "OPTIONS" ? undefined : JSON.stringify(body),
      }),
      deps,
    );
    const text = await res.text();
    return { res, text, json: text ? JSON.parse(text) : null };
  };
  return { ...mem, deps, logs, call };
}

const sealed = async (provider = "claude", key = API_KEY) =>
  sealKey(await importKek(KEK), UID, provider, key);
const secretRow = async (over: Partial<SecretRow> = {}): Promise<SecretRow> => ({
  provider: "claude",
  model: "claude-haiku-5-5",
  keyCiphertext: await sealed(),
  keyHint: "CDEF",
  keyUpdatedAt: "2026-11-09T00:00:00.000Z",
  ...over,
});
const save = (extra: Record<string, unknown> = {}) => ({
  action: "save",
  provider: "claude",
  model: "claude-haiku-5-5",
  ...extra,
});

describe("request gating", () => {
  it("answers OPTIONS with CORS for an allowed origin only", async () => {
    const t = setup();
    const ok = await t.call(null, { method: "OPTIONS" });
    expect(ok.res.status).toBe(204);
    expect(ok.res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const bad = await t.call(null, { method: "OPTIONS", origin: "https://evil.example" });
    expect(bad.res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("non-POST is 405", async () => {
    expect((await setup().call(null, { method: "GET" })).res.status).toBe(405);
  });

  it("missing KEK or origins is 503 server_misconfigured", async () => {
    for (const env of [{ origins: ORIGIN }, { kek: KEK }, { kek: "short", origins: ORIGIN }]) {
      const r = await setup({ env }).call({ action: "get" });
      expect(r.res.status).toBe(503);
      expect(r.json).toEqual({ error: { code: "server_misconfigured" } });
    }
  });

  it("missing or invalid token is 401 and the auth dep sees the bearer token only", async () => {
    const t = setup();
    expect((await t.call({ action: "get" }, { auth: null })).res.status).toBe(401);
    expect((await t.call({ action: "get" }, { auth: "Bearer nope" })).res.status).toBe(401);
    expect((await t.call({ action: "get" }, { auth: "Basic abc" })).res.status).toBe(401);
    expect(t.deps.getUserId).toHaveBeenCalledWith("nope");
    expect(t.store.getView).not.toHaveBeenCalled();
  });

  it("a throwing auth dep is 401", async () => {
    const t = setup();
    (t.deps.getUserId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("x"));
    expect((await t.call({ action: "get" })).res.status).toBe(401);
  });

  it("body user_id, unknown action, bad JSON are 400; oversize is 413", async () => {
    const t = setup();
    expect((await t.call({ action: "get", user_id: "x" })).res.status).toBe(400);
    expect((await t.call({ action: "nope" })).res.status).toBe(400);
    const raw = await handleSettingsRequest(
      new Request("http://fn/", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body: "{",
      }),
      t.deps,
    );
    expect(raw.status).toBe(400);
    const big = await t.call({ action: "get", pad: "x".repeat(5000) });
    expect(big.res.status).toBe(413);
  });
});

describe("get", () => {
  it("no row gives null", async () => {
    expect((await setup().call({ action: "get" })).json).toEqual({ settings: null });
  });

  it("returns the masked view with modelSupported", async () => {
    const t = setup({ row: await secretRow() });
    const { json } = await t.call({ action: "get" });
    expect(json.settings).toEqual({
      provider: "claude",
      model: "claude-haiku-5-5",
      keyHint: "••••CDEF",
      hasKey: true,
      modelSupported: true,
      updatedAt: "2026-11-09T00:00:00.000Z",
    });
  });

  it("flags a model that left the catalog", async () => {
    const t = setup({ row: await secretRow({ model: "claude-retired" }) });
    expect((await t.call({ action: "get" })).json.settings.modelSupported).toBe(false);
  });
});

describe("save", () => {
  it("first save seals the key (AAD user+provider) and returns the mask", async () => {
    const t = setup();
    const { res, json } = await t.call(save({ apiKey: ` ${API_KEY} ` }));
    expect(res.status).toBe(200);
    expect(json.settings.keyHint).toBe("••••CDEF");
    expect(json.settings.hasKey).toBe(true);
    const w = t.get()!;
    expect(w.keyCiphertext!.startsWith("v1:")).toBe(true);
    expect(w.keyCiphertext).not.toContain(API_KEY);
    expect(w.keyHint).toBe("CDEF");
    expect(w.keyUpdatedAt).toBe(NOW.toISOString());
  });

  it("a new key replaces the ciphertext", async () => {
    const t = setup({ row: await secretRow() });
    const before = t.get()!.keyCiphertext;
    await t.call(save({ apiKey: "sk-ant-other-0123456789WXYZ" }));
    expect(t.get()!.keyCiphertext).not.toBe(before);
    expect(t.get()!.keyHint).toBe("WXYZ");
  });

  it("saving without a key keeps the stored one (model change)", async () => {
    const t = setup({ row: await secretRow() });
    const before = t.get()!;
    const { res } = await t.call(save({ model: "claude-opus-5-5" }));
    expect(res.status).toBe(200);
    expect(t.get()!.model).toBe("claude-opus-5-5");
    expect(t.get()!.keyCiphertext).toBe(before.keyCiphertext);
    expect(t.get()!.keyHint).toBe("CDEF");
  });

  it("save without a key and no row is allowed (hasKey false)", async () => {
    const t = setup();
    const { json } = await t.call(save());
    expect(json.settings.hasKey).toBe(false);
    expect(json.settings.keyHint).toBeNull();
  });

  it("provider change without a key while one is stored is key_required", async () => {
    // A stale gemini row with a key (gemini is not selectable now, but rows may predate that).
    const t = setup({ row: await secretRow({ provider: "gemini", model: "gemini-x" }) });
    const r = await t.call(save());
    expect(r.json.error.code).toBe("key_required");
    expect(t.store.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid provider, model, key format before any write", async () => {
    const t = setup();
    expect((await t.call({ action: "save", provider: "openai", model: "x" })).json.error.code).toBe(
      "invalid_provider",
    );
    expect((await t.call(save({ model: "claude-nope" }))).json.error.code).toBe("invalid_model");
    expect((await t.call(save({ model: " claude-haiku-5-5" }))).json.error.code).toBe(
      "invalid_model",
    );
    expect((await t.call(save({ apiKey: "short" }))).json.error.code).toBe("invalid_key_format");
    expect(t.store.upsert).not.toHaveBeenCalled();
    expect(t.store.getSecret).not.toHaveBeenCalled();
  });

  it("saving provider gemini is invalid_model while its list is empty", async () => {
    const t = setup();
    const r = await t.call({
      action: "save",
      provider: "gemini",
      model: "gemini-anything",
      apiKey: API_KEY,
    });
    expect(r.res.status).toBe(400);
    expect(r.json).toEqual({ error: { code: "invalid_model" } });
    expect(t.store.upsert).not.toHaveBeenCalled();
  });

  it("is rate limited before validation", async () => {
    const t = setup({ used: LIMITS.save.max });
    const r = await t.call({ action: "save", provider: "openai", model: "x" });
    expect(r.res.status).toBe(429);
    expect(r.json.error.code).toBe("rate_limited");
  });

  it("a store failure is internal (fail closed)", async () => {
    const t = setup();
    t.store.countCalls.mockRejectedValue(new Error("store_error"));
    const r = await t.call(save());
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual({ error: { code: "internal" } });
  });
});

describe("deleteKey", () => {
  it("clears the key, keeps provider and model, and is idempotent", async () => {
    const t = setup({ row: await secretRow() });
    const first = await t.call({ action: "deleteKey" });
    expect(first.json.settings).toMatchObject({ provider: "claude", hasKey: false, keyHint: null });
    expect(t.get()!.keyCiphertext).toBeNull();
    const second = await t.call({ action: "deleteKey" });
    expect(second.json.settings).toMatchObject({ hasKey: false });
  });

  it("with no row returns null", async () => {
    expect((await setup().call({ action: "deleteKey" })).json).toEqual({ settings: null });
  });
});

describe("test", () => {
  it("no row or no key is not_configured", async () => {
    expect((await setup().call({ action: "test" })).json.error.code).toBe("not_configured");
    const t = setup({ row: await secretRow({ keyCiphertext: null, keyHint: null }) });
    expect((await t.call({ action: "test" })).json.error.code).toBe("not_configured");
  });

  it("undecryptable ciphertext is key_unreadable", async () => {
    const t = setup({ row: await secretRow({ keyCiphertext: await sealed("gemini") }) });
    const r = await t.call({ action: "test" });
    expect(r.res.status).toBe(409);
    expect(r.json.error.code).toBe("key_unreadable");
    expect(t.deps.testClaude).not.toHaveBeenCalled();
  });

  it("a model that left the catalog is invalid_model, and a gemini row too while its list is empty", async () => {
    const t = setup({ row: await secretRow({ model: "claude-retired" }) });
    expect((await t.call({ action: "test" })).json.error.code).toBe("invalid_model");
    const g = setup({ row: await secretRow({ provider: "gemini", model: "gemini-x" }) });
    expect((await g.call({ action: "test" })).json.error.code).toBe("invalid_model");
    expect(g.deps.testGemini).not.toHaveBeenCalled();
  });

  it("calls the adapter with the decrypted key and returns ok", async () => {
    const t = setup({ row: await secretRow() });
    const r = await t.call({ action: "test" });
    expect(r.json).toEqual({ ok: true });
    expect(t.deps.testClaude).toHaveBeenCalledWith(API_KEY, "claude-haiku-5-5");
  });

  it("maps a provider error to its code and logs the status only", async () => {
    const t = setup({ row: await secretRow() });
    (t.deps.testClaude as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: "invalid_key",
      status: 401,
    });
    const r = await t.call({ action: "test" });
    expect(r.res.status).toBe(422);
    expect(r.json.error.code).toBe("invalid_key");
    expect(t.logs.at(-1)).toEqual({ action: "test", code: "invalid_key", providerStatus: 401 });
  });

  it("is rate limited before any provider call", async () => {
    const t = setup({ row: await secretRow(), used: LIMITS.test.max });
    const r = await t.call({ action: "test" });
    expect(r.res.status).toBe(429);
    expect(t.deps.testClaude).not.toHaveBeenCalled();
  });
});

describe("leak checks", () => {
  it("no response body or log entry contains the api key, the ciphertext or provider error text", async () => {
    const row = await secretRow();
    const t = setup({ row });
    (t.deps.testClaude as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: "provider_unavailable",
      status: 500,
      // extra field a careless adapter might add; the handler must not forward it
      message: "provider said: bad key " + API_KEY,
    });
    const bodies = [
      (await t.call({ action: "get" })).text,
      (await t.call(save({ apiKey: API_KEY }))).text,
      (await t.call({ action: "test" })).text,
      (await t.call({ action: "test" })).text,
      (await t.call(save({ apiKey: "short" }))).text,
      (await t.call({ action: "deleteKey" })).text,
    ];
    const ciphertext = row.keyCiphertext!;
    const stored = t.get()?.keyCiphertext;
    const all = bodies.join("\n") + JSON.stringify(t.logs);
    expect(all).not.toContain(API_KEY);
    expect(all).not.toContain(ciphertext);
    if (stored) expect(all).not.toContain(stored);
    expect(all).not.toContain("provider said");
    for (const l of t.logs) {
      expect(Object.keys(l).every((k) => ["action", "code", "providerStatus"].includes(k))).toBe(
        true,
      );
    }
  });

  it("unexpected throws map to internal with only the code logged", async () => {
    const t = setup();
    t.store.getView.mockRejectedValue(new Error("db password=hunter2"));
    const r = await t.call({ action: "get" });
    expect(r.json).toEqual({ error: { code: "internal" } });
    expect(JSON.stringify(t.logs)).not.toContain("hunter2");
  });
});
