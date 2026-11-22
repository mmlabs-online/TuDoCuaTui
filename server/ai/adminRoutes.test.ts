// @vitest-environment node
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { headerAuth, OWNER_A, OWNER_B } from "../test/auth.js";
import { fakePool } from "../test/fake-pool.js";
import { importKek } from "./crypto.js";

const b64 = (n: number) => randomBytes(n).toString("base64");
const JSON_H = { "Content-Type": "application/json" };
const servers: http.Server[] = [];

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

function fakeAppKeysStore() {
  const map = new Map<string, { keyHint: string; updatedAt: string }>();
  return {
    async list() {
      return Array.from(map.entries()).map(([provider, v]) => ({
        provider,
        keyHint: v.keyHint,
        updatedAt: v.updatedAt,
      }));
    },
    async put(provider: string, rawKey: string) {
      if (provider !== "claude" && provider !== "gemini" && provider !== "openai") {
        return { ok: false as const, status: 400, code: "invalid_provider" };
      }
      if (rawKey.length < 20) {
        return { ok: false as const, status: 400, code: "invalid_key_format" };
      }
      const hint = "••••" + rawKey.slice(-4);
      map.set(provider, { keyHint: hint, updatedAt: new Date().toISOString() });
      return { ok: true as const, keyHint: hint };
    },
    async delete(provider: string) {
      if (provider !== "claude" && provider !== "gemini" && provider !== "openai") {
        return { ok: false as const, status: 400, code: "invalid_provider" };
      }
      map.delete(provider);
      return { ok: true as const };
    },
    async test(provider: string) {
      if (provider !== "claude" && provider !== "gemini" && provider !== "openai") {
        return { ok: false as const, status: 400, code: "invalid_provider" };
      }
      if (!map.has(provider)) {
        return { ok: false as const, status: 404, code: "not_configured" };
      }
      return { ok: true as const };
    },
  };
}

async function spinUp(fakeStore = fakeAppKeysStore()) {
  const kek = await importKek(b64(32));
  const app = createApp({
    pool: fakePool({ query: async () => ({ rows: [] }) }) as any,
    distDir: "/tmp",
    auth: headerAuth(),
    ownerSub: OWNER_A,
    log: () => {},
    ai: {
      kek,
      appKeys: fakeStore as any,
    },
  });
  const s = http.createServer(app);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as AddressInfo).port;
  const url = (p: string) => `http://127.0.0.1:${port}${p}`;
  return { url, store: fakeStore };
}

describe("admin AI keys routes", () => {
  it("non-owner (OWNER_B) gets 403 on every admin route, response leaks no secret", async () => {
    const { url, store } = await spinUp();
    await store.put("claude", "sk-ant-0123456789abcdefghij");

    const asB = { headers: { "x-test-user": "b", ...JSON_H } };

    // GET
    const getRes = await fetch(url("/api/admin/ai-keys"), asB);
    expect(getRes.status).toBe(403);
    const getJson = await getRes.json();
    expect(getJson).toEqual({ error: { code: "forbidden" } });

    // PUT
    const putRes = await fetch(url("/api/admin/ai-keys/claude"), {
      ...asB,
      method: "PUT",
      body: JSON.stringify({ apiKey: "sk-ant-99999999999999999999" }),
    });
    expect(putRes.status).toBe(403);
    expect(await putRes.json()).toEqual({ error: { code: "forbidden" } });

    // DELETE
    const delRes = await fetch(url("/api/admin/ai-keys/claude"), {
      ...asB,
      method: "DELETE",
    });
    expect(delRes.status).toBe(403);
    expect(await delRes.json()).toEqual({ error: { code: "forbidden" } });

    // POST test
    const testRes = await fetch(url("/api/admin/ai-keys/claude/test"), {
      ...asB,
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(testRes.status).toBe(403);
    expect(await testRes.json()).toEqual({ error: { code: "forbidden" } });
  });

  it("owner (OWNER_A) can list, put, test, and delete shared keys", async () => {
    const { url } = await spinUp();
    const asOwner = { headers: { "x-test-user": "a", ...JSON_H } };

    // Initially empty
    const r1 = await fetch(url("/api/admin/ai-keys"), asOwner);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ keys: [] });

    // PUT invalid body -> 400
    const badBody = await fetch(url("/api/admin/ai-keys/claude"), {
      ...asOwner,
      method: "PUT",
      body: JSON.stringify({ wrong: "field" }),
    });
    expect(badBody.status).toBe(400);

    // PUT valid key
    const put = await fetch(url("/api/admin/ai-keys/claude"), {
      ...asOwner,
      method: "PUT",
      body: JSON.stringify({ apiKey: "sk-ant-test-key-1234567890" }),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, keyHint: "••••7890" });

    // List now returns the saved key
    const r2 = await fetch(url("/api/admin/ai-keys"), asOwner);
    expect(r2.status).toBe(200);
    const list = (await r2.json()) as { keys: Array<{ provider: string; keyHint: string }> };
    expect(list.keys).toHaveLength(1);
    expect(list.keys[0].provider).toBe("claude");
    expect(list.keys[0].keyHint).toBe("••••7890");

    // Test with non-empty body -> 400
    const badTest = await fetch(url("/api/admin/ai-keys/claude/test"), {
      ...asOwner,
      method: "POST",
      body: JSON.stringify({ extra: 1 }),
    });
    expect(badTest.status).toBe(400);

    // Test with empty body -> 200
    const okTest = await fetch(url("/api/admin/ai-keys/claude/test"), {
      ...asOwner,
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(okTest.status).toBe(200);
    expect(await okTest.json()).toEqual({ ok: true });

    // DELETE key
    const del = await fetch(url("/api/admin/ai-keys/claude"), {
      ...asOwner,
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    // Test after delete -> 404 not_configured
    const testAfterDel = await fetch(url("/api/admin/ai-keys/claude/test"), {
      ...asOwner,
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(testAfterDel.status).toBe(404);
    expect(await testAfterDel.json()).toEqual({ error: { code: "not_configured" } });
  });
});
