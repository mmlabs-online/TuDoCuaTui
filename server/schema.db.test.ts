// @vitest-environment node
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrator.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");

describe.skipIf(!dbAvailable)("schema (real Postgres)", () => {
  let db: TestDb;
  let pool: pg.Pool;

  beforeAll(async () => {
    db = await createTestDb();
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = new pg.Pool({ connectionString: db.url, max: 5 });
    // Per-client parser: date (OID 1082) stays a 'YYYY-MM-DD' string.
    pool.on("connect", (c) => {
      c.setTypeParser(1082, (v: string) => v);
    });
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
  });

  const newItem = async (name = "Áo thun") =>
    (await pool.query("insert into items (name) values ($1) returning id", [name])).rows[0]
      .id as string;
  const wearPlus = (id: string, day: string) =>
    pool.query(
      "insert into wear_logs (item_id, worn_on) values ($1, $2) on conflict (item_id, worn_on) do nothing returning id",
      [id, day],
    );
  const stats = async (id: string) =>
    (await pool.query("select * from items_with_stats where id = $1", [id])).rows[0];

  it("location get-or-create by name is race-free", async () => {
    const sql =
      "insert into locations (name) values ($1) on conflict (name) do update set name = excluded.name returning id";
    const results = await Promise.all(
      Array.from({ length: 8 }, () => pool.query(sql, ["Tủ phòng ngủ"])),
    );
    expect(new Set(results.map((r) => r.rows[0].id)).size).toBe(1);
    expect((await pool.query("select count(*)::int as n from locations")).rows[0].n).toBe(1);
  });

  it("item insert with client uuid and with server default", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const r = await pool.query("insert into items (id, name) values ($1, 'A') returning id", [id]);
    expect(r.rows[0].id).toBe(id);
    const s = await pool.query("insert into items (name) values ('B') returning *");
    expect(s.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.rows[0]).toMatchObject({ category: "other", status: "active", seasons: [] });
  });

  it("wear +1 twice same day -> second returns no row; view shows 1", async () => {
    const id = await newItem();
    expect((await wearPlus(id, "2026-11-10")).rowCount).toBe(1);
    expect((await wearPlus(id, "2026-11-10")).rowCount).toBe(0);
    expect(await stats(id)).toMatchObject({ wear_count: 1, last_worn: "2026-11-10" });
  });

  it("wear -1 deletes only the latest day; after last row wear_count 0, last_worn null", async () => {
    const id = await newItem();
    await wearPlus(id, "2026-11-08");
    await wearPlus(id, "2026-11-10");
    const del =
      "delete from wear_logs where id = (select id from wear_logs where item_id = $1 order by worn_on desc limit 1)";
    await pool.query(del, [id]);
    expect(await stats(id)).toMatchObject({ wear_count: 1, last_worn: "2026-11-08" });
    await pool.query(del, [id]);
    expect(await stats(id)).toMatchObject({ wear_count: 0, last_worn: null });
  });

  it("items_with_stats columns: existing order kept, primary_photo_id last", async () => {
    const r = await pool.query(
      "select column_name from information_schema.columns where table_name = 'items_with_stats' order by ordinal_position",
    );
    expect(r.rows.map((x) => x.column_name)).toEqual([
      "id",
      "name",
      "category",
      "status",
      "brand",
      "size",
      "material",
      "price",
      "purchase_date",
      "location_id",
      "colors",
      "seasons",
      "tags",
      "notes",
      "created_at",
      "updated_at",
      "wear_count",
      "last_worn",
      "location_name",
      "primary_photo_path",
      "primary_photo_id",
    ]);
  });

  it("pg JS shapes: seasons string[], wear_count number, price string; last_worn 'YYYY-MM-DD' with a per-client 1082 parser", async () => {
    const id = (
      await pool.query(
        "insert into items (name, seasons, price, purchase_date) values ('X', '{summer,winter}', 150000, '2026-01-02') returning id",
      )
    ).rows[0].id;
    await wearPlus(id, "2026-11-10");
    const row = await stats(id);
    expect(row.seasons).toEqual(["summer", "winter"]);
    expect(typeof row.wear_count).toBe("number");
    expect(row.price).toBe("150000");
    expect(row.last_worn).toBe("2026-11-10");
    expect(row.purchase_date).toBe("2026-01-02");
  });

  it("primary photo pick: is_primary first, else oldest", async () => {
    const id = await newItem();
    await pool.query(
      "insert into item_photos (item_id, storage_path, created_at) values ($1, 'old', now() - interval '2 day'), ($1, 'new', now())",
      [id],
    );
    expect((await stats(id)).primary_photo_path).toBe("old");
    await pool.query("update item_photos set is_primary = true where storage_path = 'new'");
    expect((await stats(id)).primary_photo_path).toBe("new");
  });

  it("deleting an item cascades photos and wear logs", async () => {
    const id = await newItem();
    await wearPlus(id, "2026-11-10");
    await pool.query("insert into item_photos (item_id, storage_path) values ($1, 'p')", [id]);
    await pool.query("delete from items where id = $1", [id]);
    const n = await pool.query(
      "select (select count(*) from wear_logs)::int as w, (select count(*) from item_photos)::int as p",
    );
    expect(n.rows[0]).toEqual({ w: 0, p: 0 });
  });

  it("deleting a location nulls items.location_id and child parent_id", async () => {
    const parent = (await pool.query("insert into locations (name) values ('P') returning id"))
      .rows[0].id;
    const child = (
      await pool.query("insert into locations (name, parent_id) values ('C', $1) returning id", [
        parent,
      ])
    ).rows[0].id;
    const item = (
      await pool.query("insert into items (name, location_id) values ('I', $1) returning id", [
        parent,
      ])
    ).rows[0].id;
    await pool.query("delete from locations where id = $1", [parent]);
    expect(
      (await pool.query("select parent_id from locations where id = $1", [child])).rows[0]
        .parent_id,
    ).toBeNull();
    expect(
      (await pool.query("select location_id from items where id = $1", [item])).rows[0].location_id,
    ).toBeNull();
  });

  it("constraints reject: price < 0, empty/too-long name, bad category/status, bad season, parent_id = id, second primary photo, duplicate location name, null worn_on", async () => {
    const id = await newItem();
    const bad: Array<[string, unknown[]]> = [
      ["insert into items (name, price) values ('x', -1)", []],
      ["insert into items (name) values ('')", []],
      ["insert into items (name) values ($1)", ["x".repeat(121)]],
      ["insert into items (name, category) values ('x', 'nope')", []],
      ["insert into items (name, status) values ('x', 'nope')", []],
      ["insert into items (name, seasons) values ('x', '{monsoon}')", []],
      ["insert into locations (name) values ('')", []],
      [
        "insert into locations (id, name, parent_id) values ('22222222-2222-4222-8222-222222222222', 'S', '22222222-2222-4222-8222-222222222222')",
        [],
      ],
      ["insert into wear_logs (item_id, worn_on) values ($1, null)", [id]],
      ["insert into item_photos (item_id, storage_path, width) values ($1, 'w', 0)", [id]],
    ];
    for (const [sql, params] of bad) {
      await expect(pool.query(sql, params), sql).rejects.toMatchObject({
        code: expect.stringMatching(/^2[23]/),
      });
    }
    await pool.query(
      "insert into item_photos (item_id, storage_path, is_primary) values ($1, 'a', true)",
      [id],
    );
    await expect(
      pool.query(
        "insert into item_photos (item_id, storage_path, is_primary) values ($1, 'b', true)",
        [id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await pool.query("insert into locations (name) values ('dup')");
    await expect(pool.query("insert into locations (name) values ('dup')")).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("update bumps updated_at", async () => {
    const id = await newItem();
    // The trigger overwrites whatever the statement sets with now().
    await pool.query("update items set updated_at = now() - interval '1 day' where id = $1", [id]);
    const row = (await pool.query("select updated_at from items where id = $1", [id])).rows[0];
    expect(Date.now() - row.updated_at.getTime()).toBeLessThan(60_000);
  });

  it("no table has RLS or a user_id column", async () => {
    const rls = await pool.query(
      "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity",
    );
    expect(rls.rows).toEqual([]);
    const cols = await pool.query(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id'",
    );
    expect(cols.rows).toEqual([]);
  });

  it("migration applies over init data; a storage_path row survives", async () => {
    const tmp = await createTestDb();
    const dir = await mkdtemp(path.join(os.tmpdir(), "tudo-mig-"));
    try {
      const init = "20261110120000_init.sql";
      await copyFile(path.join(realDir, init), path.join(dir, init));
      await runMigrations({ connectionString: tmp.url, dir });
      const c = new pg.Client({ connectionString: tmp.url });
      await c.connect();
      const item = (await c.query("insert into items (name) values ('x') returning id")).rows[0].id;
      await c.query("insert into item_photos (item_id, storage_path) values ($1, 'u/i/a.jpg')", [
        item,
      ]);
      await runMigrations({ connectionString: tmp.url, dir: realDir });
      const row = (await c.query("select * from items_with_stats")).rows[0];
      expect(row).toMatchObject({ primary_photo_path: "u/i/a.jpg" });
      expect(row.primary_photo_id).toMatch(/^[0-9a-f-]{36}$/);
      await c.end();
    } finally {
      await rm(dir, { recursive: true, force: true });
      await tmp.drop();
    }
  });

  it("storage_path nullable; both references null rejected; drive_file_id format and uniqueness", async () => {
    const id = await newItem();
    const ins = (path: string | null, drive: string | null) =>
      pool.query(
        "insert into item_photos (item_id, storage_path, drive_file_id) values ($1, $2, $3)",
        [id, path, drive],
      );
    await ins(null, "fakefile0000000001");
    await expect(ins(null, null)).rejects.toMatchObject({ code: "23514" });
    await expect(ins(null, "short")).rejects.toMatchObject({ code: "23514" });
    await expect(ins(null, "bad id with spaces!")).rejects.toMatchObject({ code: "23514" });
    await expect(ins(null, "fakefile0000000001")).rejects.toMatchObject({ code: "23505" });
  });

  it("one primary per item; several non-primary photos allowed", async () => {
    const id = await newItem();
    const ins = (drive: string, primary: boolean) =>
      pool.query(
        "insert into item_photos (item_id, drive_file_id, is_primary) values ($1, $2, $3)",
        [id, drive, primary],
      );
    await ins("fakefile0000000001", true);
    await expect(ins("fakefile0000000002", true)).rejects.toMatchObject({ code: "23505" });
    await ins("fakefile0000000003", false);
    await ins("fakefile0000000004", false);
  });

  it("primary_photo_id: null without photo; primary beats older non-primary; cascades on item delete", async () => {
    const id = await newItem();
    expect((await stats(id)).primary_photo_id).toBeNull();
    await pool.query(
      "insert into item_photos (item_id, drive_file_id, created_at) values ($1, 'fakefile0000000001', now() - interval '2 day')",
      [id],
    );
    const prim = (
      await pool.query(
        "insert into item_photos (item_id, drive_file_id, is_primary) values ($1, 'fakefile0000000002', true) returning id",
        [id],
      )
    ).rows[0].id;
    expect((await stats(id)).primary_photo_id).toBe(prim);
    await pool.query("delete from items where id = $1", [id]);
    expect((await pool.query("select count(*)::int as n from item_photos")).rows[0].n).toBe(0);
  });
});
