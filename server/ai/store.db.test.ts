// @vitest-environment node
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrator.js";
import { OWNER_A, OWNER_B } from "../test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "../test/pg.js";
import { importKek, openKey, sealKey } from "./crypto.js";
import { createAiStore } from "./store.js";

const realDir = path.resolve(import.meta.dirname, "../../db/migrations");
const SENTINEL = "sk-ant-SENTINEL-0123456789abcdef";

describe.skipIf(!dbAvailable)("ai_settings (real Postgres)", () => {
  let db: TestDb;
  let pool: pg.Pool;
  const store = () => createAiStore(pool);

  beforeAll(async () => {
    db = await createTestDb();
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = new pg.Pool({ connectionString: db.url, max: 5 });
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query("truncate ai_settings");
  });

  const insert = (sql: string, values: unknown[] = []) =>
    pool.query(`insert into ai_settings ${sql}`, values);
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { code: string }) => e.code,
    );

  it("schema: user_id is required and unique; two users, two rows; bad values -> 23514", async () => {
    expect(await codeOf(insert("(provider, model) values ('claude', 'm')"))).toBe("23502");
    await insert("(user_id, provider, model) values ($1, 'claude', 'm')", [OWNER_A]);
    expect(
      await codeOf(insert("(user_id, provider, model) values ($1, 'claude', 'm')", [OWNER_A])),
    ).toBe("23505");
    await insert("(user_id, provider, model) values ($1, 'claude', 'm')", [OWNER_B]);
    expect((await pool.query("select 1 from ai_settings")).rows).toHaveLength(2);
    await pool.query("truncate ai_settings");
    const bad = [
      "(user_id, provider, model) values ($1, 'openai', 'm')",
      "(user_id, provider, model) values ($1, 'claude', 'Bad Model')",
      "(user_id, provider, model, key_ciphertext) values ($1, 'claude', 'm', 'v1:abc')",
      "(user_id, provider, model, key_ciphertext, key_hint) values ($1, 'claude', 'm', 'v1:abc', 'abcde')",
      "(user_id, provider, model, key_ciphertext, key_hint) values ($1, 'claude', 'm', 'abc', 'abcd')",
    ];
    for (const b of bad) expect(await codeOf(insert(b, [OWNER_A]))).toBe("23514");
  });

  it("updated_at trigger fires", async () => {
    await insert("(user_id, provider, model) values ($1, 'claude', 'm')", [OWNER_A]);
    const before = (await pool.query("select updated_at from ai_settings")).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 15));
    await pool.query("update ai_settings set model = 'n'");
    const after = (await pool.query("select updated_at from ai_settings")).rows[0].updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("save -> get round trip, key kept on a same-provider save, clearKey", async () => {
    const s = store();
    expect(await s.get(OWNER_A)).toBeNull();
    const r = await s.save(OWNER_A, {
      provider: "claude",
      model: "claude-haiku-5-5",
      sealed: { ciphertext: "v2:AAAA", hint: "cdef" },
    });
    expect(r).toMatchObject({ ok: true, row: { keyHint: "cdef", hasKey: true } });
    const kept = await s.save(OWNER_A, {
      provider: "claude",
      model: "claude-opus-5-5",
      sealed: null,
    });
    expect(kept).toMatchObject({ ok: true, row: { model: "claude-opus-5-5", hasKey: true } });
    expect(await s.clearKey(OWNER_A)).toMatchObject({ hasKey: false, keyHint: null });
    expect(await s.clearKey(OWNER_A)).toMatchObject({ hasKey: false });
  });

  it("key_required on a provider change with a stored key; clearKey with no row -> null", async () => {
    const s = store();
    expect(await s.clearKey(OWNER_A)).toBeNull();
    await insert(
      "(user_id, provider, model, key_ciphertext, key_hint) values ($1, 'gemini', 'g', 'v2:AAAA', 'cdef')",
      [OWNER_A],
    );
    expect(
      await s.save(OWNER_A, { provider: "claude", model: "claude-haiku-5-5", sealed: null }),
    ).toEqual({ ok: false, code: "key_required" });
    expect((await pool.query("select provider from ai_settings")).rows[0].provider).toBe("gemini");
    // B has no key: a provider change is fine for B and leaves A alone.
    expect(
      await s.save(OWNER_B, { provider: "claude", model: "claude-haiku-5-5", sealed: null }),
    ).toMatchObject({ ok: true });
  });

  it("getSecret: null without a row or key, else provider, model and a v2 ciphertext", async () => {
    const s = store();
    expect(await s.getSecret(OWNER_A)).toBeNull();
    await s.save(OWNER_A, { provider: "claude", model: "claude-haiku-5-5", sealed: null });
    expect(await s.getSecret(OWNER_A)).toBeNull();
    const kek = await importKek(randomBytes(32).toString("base64"));
    const ciphertext = await sealKey(kek, OWNER_A, "claude", SENTINEL);
    await s.save(OWNER_A, {
      provider: "claude",
      model: "claude-haiku-5-5",
      sealed: { ciphertext, hint: "cdef" },
    });
    const got = await s.getSecret(OWNER_A);
    expect(got).toEqual({ provider: "claude", model: "claude-haiku-5-5", ciphertext });
    expect(got?.ciphertext).toMatch(/^v2:/);
    expect(await openKey(kek, OWNER_A, "claude", got!.ciphertext)).toBe(SENTINEL);
    await expect(openKey(kek, OWNER_B, "claude", got!.ciphertext)).rejects.toThrow();
  });

  it("two users: independent rows, keys and clearKey", async () => {
    const s = store();
    const sealed = { ciphertext: "v2:AAAA", hint: "cdef" };
    await s.save(OWNER_A, { provider: "claude", model: "claude-haiku-5-5", sealed });
    expect(await s.get(OWNER_B)).toBeNull();
    expect(await s.getSecret(OWNER_B)).toBeNull();
    await s.save(OWNER_B, { provider: "claude", model: "claude-opus-5-5", sealed: null });
    expect(await s.get(OWNER_B)).toMatchObject({ model: "claude-opus-5-5", hasKey: false });
    expect(await s.get(OWNER_A)).toMatchObject({ model: "claude-haiku-5-5", hasKey: true });
    await s.clearKey(OWNER_B);
    expect(await s.getSecret(OWNER_A)).toMatchObject({ ciphertext: "v2:AAAA" });
    expect((await pool.query("select 1 from ai_settings")).rows).toHaveLength(2);
  });

  it("every method throws 'userId required' for a bad user, without sending SQL", async () => {
    const sent: string[] = [];
    const spy = {
      query: async (t: string) => (sent.push(t), { rows: [] }),
      connect: async () => (
        sent.push("connect"),
        { query: async () => ({ rows: [] }), release() {} }
      ),
    };
    const s = createAiStore(spy);
    for (const u of [undefined, "", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "xyz"] as string[]) {
      await expect(s.get(u)).rejects.toThrow("userId required");
      await expect(s.save(u, { provider: "claude", model: "m", sealed: null })).rejects.toThrow(
        "userId required",
      );
      await expect(s.clearKey(u)).rejects.toThrow("userId required");
      await expect(s.getSecret(u)).rejects.toThrow("userId required");
    }
    expect(sent).toEqual([]);
  });

  it("stores ciphertext, never the key", async () => {
    const kek = await importKek(randomBytes(32).toString("base64"));
    const ciphertext = await sealKey(kek, OWNER_A, "claude", SENTINEL);
    await store().save(OWNER_A, {
      provider: "claude",
      model: "claude-haiku-5-5",
      sealed: { ciphertext, hint: "cdef" },
    });
    const stored = (await pool.query("select * from ai_settings")).rows[0];
    expect(JSON.stringify(stored)).not.toContain(SENTINEL);
    expect(await openKey(kek, OWNER_A, "claude", stored.key_ciphertext)).toBe(SENTINEL);
  });
});
