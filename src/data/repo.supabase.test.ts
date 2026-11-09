import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fakeSupabase";
import type { Database } from "@/types/database";
import type { Item } from "@/types/item";
import { itemToRow, rowToItem } from "./mappers";
import { resizeImage, urlToBlob } from "./photos";
import { createSupabaseRepo } from "./repo";

vi.mock("./photos", () => ({ resizeImage: vi.fn(), urlToBlob: vi.fn() }));

type ItemRow = Database["public"]["Views"]["tudo_items_with_stats"]["Row"];

const ID = "item-1";
const UUID = "00000000-0000-4000-8000-000000000001";
const NEW_PATH = `user-1/${ID}/${UUID}.jpg`;
const ITEMS = "tudo_items_with_stats";

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: ID,
  name: "Áo sơ mi",
  category: "Áo",
  status: "Đang dùng",
  colors: [],
  seasons: [],
  brand: "",
  size: "",
  location: "",
  price: 0,
  purchaseDate: "",
  material: "",
  tags: [],
  notes: "",
  photo: "",
  wearCount: 0,
  lastWorn: "",
  createdAt: "",
  ...over,
});

const makeRow = (over: Partial<ItemRow> = {}): ItemRow =>
  ({
    id: ID,
    name: "Áo sơ mi",
    category: "top",
    status: "active",
    wear_count: 0,
    primary_photo_path: null,
    ...over,
  }) as ItemRow;

const resized = new Blob(["resized"]);
let fake: FakeSupabase;
const make = () => createSupabaseRepo(fake.client as unknown as SupabaseClient<Database>);
const methods = (table: string) => fake.calls.filter((c) => c.table === table).map((c) => c.method);
const call = (table: string, method: string, ...args: unknown[]) => ({ table, method, args });

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(urlToBlob)
    .mockReset()
    .mockResolvedValue(new Blob(["src"]));
  vi.mocked(resizeImage).mockReset().mockResolvedValue({ blob: resized, width: 800, height: 600 });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSupabaseRepo", () => {
  test("mode is supabase", () => {
    expect(make().mode).toBe("supabase");
  });

  describe("list", () => {
    test("selects items newest first and signs all photo paths in one call", async () => {
      fake.push({
        data: [
          makeRow({ id: "a", primary_photo_path: "user-1/a/x.jpg" }),
          makeRow({ id: "b", primary_photo_path: "user-1/b/y.jpg" }),
          makeRow({ id: "c" }),
        ],
      });
      fake.storage.createSignedUrls.mockResolvedValue({
        data: [
          { path: "user-1/a/x.jpg", signedUrl: "https://s/a" },
          { path: "user-1/b/y.jpg", signedUrl: "https://s/b" },
        ],
        error: null,
      });
      const items = await make().list();
      expect(fake.calls).toEqual([
        call(ITEMS, "from"),
        call(ITEMS, "select", "*"),
        call(ITEMS, "order", "created_at", { ascending: false }),
      ]);
      expect(fake.client.storage.from).toHaveBeenCalledWith("wardrobe");
      expect(fake.storage.createSignedUrls).toHaveBeenCalledWith(
        ["user-1/a/x.jpg", "user-1/b/y.jpg"],
        3600,
      );
      expect(items.map((i) => i.photo)).toEqual(["https://s/a", "https://s/b", ""]);
      expect(items[0].photoPath).toBe("user-1/a/x.jpg");
    });

    test("does not call storage when no item has a photo", async () => {
      fake.push({ data: [makeRow()] });
      expect(await make().list()).toHaveLength(1);
      expect(fake.storage.createSignedUrls).not.toHaveBeenCalled();
      expect(fake.calls).toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }));
    });

    test("uses an empty photo for a path that got no signed URL", async () => {
      fake.push({
        data: [
          makeRow({ id: "a", primary_photo_path: "p/a.jpg" }),
          makeRow({ id: "b", primary_photo_path: "p/b.jpg" }),
        ],
      });
      fake.storage.createSignedUrls.mockResolvedValue({
        data: [{ path: "p/a.jpg", signedUrl: null }],
        error: null,
      });
      expect((await make().list()).map((i) => i.photo)).toEqual(["", ""]);
      expect(fake.calls).toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }));
    });

    test("returns [] when data is null", async () => {
      fake.push({ data: null });
      expect(await make().list()).toEqual([]);
      expect(fake.calls).toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }));
    });

    test("throws the query error", async () => {
      const err = { code: "42501" };
      fake.push({ error: err });
      await expect(make().list()).rejects.toBe(err);
      expect(fake.calls).toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }));
    });

    test("throws the signing error", async () => {
      const err = { message: "sign failed" };
      fake.push({ data: [makeRow({ primary_photo_path: "p/a.jpg" })] });
      fake.storage.createSignedUrls.mockResolvedValue({ data: null, error: err });
      await expect(make().list()).rejects.toBe(err);
      expect(fake.calls).toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }));
    });
  });

  describe("locations", () => {
    test("orders by sort_order then name and returns names", async () => {
      fake.push({ data: [{ name: "Tủ phòng ngủ" }, { name: "Kệ giày" }] });
      expect(await make().locations()).toEqual(["Tủ phòng ngủ", "Kệ giày"]);
      expect(fake.calls).toEqual([
        call("tudo_locations", "from"),
        call("tudo_locations", "select", "name"),
        call("tudo_locations", "order", "sort_order"),
        call("tudo_locations", "order", "name"),
      ]);
    });

    test("returns [] when data is null", async () => {
      fake.push({ data: null });
      expect(await make().locations()).toEqual([]);
      expect(fake.calls).toEqual([
        call("tudo_locations", "from"),
        call("tudo_locations", "select", "name"),
        call("tudo_locations", "order", "sort_order"),
        call("tudo_locations", "order", "name"),
      ]);
    });

    test("throws the query error", async () => {
      const err = { code: "42501" };
      fake.push({ error: err });
      await expect(make().locations()).rejects.toBe(err);
      expect(fake.calls).toEqual([
        call("tudo_locations", "from"),
        call("tudo_locations", "select", "name"),
        call("tudo_locations", "order", "sort_order"),
        call("tudo_locations", "order", "name"),
      ]);
    });
  });

  describe("save", () => {
    test("with a blank location skips the lookup and upserts location_id null", async () => {
      const item = makeItem({ location: "  " });
      fake.push({ data: { id: ID } }, { data: makeRow() });
      await make().save(item);
      expect(methods("tudo_locations")).toEqual([]);
      expect(fake.calls).toContainEqual(call("tudo_items", "upsert", itemToRow(item, null)));
      expect(fake.pending()).toBe(0);
    });

    test("reuses an existing location matched by trimmed name", async () => {
      const item = makeItem({ location: "  Tủ phòng ngủ " });
      fake.push({ data: { id: "loc-1" } }, { data: { id: ID } }, { data: makeRow() });
      await make().save(item);
      expect(fake.calls).toContainEqual(call("tudo_locations", "eq", "name", "Tủ phòng ngủ"));
      expect(methods("tudo_locations")).toContain("maybeSingle");
      expect(methods("tudo_locations")).not.toContain("insert");
      expect(fake.calls).toContainEqual(call("tudo_items", "upsert", itemToRow(item, "loc-1")));
      expect(fake.pending()).toBe(0);
    });

    test("creates a missing location", async () => {
      const item = makeItem({ location: "Kệ mới" });
      fake.push(
        { data: null },
        { data: { id: "loc-new" } },
        { data: { id: ID } },
        { data: makeRow() },
      );
      await make().save(item);
      expect(fake.calls).toContainEqual(call("tudo_locations", "insert", { name: "Kệ mới" }));
      expect(methods("tudo_locations")).toEqual([
        "from",
        "select",
        "eq",
        "maybeSingle",
        "from",
        "insert",
        "select",
        "single",
      ]);
      expect(fake.calls).toContainEqual(call("tudo_items", "upsert", itemToRow(item, "loc-new")));
      expect(fake.pending()).toBe(0);
    });

    test("throws when the location lookup fails", async () => {
      const err = { message: "lookup" };
      fake.push({ error: err });
      await expect(make().save(makeItem({ location: "X" }))).rejects.toBe(err);
      expect(methods("tudo_items")).toEqual([]);
    });

    test("throws when creating the location fails", async () => {
      const err = { message: "insert" };
      fake.push({ data: null }, { error: err });
      await expect(make().save(makeItem({ location: "X" }))).rejects.toBe(err);
      expect(methods("tudo_items")).toEqual([]);
    });

    test("upserts the mapped row and returns the re-fetched item with a signed photo URL", async () => {
      const item = makeItem();
      const row = makeRow({ primary_photo_path: `user-1/${ID}/p.jpg` });
      fake.push({ data: { id: ID } }, { data: row });
      fake.storage.createSignedUrls.mockResolvedValue({
        data: [{ path: `user-1/${ID}/p.jpg`, signedUrl: "https://signed" }],
        error: null,
      });
      const saved = await make().save(item);
      expect(fake.calls).toEqual([
        call("tudo_items", "from"),
        call("tudo_items", "upsert", itemToRow(item, null)),
        call("tudo_items", "select", "id"),
        call("tudo_items", "single"),
        call(ITEMS, "from"),
        call(ITEMS, "select", "*"),
        call(ITEMS, "eq", "id", ID),
        call(ITEMS, "single"),
      ]);
      expect(saved).toEqual(rowToItem(row, "https://signed"));
      expect(fake.pending()).toBe(0);
    });

    test("throws the upsert error and fetches nothing", async () => {
      const err = { code: "23505" };
      fake.push({ error: err });
      await expect(make().save(makeItem())).rejects.toBe(err);
      expect(methods(ITEMS)).toEqual([]);
      expect(fake.pending()).toBe(0);
    });

    test("throws the re-fetch error after the item was stored (records current behaviour)", async () => {
      const err = { message: "refetch" };
      fake.push({ data: { id: ID } }, { error: err });
      await expect(make().save(makeItem())).rejects.toBe(err);
      expect(methods("tudo_items")).toContain("upsert");
    });

    describe("photo", () => {
      test("data: URL is resized, uploaded to {user}/{item}/{uuid}.jpg and replaces the old photo", async () => {
        const src = new Blob(["src"]);
        vi.mocked(urlToBlob).mockResolvedValue(src);
        fake.push(
          { data: { id: ID } },
          { data: [{ id: "ph-old", storage_path: "user-1/item-1/old.jpg" }] },
          { data: null },
          { data: null },
          { data: makeRow() },
        );
        await make().save(makeItem({ photo: "data:image/png;base64,AAA" }));
        expect(urlToBlob).toHaveBeenCalledWith("data:image/png;base64,AAA");
        expect(resizeImage).toHaveBeenCalledWith(src);
        expect(fake.client.storage.from).toHaveBeenCalledWith("wardrobe");
        expect(fake.storage.upload).toHaveBeenCalledWith(NEW_PATH, resized, {
          contentType: "image/jpeg",
          upsert: false,
        });
        expect(fake.storage.remove).toHaveBeenCalledWith(["user-1/item-1/old.jpg"]);
        expect(fake.calls).toContainEqual(call("tudo_item_photos", "select", "id, storage_path"));
        expect(fake.calls).toContainEqual(call("tudo_item_photos", "eq", "item_id", ID));
        expect(methods("tudo_item_photos")).toEqual([
          "from",
          "select",
          "eq",
          "from",
          "delete",
          "eq",
          "from",
          "insert",
        ]);
        expect(fake.calls).toContainEqual(
          call("tudo_item_photos", "insert", {
            item_id: ID,
            storage_path: NEW_PATH,
            is_primary: true,
            width: 800,
            height: 600,
          }),
        );
        expect(fake.pending()).toBe(0);
      });

      test("blob: URL is uploaded too", async () => {
        fake.push({ data: { id: ID } }, { data: [] }, { data: null }, { data: makeRow() });
        await make().save(makeItem({ photo: "blob:http://localhost/abc" }));
        expect(urlToBlob).toHaveBeenCalledWith("blob:http://localhost/abc");
        expect(fake.storage.upload).toHaveBeenCalledTimes(1);
        expect(fake.storage.upload).toHaveBeenCalledWith(NEW_PATH, resized, {
          contentType: "image/jpeg",
          upsert: false,
        });
        expect(fake.calls).toContainEqual(
          call("tudo_item_photos", "insert", {
            item_id: ID,
            storage_path: NEW_PATH,
            is_primary: true,
            width: 800,
            height: 600,
          }),
        );
      });

      test("upload with no previous photo skips storage.remove", async () => {
        fake.push({ data: { id: ID } }, { data: [] }, { data: null }, { data: makeRow() });
        await make().save(makeItem({ photo: "data:image/png;base64,AAA" }));
        expect(fake.storage.remove).not.toHaveBeenCalled();
        expect(methods("tudo_item_photos")).toEqual(["from", "select", "eq", "from", "insert"]);
      });

      test("upload error throws and writes no photo row", async () => {
        const err = { message: "upload" };
        fake.storage.upload.mockResolvedValue({ data: null, error: err });
        fake.push({ data: { id: ID } });
        await expect(make().save(makeItem({ photo: "data:image/png;base64,AAA" }))).rejects.toBe(
          err,
        );
        expect(methods("tudo_item_photos")).toEqual([]);
      });

      test("photo-row insert error removes the uploaded file and throws", async () => {
        const err = { message: "insert" };
        fake.push({ data: { id: ID } }, { data: [] }, { error: err });
        await expect(make().save(makeItem({ photo: "data:image/png;base64,AAA" }))).rejects.toBe(
          err,
        );
        expect(fake.storage.remove).toHaveBeenCalledWith([NEW_PATH]);
        expect(fake.calls).toContainEqual(
          call("tudo_item_photos", "insert", {
            item_id: ID,
            storage_path: NEW_PATH,
            is_primary: true,
            width: 800,
            height: 600,
          }),
        );
        expect(fake.pending()).toBe(0);
      });

      test("throws 'Chưa đăng nhập' when there is no signed-in user", async () => {
        fake = createFakeSupabase(null);
        fake.push({ data: { id: ID } });
        const item = makeItem({ photo: "data:image/png;base64,AAA" });
        await expect(make().save(item)).rejects.toThrow("Chưa đăng nhập");
        expect(fake.storage.upload).not.toHaveBeenCalled();
        expect(fake.calls).toContainEqual(call("tudo_items", "upsert", itemToRow(item, null)));
        expect(methods("tudo_item_photos")).toEqual([]);
      });

      test("a cleared photo deletes the item's photo rows and files", async () => {
        fake.push(
          { data: { id: ID } },
          { data: [{ id: "ph", storage_path: `user-1/${ID}/p.jpg` }] },
          { data: null },
          { data: makeRow() },
        );
        await make().save(makeItem({ photo: "", photoPath: `user-1/${ID}/p.jpg` }));
        expect(fake.storage.remove).toHaveBeenCalledWith([`user-1/${ID}/p.jpg`]);
        expect(fake.calls).toContainEqual(call("tudo_item_photos", "delete"));
        expect(fake.storage.upload).not.toHaveBeenCalled();
        expect(fake.pending()).toBe(0);
      });

      test("removing photos throws when listing photo rows fails", async () => {
        const err = { message: "list" };
        fake.push({ data: { id: ID } }, { error: err });
        await expect(
          make().save(makeItem({ photo: "", photoPath: `user-1/${ID}/p.jpg` })),
        ).rejects.toBe(err);
        expect(fake.calls).toContainEqual(call("tudo_item_photos", "eq", "item_id", ID));
        expect(methods("tudo_item_photos")).not.toContain("delete");
      });

      test("a duplicated item's photo is copied into the new item's folder", async () => {
        fake.push({ data: { id: ID } }, { data: null }, { data: makeRow() });
        await make().save(
          makeItem({ photo: "https://signed", photoPath: "user-1/other-item/p.jpg" }),
        );
        expect(fake.storage.copy).toHaveBeenCalledWith("user-1/other-item/p.jpg", NEW_PATH);
        expect(fake.calls).toContainEqual(
          call("tudo_item_photos", "insert", {
            item_id: ID,
            storage_path: NEW_PATH,
            is_primary: true,
          }),
        );
      });

      test("copy error throws", async () => {
        const err = { message: "copy" };
        fake.storage.copy.mockResolvedValue({ data: null, error: err });
        fake.push({ data: { id: ID } });
        await expect(
          make().save(makeItem({ photo: "https://signed", photoPath: "user-1/other/p.jpg" })),
        ).rejects.toBe(err);
        expect(methods("tudo_item_photos")).toEqual([]);
      });

      test("copy row insert error throws and leaves the copied file (records current behaviour)", async () => {
        const err = { message: "insert" };
        fake.push({ data: { id: ID } }, { error: err });
        await expect(
          make().save(makeItem({ photo: "https://signed", photoPath: "user-1/other/p.jpg" })),
        ).rejects.toBe(err);
        expect(fake.storage.remove).not.toHaveBeenCalled();
        expect(fake.calls).toContainEqual(
          call("tudo_item_photos", "insert", {
            item_id: ID,
            storage_path: NEW_PATH,
            is_primary: true,
          }),
        );
      });

      test("an external http URL is uploaded best effort", async () => {
        fake.push({ data: { id: ID } }, { data: [] }, { data: null }, { data: makeRow() });
        await make().save(makeItem({ photo: "https://example.com/a.jpg" }));
        expect(urlToBlob).toHaveBeenCalledWith("https://example.com/a.jpg");
        expect(fake.storage.upload).toHaveBeenCalledWith(NEW_PATH, resized, expect.anything());
        expect(fake.calls).toContainEqual(
          call("tudo_item_photos", "insert", {
            item_id: ID,
            storage_path: NEW_PATH,
            is_primary: true,
            width: 800,
            height: 600,
          }),
        );
      });

      test("a failing external URL is ignored and the item is still saved", async () => {
        vi.mocked(urlToBlob).mockRejectedValue(new Error("CORS"));
        const row = makeRow();
        fake.push({ data: { id: ID } }, { data: row });
        expect(await make().save(makeItem({ photo: "https://example.com/a.jpg" }))).toEqual(
          rowToItem(row),
        );
        expect(fake.storage.upload).not.toHaveBeenCalled();
        expect(methods("tudo_item_photos")).toEqual([]);
        expect(fake.calls).toContainEqual(call(ITEMS, "eq", "id", ID));
      });

      test("an owned photo is left untouched", async () => {
        fake.push({ data: { id: ID } }, { data: makeRow() });
        await make().save(makeItem({ photo: "https://signed", photoPath: `user-1/${ID}/p.jpg` }));
        expect(fake.storage.upload).not.toHaveBeenCalled();
        expect(fake.storage.copy).not.toHaveBeenCalled();
        expect(fake.storage.remove).not.toHaveBeenCalled();
        expect(methods("tudo_item_photos")).toEqual([]);
      });

      test("no photo and no photoPath is left untouched", async () => {
        fake.push({ data: { id: ID } }, { data: makeRow() });
        await make().save(makeItem());
        expect(methods("tudo_item_photos")).toEqual([]);
        expect(fake.storage.upload).not.toHaveBeenCalled();
      });
    });
  });

  describe("remove", () => {
    test("deletes photo rows, then files, then the item", async () => {
      fake.push(
        { data: [{ id: "ph", storage_path: "user-1/item-1/p.jpg" }] },
        { data: null },
        { data: null },
      );
      await make().remove(makeItem());
      expect(fake.storage.remove).toHaveBeenCalledWith(["user-1/item-1/p.jpg"]);
      expect(fake.calls).toEqual([
        call("tudo_item_photos", "from"),
        call("tudo_item_photos", "select", "id, storage_path"),
        call("tudo_item_photos", "eq", "item_id", ID),
        call("tudo_item_photos", "from"),
        call("tudo_item_photos", "delete"),
        call("tudo_item_photos", "eq", "item_id", ID),
        call("tudo_items", "from"),
        call("tudo_items", "delete"),
        call("tudo_items", "eq", "id", ID),
      ]);
      expect(fake.pending()).toBe(0);
    });

    test("throws the item delete error after photos are gone (records current behaviour)", async () => {
      const err = { message: "delete" };
      fake.push({ data: [{ id: "ph", storage_path: "p.jpg" }] }, { data: null }, { error: err });
      await expect(make().remove(makeItem())).rejects.toBe(err);
      expect(fake.storage.remove).toHaveBeenCalled();
      const photosDelete = fake.calls.findIndex(
        (c) => c.table === "tudo_item_photos" && c.method === "delete",
      );
      const itemEq = fake.calls.findIndex((c) => c.table === "tudo_items" && c.method === "eq");
      expect(photosDelete).toBeGreaterThan(-1);
      expect(photosDelete).toBeLessThan(itemEq);
      expect(fake.calls[itemEq]).toEqual(call("tudo_items", "eq", "id", ID));
    });

    test("ignores storage and photo-row delete errors (records current behaviour)", async () => {
      fake.storage.remove.mockResolvedValue({ data: null, error: { message: "storage" } });
      fake.push(
        { data: [{ id: "ph", storage_path: "p.jpg" }] },
        { error: { message: "rows" } },
        { data: null },
      );
      await expect(make().remove(makeItem())).resolves.toBeUndefined();
      expect(fake.calls).toContainEqual(call("tudo_items", "delete"));
    });
  });

  describe("wear", () => {
    test("+1 logs today's local date (UTC+7) ignoring duplicates, returns the stats and already=false", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-06T17:30:00Z"));
      fake.push({ data: [{ id: "log-1" }] }, { data: { wear_count: 3, last_worn: "2026-11-07" } });
      expect(await make().wear(makeItem(), 1)).toEqual({
        wearCount: 3,
        lastWorn: "2026-11-07",
        already: false,
      });
      expect(fake.calls).toEqual([
        call("tudo_wear_logs", "from"),
        call(
          "tudo_wear_logs",
          "upsert",
          { item_id: ID, worn_on: "2026-11-07" },
          { onConflict: "item_id,worn_on", ignoreDuplicates: true },
        ),
        call("tudo_wear_logs", "select", "id"),
        call(ITEMS, "from"),
        call(ITEMS, "select", "wear_count, last_worn"),
        call(ITEMS, "eq", "id", ID),
        call(ITEMS, "single"),
      ]);
    });

    test("+1 returns already=true when today's log already exists", async () => {
      fake.push({ data: [] }, { data: { wear_count: 3, last_worn: "2026-11-07" } });
      expect(await make().wear(makeItem(), 1)).toEqual({
        wearCount: 3,
        lastWorn: "2026-11-07",
        already: true,
      });
    });

    test("+1 treats a null upsert result as already", async () => {
      fake.push({ data: null }, { data: { wear_count: 3, last_worn: "2026-11-07" } });
      expect((await make().wear(makeItem(), 1)).already).toBe(true);
    });

    test("+1 throws the upsert error", async () => {
      const err = { message: "upsert" };
      fake.push({ error: err });
      await expect(make().wear(makeItem(), 1)).rejects.toBe(err);
      expect(methods(ITEMS)).toEqual([]);
    });

    test("-1 deletes the latest wear log and returns the stats", async () => {
      fake.push(
        { data: { id: "log-1" } },
        { data: null },
        { data: { wear_count: 1, last_worn: "2026-11-01" } },
      );
      expect(await make().wear(makeItem(), -1)).toEqual({
        wearCount: 1,
        lastWorn: "2026-11-01",
        already: false,
      });
      expect(fake.calls).toEqual([
        call("tudo_wear_logs", "from"),
        call("tudo_wear_logs", "select", "id"),
        call("tudo_wear_logs", "eq", "item_id", ID),
        call("tudo_wear_logs", "order", "worn_on", { ascending: false }),
        call("tudo_wear_logs", "limit", 1),
        call("tudo_wear_logs", "maybeSingle"),
        call("tudo_wear_logs", "from"),
        call("tudo_wear_logs", "delete"),
        call("tudo_wear_logs", "eq", "id", "log-1"),
        call(ITEMS, "from"),
        call(ITEMS, "select", "wear_count, last_worn"),
        call(ITEMS, "eq", "id", ID),
        call(ITEMS, "single"),
      ]);
    });

    test("-1 with no wear log deletes nothing", async () => {
      fake.push({ data: null }, { data: { wear_count: 0, last_worn: null } });
      await make().wear(makeItem(), -1);
      expect(methods("tudo_wear_logs")).not.toContain("delete");
    });

    test("-1 throws the lookup error", async () => {
      const err = { message: "lookup" };
      fake.push({ error: err });
      await expect(make().wear(makeItem(), -1)).rejects.toBe(err);
      expect(fake.calls).toContainEqual(
        call("tudo_wear_logs", "order", "worn_on", { ascending: false }),
      );
      expect(methods("tudo_wear_logs")).not.toContain("delete");
      expect(methods(ITEMS)).toEqual([]);
    });

    test("-1 throws the delete error", async () => {
      const err = { message: "delete" };
      fake.push({ data: { id: "log-1" } }, { error: err });
      await expect(make().wear(makeItem(), -1)).rejects.toBe(err);
      expect(methods(ITEMS)).toEqual([]);
    });

    test("returns 0 and an empty string when stats are null", async () => {
      fake.push({ data: null }, { data: { wear_count: null, last_worn: null } });
      expect(await make().wear(makeItem(), 1)).toEqual({
        wearCount: 0,
        lastWorn: "",
        already: true,
      });
      expect(fake.calls).toContainEqual(call(ITEMS, "select", "wear_count, last_worn"));
    });

    test("throws the stats query error", async () => {
      const err = { message: "stats" };
      fake.push({ data: null }, { error: err });
      await expect(make().wear(makeItem(), 1)).rejects.toBe(err);
      expect(fake.calls).toContainEqual(call(ITEMS, "select", "wear_count, last_worn"));
    });
  });
});
