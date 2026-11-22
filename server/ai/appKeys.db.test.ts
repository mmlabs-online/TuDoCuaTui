// @vitest-environment node
import { randomBytes } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, withUser } from "../db.js";
import { runMigrations } from "../migrator.js";
import { OWNER_A } from "../test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "../test/pg.js";
import { createAppKeyStore } from "./appKeys.js";
import { importKek, openAppKey } from "./crypto.js";

const b64 = (n: number) => randomBytes(n).toString("base64");
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

describe.skipIf(!dbAvailable)("ai_app_keys (real Postgres)", () => {
  let db: TestDb;
  let pool: any;
  let admin: any;
  let kek: any;

  beforeAll(async () => {
    db = await createTestDb({ owner: true });
    await runMigrations({ connectionString: db.url, dir: migrationsDir });
    pool = createPool(db.url);
    admin = createPool(db.adminUrl);
    kek = await importKek(b64(32));
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    // Truncate ai_app_keys between tests
    await admin.query("truncate ai_app_keys");
  });

  it("CRUD: put, list, update on conflict, and delete", async () => {
    const store = createAppKeyStore(pool, kek);

    // Initial list is empty
    expect(await store.list()).toEqual([]);

    // Put Claude key
    const claudeKey = "sk-ant-test-claude-key-0123456789";
    const putRes = await store.put("claude", claudeKey);
    expect(putRes).toEqual({ ok: true, keyHint: "••••6789" });

    // Verify row in DB via raw query
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('tudo.maintenance', 'app-keys', true)");
      const res = await c.query("select provider, key_ciphertext, key_hint from ai_app_keys");
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].provider).toBe("claude");
      expect(res.rows[0].key_hint).toBe("6789");
      expect(res.rows[0].key_ciphertext).toMatch(/^app-v1:/);
      expect(res.rows[0].key_ciphertext).not.toContain(claudeKey);
      expect(await openAppKey(kek, "claude", res.rows[0].key_ciphertext)).toBe(claudeKey);
      await c.query("commit");
    } finally {
      c.release();
    }

    // List returns the entry
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe("claude");
    expect(list[0].keyHint).toBe("••••6789");
    expect(list[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Put Gemini key
    const geminiKey = "AIzaSy-test-gemini-key-0123456789";
    await store.put("gemini", geminiKey);
    const list2 = await store.list();
    expect(list2).toHaveLength(2);
    expect(list2.map((k) => k.provider)).toEqual(["claude", "gemini"]);

    // Update Claude key on conflict
    const updatedClaudeKey = "sk-ant-test-new-claude-key-abcdefgh";
    const updateRes = await store.put("claude", updatedClaudeKey);
    expect(updateRes).toEqual({ ok: true, keyHint: "••••efgh" });

    const list3 = await store.list();
    expect(list3).toHaveLength(2);
    const claudeEntry = list3.find((k) => k.provider === "claude")!;
    expect(claudeEntry.keyHint).toBe("••••efgh");

    // Delete Claude key
    expect(await store.delete("claude")).toEqual({ ok: true });
    const list4 = await store.list();
    expect(list4).toHaveLength(1);
    expect(list4[0].provider).toBe("gemini");

    // Delete again is idempotent
    expect(await store.delete("claude")).toEqual({ ok: true });
  });

  it("test: decrypts key and invokes provider checker", async () => {
    let calledUrl = "";
    const mockFetch = vi.fn(async (url: string) => {
      calledUrl = url;
      return new Response("{}", { status: 200 });
    });

    const store = createAppKeyStore(pool, kek, {
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    // Test non-configured -> 404
    expect(await store.test("openai")).toEqual({
      ok: false,
      status: 404,
      code: "not_configured",
    });

    // Put OpenAI key and test -> 200
    await store.put("openai", "sk-proj-test-openai-key-12345678");
    expect(await store.test("openai")).toEqual({ ok: true });
    expect(calledUrl).toBe("https://api.openai.com/v1/models");

    // Test with 401 provider error -> 422 invalid_key
    const mockFailFetch = vi.fn(async () => new Response("{}", { status: 401 }));
    const storeFail = createAppKeyStore(pool, kek, {
      fetch: mockFailFetch as unknown as typeof globalThis.fetch,
    });
    expect(await storeFail.test("openai")).toEqual({
      ok: false,
      status: 422,
      code: "invalid_key",
    });
  });

  it("RLS isolation: withUser cannot read or insert into ai_app_keys", async () => {
    const store = createAppKeyStore(pool, kek);
    await store.put("claude", "sk-ant-secret-key-1234567890");

    // Read inside withUser returns 0 rows
    await withUser(pool, OWNER_A, async (client) => {
      const res = await client.query("select * from ai_app_keys");
      expect(res.rows).toHaveLength(0);
    });

    // Insert inside withUser fails with 42501
    await expect(
      withUser(pool, OWNER_A, async (client) => {
        await client.query(
          "insert into ai_app_keys (provider, key_ciphertext, key_hint) values ('gemini', 'cipher', 'hint')",
        );
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
