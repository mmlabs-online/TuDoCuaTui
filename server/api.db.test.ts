// @vitest-environment node
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { saveItem } from "./items.js";
import { runMigrations } from "./migrator.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";
import { CATEGORIES, SEASONS, STATUSES } from "./validate.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
type Res = Omit<Response, "json"> & { json(): Promise<any> };
const JSON_H = { "Content-Type": "application/json" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe.skipIf(!dbAvailable)("/api with real Postgres", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let server: http.Server;
  let base: string;
  let now = Date.parse("2026-03-04T05:00:00Z");

  const put = (id: string, body: unknown): Promise<Res> =>
    fetch(`${base}/api/items/${id}`, {
      method: "PUT",
      headers: JSON_H,
      body: JSON.stringify(body),
    });
  const wear = (id: string, delta: number, today = "2026-03-04"): Promise<Res> =>
    fetch(`${base}/api/items/${id}/wear`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ delta, today }),
    });
  const list = async () =>
    ((await (await fetch(`${base}/api/items`)).json()) as { items: any[] }).items;

  beforeAll(async () => {
    db = await createTestDb();
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.url);
    server = http.createServer(
      createApp({ pool, distDir: "/nonexistent", access: null, log: () => {}, now: () => now }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
    now = Date.parse("2026-03-04T05:00:00Z");
  });

  it("empty DB -> items [] and locations []", async () => {
    expect(await (await fetch(`${base}/api/items`)).json()).toEqual({ items: [] });
    expect(await (await fetch(`${base}/api/locations`)).json()).toEqual({ locations: [] });
  });

  it("GET /api/items -> newest first, ItemRow shape, primary_photo_path null even with a photo row", async () => {
    await put(uuid(1), { name: "older", price: 150000, purchase_date: "2026-01-02" });
    await new Promise((r) => setTimeout(r, 15));
    await put(uuid(2), { name: "newer" });
    await pool.query("insert into item_photos (item_id, storage_path) values ($1, 'a/b.jpg')", [
      uuid(1),
    ]);
    await wear(uuid(1), 1);
    const items = await list();
    expect(items.map((i: { name: string }) => i.name)).toEqual(["newer", "older"]);
    const older = items[1];
    expect(older).toMatchObject({
      id: uuid(1),
      price: 150000,
      purchase_date: "2026-01-02",
      last_worn: "2026-03-04",
      wear_count: 1,
      location_name: null,
      primary_photo_path: null,
    });
    expect(items[0].price).toBeNull();
    expect(items[0].purchase_date).toBeNull();
    expect(new Date(older.created_at).toISOString()).toBe(older.created_at);
    expect(new Date(older.updated_at).toISOString()).toBe(older.updated_at);
  });

  it("GET /api/locations -> names ordered by sort_order, name", async () => {
    await pool.query(
      "insert into locations (name, sort_order) values ('b', 0), ('a', 0), ('z', -1), ('c', 5)",
    );
    expect(await (await fetch(`${base}/api/locations`)).json()).toEqual({
      locations: ["z", "a", "b", "c"],
    });
  });

  it("PUT creates with the client UUID, then updates; created_at unchanged, updated_at bumped", async () => {
    const a = await put(uuid(1), { name: "one" });
    expect(a.status).toBe(200);
    const first = (await a.json()).item;
    expect(first).toMatchObject({ id: uuid(1), name: "one", category: "other", status: "active" });
    await new Promise((r) => setTimeout(r, 15));
    const second = (await (await put(uuid(1), { name: "two", status: "stored" })).json()).item;
    expect(second).toMatchObject({ id: uuid(1), name: "two", status: "stored" });
    expect(second.created_at).toBe(first.created_at);
    expect(second.updated_at > first.updated_at).toBe(true);
  });

  it("PUT twice with the same body is idempotent (one row)", async () => {
    const body = { name: "same", location_name: "Tủ" };
    expect((await put(uuid(1), body)).status).toBe(200);
    expect((await put(uuid(1), body)).status).toBe(200);
    expect(await list()).toHaveLength(1);
    expect((await pool.query("select count(*)::int as n from locations")).rows[0].n).toBe(1);
  });

  it("full round-trip of every field", async () => {
    const body = {
      name: "Áo dài 😀",
      category: "dress",
      status: "lent",
      brand: "Thái Tuấn",
      size: "M",
      material: "lụa",
      price: 1250000,
      purchase_date: "2025-12-31",
      location_name: "Tủ phòng ngủ",
      colors: ["đỏ", "vàng"],
      seasons: ["spring", "winter"],
      tags: ["tết", "😀"],
      notes: "Giặt khô",
    };
    const item = (await (await put(uuid(1), body)).json()).item;
    const { location_name, ...rest } = body;
    expect(item).toMatchObject({ ...rest, location_name, wear_count: 0, last_worn: null });
    expect(item.location_id).toBeTruthy();
    const empty = (
      await (await put(uuid(2), { name: "x", price: null, purchase_date: null })).json()
    ).item;
    expect(empty).toMatchObject({
      price: null,
      purchase_date: null,
      colors: [],
      seasons: [],
      tags: [],
    });
  });

  it("location NFC race: 8 concurrent PUTs with NFC/NFD forms -> one location row", async () => {
    const nfc = "Tủ phòng ngủ";
    const forms = [nfc, nfc.normalize("NFD"), `  ${nfc}  `, `${nfc.normalize("NFD")} `];
    const res = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        put(uuid(i + 1), { name: `i${i}`, location_name: forms[i % 4] }),
      ),
    );
    expect(res.map((r) => r.status)).toEqual(Array(8).fill(200));
    const locs = await pool.query("select name from locations");
    expect(locs.rows).toEqual([{ name: nfc }]);
    expect(new Set((await list()).map((i: { location_id: string }) => i.location_id)).size).toBe(1);
  });

  it("location_name null or '' -> location_id null; an existing location is reused", async () => {
    const a = (await (await put(uuid(1), { name: "a", location_name: "" })).json()).item;
    expect(a.location_id).toBeNull();
    const b = (await (await put(uuid(2), { name: "b", location_name: "Hộp" })).json()).item;
    const c = (await (await put(uuid(3), { name: "c", location_name: "Hộp" })).json()).item;
    expect(c.location_id).toBe(b.location_id);
    const d = (await (await put(uuid(2), { name: "b", location_name: null })).json()).item;
    expect(d.location_id).toBeNull();
  });

  it("a failing item insert rolls back a newly created location", async () => {
    const values = {
      name: "x",
      category: "not-a-category",
      status: "active",
      brand: null,
      size: null,
      material: null,
      price: null,
      purchase_date: null,
      location_name: "Mới",
      colors: [],
      seasons: [],
      tags: [],
      notes: null,
    };
    await expect(saveItem(pool, uuid(1), values)).rejects.toMatchObject({ code: "22P02" });
    expect((await pool.query("select count(*)::int as n from locations")).rows[0].n).toBe(0);
  });

  it("DELETE -> 204, item and wear logs gone; again and for a never-existing id -> 204", async () => {
    await put(uuid(1), { name: "a" });
    await wear(uuid(1), 1);
    const del = () => fetch(`${base}/api/items/${uuid(1)}`, { method: "DELETE" });
    expect((await del()).status).toBe(204);
    expect((await del()).status).toBe(204);
    expect((await fetch(`${base}/api/items/${uuid(9)}`, { method: "DELETE" })).status).toBe(204);
    expect(await list()).toEqual([]);
    expect((await pool.query("select count(*)::int as n from wear_logs")).rows[0].n).toBe(0);
  });

  it("wear +1 -> count 1, last_worn today, already false; +1 again -> already true, count 1", async () => {
    await put(uuid(1), { name: "a" });
    expect(await (await wear(uuid(1), 1)).json()).toEqual({
      wear_count: 1,
      last_worn: "2026-03-04",
      already: false,
    });
    expect(await (await wear(uuid(1), 1)).json()).toEqual({
      wear_count: 1,
      last_worn: "2026-03-04",
      already: true,
    });
  });

  it("wear -1 removes the latest day; to zero -> last_worn null; at zero -> unchanged", async () => {
    await put(uuid(1), { name: "a" });
    await wear(uuid(1), 1, "2026-03-03");
    await wear(uuid(1), 1, "2026-03-04");
    expect(await (await wear(uuid(1), -1)).json()).toEqual({
      wear_count: 1,
      last_worn: "2026-03-03",
      already: false,
    });
    expect(await (await wear(uuid(1), -1)).json()).toEqual({
      wear_count: 0,
      last_worn: null,
      already: false,
    });
    const again = await wear(uuid(1), -1);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ wear_count: 0, last_worn: null, already: false });
  });

  it("wear on an unknown id: +1 -> 404 (FK), -1 -> 404", async () => {
    for (const delta of [1, -1]) {
      const res = await wear(uuid(9), delta);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_found");
    }
  });

  it("server enum constants equal pg_enum (in order)", async () => {
    const q = async (t: string) =>
      (
        await pool.query(
          "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1 order by e.enumsortorder",
          [t],
        )
      ).rows.map((r) => r.enumlabel);
    expect(await q("item_category")).toEqual(CATEGORIES);
    expect(await q("item_status")).toEqual(STATUSES);
  });

  it("every SEASONS value passes the items.seasons check", async () => {
    for (const s of SEASONS) {
      const res = await put(uuid(1), { name: "a", seasons: [s] });
      expect(res.status).toBe(200);
    }
  });
});
