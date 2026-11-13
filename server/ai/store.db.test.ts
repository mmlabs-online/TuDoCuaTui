// @vitest-environment node
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrator.js";
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

  it("rejects a second row and bad column values", async () => {
    await insert("(provider, model) values ('claude', 'claude-haiku-5-5')");
    expect(await codeOf(insert("(id, provider, model) values (false, 'claude', 'm')"))).toBe(
      "23514",
    );
    expect(await codeOf(insert("(provider, model) values ('claude', 'm')"))).toBe("23505");
    await pool.query("truncate ai_settings");
    const bad = [
      "(provider, model) values ('openai', 'm')",
      "(provider, model) values ('claude', 'Bad Model')",
      "(provider, model, key_ciphertext) values ('claude', 'm', 'v1:abc')",
      "(provider, model, key_ciphertext, key_hint) values ('claude', 'm', 'v1:abc', 'abcde')",
      "(provider, model, key_ciphertext, key_hint) values ('claude', 'm', 'abc', 'abcd')",
    ];
    for (const b of bad) expect(await codeOf(insert(b))).toBe("23514");
  });

  it("updated_at trigger fires", async () => {
    await insert("(provider, model) values ('claude', 'm')");
    const before = (await pool.query("select updated_at from ai_settings")).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 15));
    await pool.query("update ai_settings set model = 'n'");
    const after = (await pool.query("select updated_at from ai_settings")).rows[0].updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("save -> get round trip, key kept on a same-provider save, clearKey", async () => {
    const s = store();
    expect(await s.get()).toBeNull();
    const r = await s.save({
      provider: "claude",
      model: "claude-haiku-5-5",
      sealed: { ciphertext: "v1:AAAA", hint: "cdef" },
    });
    expect(r).toMatchObject({ ok: true, row: { keyHint: "cdef", hasKey: true } });
    const kept = await s.save({ provider: "claude", model: "claude-opus-5-5", sealed: null });
    expect(kept).toMatchObject({ ok: true, row: { model: "claude-opus-5-5", hasKey: true } });
    expect(await s.clearKey()).toMatchObject({ hasKey: false, keyHint: null });
    expect(await s.clearKey()).toMatchObject({ hasKey: false });
  });

  it("key_required on a provider change with a stored key; clearKey with no row -> null", async () => {
    const s = store();
    expect(await s.clearKey()).toBeNull();
    await insert(
      "(provider, model, key_ciphertext, key_hint) values ('gemini', 'g', 'v1:AAAA', 'cdef')",
    );
    expect(await s.save({ provider: "claude", model: "claude-haiku-5-5", sealed: null })).toEqual({
      ok: false,
      code: "key_required",
    });
    expect((await pool.query("select provider from ai_settings")).rows[0].provider).toBe("gemini");
  });

  it("getSecret: null without a row or key, else provider, model and a v1 ciphertext", async () => {
    const s = store();
    expect(await s.getSecret()).toBeNull();
    await s.save({ provider: "claude", model: "claude-haiku-5-5", sealed: null });
    expect(await s.getSecret()).toBeNull();
    const kek = await importKek(randomBytes(32).toString("base64"));
    const ciphertext = await sealKey(kek, "claude", SENTINEL);
    await s.save({
      provider: "claude",
      model: "claude-haiku-5-5",
      sealed: { ciphertext, hint: "cdef" },
    });
    const got = await s.getSecret();
    expect(got).toEqual({ provider: "claude", model: "claude-haiku-5-5", ciphertext });
    expect(got?.ciphertext).toMatch(/^v1:/);
    expect(await openKey(kek, "claude", got!.ciphertext)).toBe(SENTINEL);
  });

  it("stores ciphertext, never the key", async () => {
    const kek = await importKek(randomBytes(32).toString("base64"));
    const ciphertext = await sealKey(kek, "claude", SENTINEL);
    await store().save({
      provider: "claude",
      model: "claude-haiku-5-5",
      sealed: { ciphertext, hint: "cdef" },
    });
    const stored = (await pool.query("select * from ai_settings")).rows[0];
    expect(JSON.stringify(stored)).not.toContain(SENTINEL);
    expect(await openKey(kek, "claude", stored.key_ciphertext)).toBe(SENTINEL);
  });
});
