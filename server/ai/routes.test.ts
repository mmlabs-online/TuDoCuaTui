// @vitest-environment node
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { importKek, openKey } from "./crypto.js";
import type { AiStore } from "./store.js";

const SENTINEL = "sk-ant-SENTINEL-0123456789abcdef";
const OTHER_KEY = "sk-ant-OTHERKEY-0123456789abcdef";
const JSON_H = { "Content-Type": "application/json" };
const UPDATED = new Date("2026-03-04T05:00:00Z");
const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

type Row = {
  provider: string;
  model: string;
  keyHint: string | null;
  hasKey: boolean;
  updatedAt: string;
};
type Saved = {
  provider: string;
  model: string;
  sealed: { ciphertext: string; hint: string } | null;
};

/** In-memory store with the same semantics as the SQL one. */
function fakeStore(initial: Row | null = null, failWith?: Error) {
  let row = initial;
  const saved: Saved[] = [];
  const store: AiStore = {
    async get() {
      if (failWith) throw failWith;
      return row;
    },
    async save(input) {
      if (failWith) throw failWith;
      saved.push(input);
      if (!input.sealed && row?.hasKey && row.provider !== input.provider) {
        return { ok: false, code: "key_required" };
      }
      const keep = !input.sealed && row ? row : null;
      row = {
        provider: input.provider,
        model: input.model,
        keyHint: input.sealed ? input.sealed.hint : (keep?.keyHint ?? null),
        hasKey: input.sealed ? true : (keep?.hasKey ?? false),
        updatedAt: UPDATED.toISOString(),
      };
      return { ok: true, row };
    },
    async clearKey() {
      if (failWith) throw failWith;
      if (row) row = { ...row, keyHint: null, hasKey: false };
      return row;
    },
  };
  return { store, saved };
}

async function start(opts: {
  store?: AiStore;
  ai?: boolean;
  pool?: object | null;
  now?: () => number;
}) {
  const logs: Record<string, unknown>[] = [];
  const kek = await importKek(randomBytes(32).toString("base64"));
  const server = http.createServer(
    createApp({
      pool: (opts.pool === undefined ? { query: async () => ({ rows: [] }) } : opts.pool) as never,
      ai: opts.ai === false ? null : { kek, store: opts.store },
      distDir: "/nonexistent",
      access: null,
      log: (e) => logs.push(e),
      now: opts.now,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, logs, kek };
}

const put = (base: string, body: unknown, headers: Record<string, string> = JSON_H) =>
  fetch(`${base}/api/ai-settings`, {
    method: "PUT",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const code = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;
const valid = { provider: "claude", model: "claude-haiku-5-5" };
const aRow: Row = {
  provider: "claude",
  model: "claude-haiku-5-5",
  keyHint: "cdef",
  hasKey: true,
  updatedAt: UPDATED.toISOString(),
};

describe("GET", () => {
  it("no row -> {settings:null}", async () => {
    const { base } = await start({ store: fakeStore().store });
    const res = await fetch(`${base}/api/ai-settings`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settings: null });
  });

  it("view shape: exactly the 6 keys, masked hint, no-store", async () => {
    const { base } = await start({ store: fakeStore(aRow).store });
    const res = await fetch(`${base}/api/ai-settings`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { settings } = (await res.json()) as { settings: Record<string, unknown> };
    expect(Object.keys(settings).sort()).toEqual(
      ["hasKey", "keyHint", "model", "modelSupported", "provider", "updatedAt"].sort(),
    );
    expect(settings).toMatchObject({ keyHint: "••••cdef", hasKey: true, modelSupported: true });
  });

  it("a model no longer in the catalog -> modelSupported:false; no key -> null hint", async () => {
    const row = { ...aRow, model: "claude-old-1", keyHint: null, hasKey: false };
    const { base } = await start({ store: fakeStore(row).store });
    const { settings } = (await (await fetch(`${base}/api/ai-settings`)).json()) as {
      settings: Record<string, unknown>;
    };
    expect(settings).toMatchObject({ modelSupported: false, keyHint: null, hasKey: false });
  });
});

describe("PUT validation", () => {
  it("rejects with the shared rule codes", async () => {
    const { base } = await start({ store: fakeStore().store });
    const cases: [unknown, number, string][] = [
      [{ provider: "openai", model: "x" }, 400, "invalid_provider"],
      [{ provider: "claude", model: "gpt-4" }, 400, "invalid_model"],
      [{ provider: "gemini", model: "gemini-2.5-pro" }, 400, "invalid_model"],
      [{ ...valid, apiKey: "a".repeat(19) }, 400, "invalid_key_format"],
      [{ ...valid, apiKey: "a".repeat(10) + " " + "a".repeat(10) }, 400, "invalid_key_format"],
      [{ ...valid, extra: 1 }, 400, "bad_request"],
      [{ provider: 1, model: "x" }, 400, "bad_request"],
      [[], 400, "bad_request"],
    ];
    for (const [body, status, c] of cases) {
      const res = await put(base, body);
      expect([res.status, await code(res)]).toEqual([status, c]);
    }
  });

  it("415 without JSON, 400 invalid_json, 413 above 4096 bytes", async () => {
    const { base } = await start({ store: fakeStore().store });
    const a = await put(base, "x", { "Content-Type": "text/plain" });
    expect([a.status, await code(a)]).toEqual([415, "unsupported_media_type"]);
    const b = await put(base, "{nope");
    expect([b.status, await code(b)]).toEqual([400, "invalid_json"]);
    const c = await put(base, JSON.stringify({ ...valid, apiKey: "a".repeat(5000) }));
    expect([c.status, await code(c)]).toEqual([413, "payload_too_large"]);
  });
});

describe("PUT key handling", () => {
  it("a new key is sealed (opens to the trimmed key), hint is the last 4", async () => {
    const { store, saved } = fakeStore();
    const { base, kek } = await start({ store });
    const res = await put(base, { ...valid, apiKey: `  ${SENTINEL}  ` });
    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as { settings: Record<string, unknown> };
    expect(settings).toMatchObject({ hasKey: true, keyHint: "••••cdef" });
    const sealed = saved[0].sealed!;
    expect(sealed.hint).toBe("cdef");
    expect(await openKey(kek, "claude", sealed.ciphertext)).toBe(SENTINEL);
  });

  it("no key keeps the existing one; no row and no key saves hasKey:false", async () => {
    const { base } = await start({ store: fakeStore(aRow).store });
    const kept = (await (await put(base, valid)).json()) as { settings: Record<string, unknown> };
    expect(kept.settings).toMatchObject({ hasKey: true, keyHint: "••••cdef" });
    const fresh = await start({ store: fakeStore().store });
    const r = (await (await put(fresh.base, valid)).json()) as {
      settings: Record<string, unknown>;
    };
    expect(r.settings).toMatchObject({ hasKey: false, keyHint: null });
  });

  it("provider change with an existing key and no new key -> 400 key_required", async () => {
    const { base } = await start({ store: fakeStore({ ...aRow, provider: "gemini" }).store });
    const res = await put(base, valid);
    expect([res.status, await code(res)]).toEqual([400, "key_required"]);
  });
});

describe("DELETE key", () => {
  it("clears the key, is idempotent, and no row gives null", async () => {
    const { base } = await start({ store: fakeStore(aRow).store });
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/api/ai-settings/key`, { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { settings: unknown }).settings).toMatchObject({
        hasKey: false,
        keyHint: null,
      });
    }
    const empty = await start({ store: fakeStore().store });
    const res = await fetch(`${empty.base}/api/ai-settings/key`, { method: "DELETE" });
    expect(await res.json()).toEqual({ settings: null });
  });
});

describe("rate limit", () => {
  it("the 31st PUT within an hour -> 429 rate_limited", async () => {
    const { base } = await start({ store: fakeStore().store, now: () => 1000 });
    for (let i = 0; i < 30; i++) expect((await put(base, valid)).status).toBe(200);
    const res = await put(base, valid);
    expect([res.status, await code(res)]).toEqual([429, "rate_limited"]);
  });
});

describe("routing and guards", () => {
  it("405 with Allow, 404 for unknown paths, never idInvalid", async () => {
    const { base } = await start({ store: fakeStore().store });
    const a = await fetch(`${base}/api/ai-settings`, { method: "POST" });
    expect([a.status, a.headers.get("allow")]).toEqual([405, "GET, PUT"]);
    const b = await fetch(`${base}/api/ai-settings/key`);
    expect([b.status, b.headers.get("allow")]).toEqual([405, "DELETE"]);
    expect((await fetch(`${base}/api/ai-settings/`)).status).toBe(404);
    expect((await fetch(`${base}/api/ai-settings/x`)).status).toBe(404);
    const d = await fetch(`${base}/api/ai-settings/key`, { method: "DELETE" });
    expect(d.status).toBe(200);
  });

  it("cross-site PUT and DELETE -> 403 forbidden_origin", async () => {
    const { base } = await start({ store: fakeStore().store });
    const h = { ...JSON_H, "Sec-Fetch-Site": "cross-site" };
    const a = await put(base, valid, h);
    expect([a.status, await code(a)]).toEqual([403, "forbidden_origin"]);
    const b = await fetch(`${base}/api/ai-settings/key`, {
      method: "DELETE",
      headers: { "Sec-Fetch-Site": "same-site" },
    });
    expect(b.status).toBe(403);
  });
});

describe("KEK off", () => {
  it("every AI route answers 503 server_misconfigured; the rest of the API works", async () => {
    const { base } = await start({ ai: false });
    for (const [method, path] of [
      ["GET", "/api/ai-settings"],
      ["PUT", "/api/ai-settings"],
      ["DELETE", "/api/ai-settings/key"],
    ]) {
      const res = await fetch(base + path, { method, headers: JSON_H });
      expect([res.status, await code(res)]).toEqual([503, "server_misconfigured"]);
    }
    expect((await fetch(`${base}/api/items`)).status).toBe(200);
    expect((await fetch(`${base}/api/locations`)).status).toBe(200);
  });
});

describe("store unavailable", () => {
  it("pool null -> 503 db_unavailable after input validation", async () => {
    const { base } = await start({ pool: null });
    const bad = await put(base, { provider: "openai", model: "x" });
    expect(await code(bad)).toBe("invalid_provider");
    const res = await put(base, valid);
    expect([res.status, await code(res)]).toEqual([503, "db_unavailable"]);
    expect((await fetch(`${base}/api/ai-settings`)).status).toBe(503);
  });

  it("57P01 -> 503; any other error -> 500 internal with requestId; log has safe fields only", async () => {
    const down = await start({
      store: fakeStore(null, Object.assign(new Error(SENTINEL), { code: "57P01" })).store,
    });
    expect((await fetch(`${down.base}/api/ai-settings`)).status).toBe(503);
    const boom = await start({
      store: fakeStore(null, Object.assign(new Error(SENTINEL), { detail: SENTINEL })).store,
    });
    const res = await fetch(`${boom.base}/api/ai-settings`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("internal");
    expect(body.error.requestId).toBeTruthy();
    const entry = boom.logs.find((l) => l.event === "db_error")!;
    expect(Object.keys(entry).sort()).toEqual(["event", "id", "route"]);
  });
});

describe("sentinel never leaves the server", () => {
  it("is absent from bodies, headers and logs across PUT, GET and DELETE", async () => {
    const failing = new Error(`boom ${SENTINEL}`);
    const ok = fakeStore();
    const a = await start({ store: ok.store });
    const b = await start({
      store: fakeStore(null, Object.assign(failing, { detail: SENTINEL })).store,
    });
    const seen: string[] = [];
    const record = async (res: Response) => {
      seen.push(await res.text(), JSON.stringify([...res.headers.entries()]));
    };
    await record(await put(a.base, { ...valid, apiKey: SENTINEL }));
    await record(await put(a.base, { provider: "claude", model: "nope", apiKey: SENTINEL }));
    await record(await put(a.base, { ...valid, apiKey: SENTINEL, extra: 1 }));
    await record(await put(a.base, `{"apiKey":"${SENTINEL}"`));
    await record(await put(a.base, { ...valid, apiKey: SENTINEL + "x".repeat(5000) }));
    await record(await put(b.base, { ...valid, apiKey: SENTINEL }));
    await record(await fetch(`${a.base}/api/ai-settings`));
    await record(await fetch(`${a.base}/api/ai-settings/key`, { method: "DELETE" }));
    await record(await fetch(`${b.base}/api/ai-settings/key`, { method: "DELETE" }));
    const all = JSON.stringify([seen, a.logs, b.logs, ok.saved.map((s) => s.sealed?.ciphertext)]);
    expect(all).not.toContain(SENTINEL);
    expect(all).not.toContain(OTHER_KEY);
  });
});
