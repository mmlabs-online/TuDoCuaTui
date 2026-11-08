import { describe, expect, test } from "vitest";
import type { Database } from "@/types/database";
import type { Item } from "@/types/item";
import {
  CATEGORY_FROM_DB,
  CATEGORY_TO_DB,
  COLOR_FROM_DB,
  COLOR_TO_DB,
  SEASON_FROM_DB,
  SEASON_TO_DB,
  STATUS_FROM_DB,
  STATUS_TO_DB,
  isUuid,
  itemToRow,
  rowToItem,
} from "./mappers";

type ItemRow = Database["public"]["Views"]["tudo_items_with_stats"]["Row"];

const UUID = "123e4567-e89b-12d3-a456-426614174000";

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: "",
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

// Views can return null at runtime even where the generated types say non-null.
const nullRow = {
  id: null,
  user_id: null,
  name: null,
  category: null,
  status: null,
  brand: null,
  size: null,
  material: null,
  price: null,
  purchase_date: null,
  location_id: null,
  colors: null,
  seasons: null,
  tags: null,
  notes: null,
  created_at: null,
  updated_at: null,
  wear_count: null,
  last_worn: null,
  location_name: null,
  primary_photo_path: null,
} as unknown as ItemRow;

const roundTrip = (name: string, to: Record<string, string>, from: Record<string, string>) => {
  test(`${name} round trip for every label`, () => {
    const labels = Object.keys(to);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(from[to[l]]).toBe(l);
    expect(Object.keys(from)).toHaveLength(labels.length);
  });
};

roundTrip("CATEGORY", CATEGORY_TO_DB, CATEGORY_FROM_DB);
roundTrip("STATUS", STATUS_TO_DB, STATUS_FROM_DB);
roundTrip("SEASON", SEASON_TO_DB, SEASON_FROM_DB);
roundTrip("COLOR", COLOR_TO_DB, COLOR_FROM_DB);

describe("rowToItem / itemToRow", () => {
  test("item → row → item keeps every label", () => {
    for (const category of Object.keys(CATEGORY_TO_DB)) {
      const item = makeItem({
        category,
        status: "Cất kho",
        colors: Object.keys(COLOR_TO_DB),
        seasons: Object.keys(SEASON_TO_DB),
      });
      const row = itemToRow(item, null);
      const back = rowToItem({
        ...nullRow,
        category: row.category as ItemRow["category"],
        status: row.status as ItemRow["status"],
        colors: row.colors as string[],
        seasons: row.seasons as ItemRow["seasons"],
      });
      expect(back.category).toBe(category);
      expect(back.status).toBe(item.status);
      expect(back.colors).toEqual(item.colors);
      expect(back.seasons).toEqual(item.seasons);
    }
    for (const status of Object.keys(STATUS_TO_DB) as Item["status"][]) {
      const row = itemToRow(makeItem({ status }), null);
      expect(rowToItem({ ...nullRow, status: row.status as ItemRow["status"] }).status).toBe(
        status,
      );
    }
  });

  test("rowToItem with all nullable fields null", () => {
    expect(rowToItem(nullRow)).toEqual({
      id: "",
      name: "",
      category: "Khác",
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
      photoPath: undefined,
      wearCount: 0,
      lastWorn: "",
      createdAt: "",
    });
  });

  test("rowToItem keeps unknown color/season ids as-is", () => {
    const item = rowToItem({
      ...nullRow,
      colors: ["den", "mystery"],
      seasons: ["spring", "monsoon" as never],
    });
    expect(item.colors).toEqual(["Đen", "mystery"]);
    expect(item.seasons).toEqual(["Xuân", "monsoon"]);
  });

  test("rowToItem converts a numeric-string price", () => {
    expect(rowToItem({ ...nullRow, price: "250000" as never }).price).toBe(250000);
  });

  test("rowToItem passes the photo URL through", () => {
    expect(
      rowToItem({ ...nullRow, primary_photo_path: "u/i/p.jpg" }, "https://x/y.jpg"),
    ).toMatchObject({ photo: "https://x/y.jpg", photoPath: "u/i/p.jpg" });
  });

  test("itemToRow trims text and nulls empty strings", () => {
    const row = itemToRow(
      makeItem({ name: "  Áo thun trắng  ", brand: "  ", size: " ", material: "", notes: "   " }),
      null,
    );
    expect(row.name).toBe("Áo thun trắng");
    expect(row.brand).toBeNull();
    expect(row.size).toBeNull();
    expect(row.material).toBeNull();
    expect(row.notes).toBeNull();
    expect(itemToRow(makeItem({ brand: " Đồng Xanh ", notes: "Mặc đi chơi" }), null)).toMatchObject(
      { brand: "Đồng Xanh", notes: "Mặc đi chơi" },
    );
  });

  test("itemToRow price: 0 and negative → null, decimals rounded", () => {
    expect(itemToRow(makeItem({ price: 0 }), null).price).toBeNull();
    expect(itemToRow(makeItem({ price: -5 }), null).price).toBeNull();
    expect(itemToRow(makeItem({ price: 1999.6 }), null).price).toBe(2000);
  });

  test("itemToRow purchase date: empty → null, ISO → first 10 chars", () => {
    expect(itemToRow(makeItem({ purchaseDate: "" }), null).purchase_date).toBeNull();
    expect(itemToRow(makeItem({ purchaseDate: "2026-03-05T10:20:30Z" }), null).purchase_date).toBe(
      "2026-03-05",
    );
  });

  test("itemToRow unknown category/status fall back to other/active", () => {
    const row = itemToRow(makeItem({ category: "Lạ", status: "Lạ" as never }), null);
    expect(row.category).toBe("other");
    expect(row.status).toBe("active");
  });

  test("itemToRow drops unknown seasons, keeps unknown colors", () => {
    const row = itemToRow(makeItem({ seasons: ["Xuân", "Mưa"], colors: ["Đen", "Lạ"] }), null);
    expect(row.seasons).toEqual(["spring"]);
    expect(row.colors).toEqual(["den", "Lạ"]);
  });

  test("itemToRow sets id only for UUIDs", () => {
    expect(itemToRow(makeItem({ id: "d1" }), null)).not.toHaveProperty("id");
    expect(itemToRow(makeItem({ id: "" }), null)).not.toHaveProperty("id");
    expect(itemToRow(makeItem({ id: UUID }), null).id).toBe(UUID);
    expect(itemToRow(makeItem({ id: UUID.toUpperCase() }), null).id).toBe(UUID.toUpperCase());
  });

  test("itemToRow passes locationId through (string and null)", () => {
    expect(itemToRow(makeItem(), UUID).location_id).toBe(UUID);
    expect(itemToRow(makeItem(), null).location_id).toBeNull();
  });
});

test("isUuid accepts UUIDs and rejects other strings", () => {
  expect(isUuid(UUID)).toBe(true);
  expect(isUuid(UUID.toUpperCase())).toBe(true);
  expect(isUuid("d1")).toBe(false);
  expect(isUuid("")).toBe(false);
  expect(isUuid(`${UUID}x`)).toBe(false);
});
