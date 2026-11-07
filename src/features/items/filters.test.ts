import { describe, expect, test } from "vitest";
import type { Item } from "@/types/item";
import { ageInDays, isStale, matchesFilters, sortItems, type ItemFilters } from "./filters";

const DAY = 86400000;
const NOW = Date.parse("2026-11-07T12:00:00+07:00");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: "a",
  name: "Áo",
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

const noFilters: ItemFilters = { status: "", season: "", location: "", color: "", special: "" };
const match = (i: Item, query = "", category = "Tất cả", f: Partial<ItemFilters> = {}) =>
  matchesFilters(i, { query, category, filters: { ...noFilters, ...f } }, NOW);

describe("ageInDays", () => {
  test("returns 999 for an empty date", () => {
    expect(ageInDays("", NOW)).toBe(999);
  });

  test("floors whole days for ISO timestamps", () => {
    const t = "2026-11-06T00:00:00Z";
    const base = Date.parse(t);
    expect(ageInDays(t, base + DAY - 60000)).toBe(0);
    expect(ageInDays(t, base + DAY)).toBe(1);
  });

  test("parses YYYY-MM-DD as UTC midnight (records current behaviour)", () => {
    expect(ageInDays("2026-11-07", Date.parse("2026-11-07T01:00:00+07:00"))).toBe(-1);
    expect(ageInDays("2026-11-07", Date.parse("2026-11-07T08:00:00+07:00"))).toBe(0);
    const iso = "2026-11-07T01:00:00+07:00";
    expect(ageInDays(iso, Date.parse(iso) + 3600000)).toBe(0);
  });
});

describe("isStale", () => {
  test("is false at 89 days", () => {
    expect(isStale({ lastWorn: ago(89) }, NOW)).toBe(false);
  });
  test("is true at exactly 90 days", () => {
    expect(isStale({ lastWorn: ago(90) }, NOW)).toBe(true);
  });
  test("is true at 91 days", () => {
    expect(isStale({ lastWorn: ago(91) }, NOW)).toBe(true);
  });
  test("is true for an item never worn", () => {
    expect(isStale({ lastWorn: "" }, NOW)).toBe(true);
  });
});

describe("matchesFilters", () => {
  test('empty query and "Tất cả" match everything', () => {
    expect(match(makeItem())).toBe(true);
  });

  test("query matches name, brand, colors and notes, case-insensitively", () => {
    const i = makeItem({ name: "áo len", brand: "Zara", colors: ["Xanh lá"], notes: "Ấm áp" });
    expect(match(i, "ÁO")).toBe(true);
    expect(match(i, "zara")).toBe(true);
    expect(match(i, "XANH")).toBe(true);
    expect(match(i, "ấm")).toBe(true);
    expect(match(i, "quần")).toBe(false);
  });

  test("query is diacritic- and case-insensitive", () => {
    const i = makeItem({ name: "Áo sơ mi", colors: ["Xanh dương", "Đỏ"] });
    for (const q of ["ao so mi", "AO SƠ MI", "Áo sơ mi"]) expect(match(i, q)).toBe(true);
    expect(match(i, "quan")).toBe(false);
    expect(match(i, "xanh")).toBe(true);
    expect(match(i, "xanh duong")).toBe(true);
    expect(match(i, "do")).toBe(true);
  });

  test("query matches every searchable field", () => {
    const cases: [Partial<Item>, string][] = [
      [{ name: "Váy" }, "vay"],
      [{ brand: "Zara" }, "zara"],
      [{ colors: ["Đen"] }, "den"],
      [{ tags: ["đi làm"] }, "di lam"],
      [{ material: "Lụa" }, "lua"],
      [{ notes: "Ấm áp" }, "am ap"],
      [{ location: "Tủ ngăn 1" }, "tu ngan 1"],
    ];
    for (const [over, q] of cases) expect(match(makeItem({ name: "", ...over }), q)).toBe(true);
    expect(match(makeItem({ name: "", size: "XL" }), "xl")).toBe(false);
  });

  test("blank or whitespace query matches everything", () => {
    expect(match(makeItem(), "")).toBe(true);
    expect(match(makeItem(), "   ")).toBe(true);
  });

  test("category, status, season, location, color each filter", () => {
    const i = makeItem({
      category: "Quần",
      status: "Cất kho",
      seasons: ["Hạ"],
      location: "Kệ giày",
      colors: ["Đen"],
    });
    expect(match(i, "", "Quần")).toBe(true);
    expect(match(i, "", "Áo")).toBe(false);
    expect(match(i, "", "Tất cả", { status: "Cất kho" })).toBe(true);
    expect(match(i, "", "Tất cả", { status: "Cho mượn" })).toBe(false);
    expect(match(i, "", "Tất cả", { season: "Hạ" })).toBe(true);
    expect(match(i, "", "Tất cả", { season: "Đông" })).toBe(false);
    expect(match(i, "", "Tất cả", { location: "Kệ giày" })).toBe(true);
    expect(match(i, "", "Tất cả", { location: "Tủ" })).toBe(false);
    expect(match(i, "", "Tất cả", { color: "Đen" })).toBe(true);
    expect(match(i, "", "Tất cả", { color: "Đỏ" })).toBe(false);
  });

  test('special "stale" uses the 90-day rule', () => {
    expect(match(makeItem({ lastWorn: ago(90) }), "", "Tất cả", { special: "stale" })).toBe(true);
    expect(match(makeItem({ lastWorn: ago(89) }), "", "Tất cả", { special: "stale" })).toBe(false);
  });

  test('special "never" keeps only wearCount 0', () => {
    expect(match(makeItem({ wearCount: 0 }), "", "Tất cả", { special: "never" })).toBe(true);
    expect(match(makeItem({ wearCount: 1 }), "", "Tất cả", { special: "never" })).toBe(false);
  });

  test("all filters combine with AND", () => {
    const i = makeItem({ name: "Áo thun", category: "Áo", colors: ["Đen"] });
    expect(match(i, "thun", "Áo", { color: "Đen" })).toBe(true);
    expect(match(i, "thun", "Áo", { color: "Đỏ" })).toBe(false);
    expect(match(i, "len", "Áo", { color: "Đen" })).toBe(false);
  });
});

describe("sortItems", () => {
  test('"Tên A→Z" uses Vietnamese collation', () => {
    const names = ["Đầm", "Áo", "Quần", "Bông"];
    const items = names.map((name) => makeItem({ id: name, name }));
    const expected = [...names].sort((a, b) => a.localeCompare(b, "vi"));
    expect(sortItems(items, "Tên A→Z").map((i) => i.name)).toEqual(expected);
  });

  test('"Mặc nhiều nhất" sorts by wearCount desc', () => {
    const items = [1, 5, 3].map((n) => makeItem({ id: String(n), wearCount: n }));
    expect(sortItems(items, "Mặc nhiều nhất").map((i) => i.wearCount)).toEqual([5, 3, 1]);
  });

  test('"Lâu chưa mặc" puts never-worn first, then oldest', () => {
    const items = [
      makeItem({ id: "recent", lastWorn: ago(5) }),
      makeItem({ id: "old", lastWorn: ago(200) }),
      makeItem({ id: "never", lastWorn: "" }),
    ];
    expect(sortItems(items, "Lâu chưa mặc", NOW).map((i) => i.id)).toEqual([
      "never",
      "old",
      "recent",
    ]);
  });

  test('"Giá cao → thấp" sorts by price desc', () => {
    const items = [10, 300, 50].map((p) => makeItem({ id: String(p), price: p }));
    expect(sortItems(items, "Giá cao → thấp").map((i) => i.price)).toEqual([300, 50, 10]);
  });

  test('"Mới thêm" and unknown keys sort by createdAt desc', () => {
    const items = [
      makeItem({ id: "1", createdAt: "2026-01-01T00:00:00Z" }),
      makeItem({ id: "3", createdAt: "2026-03-01T00:00:00Z" }),
      makeItem({ id: "2", createdAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortItems(items, "Mới thêm").map((i) => i.id)).toEqual(["3", "2", "1"]);
    expect(sortItems(items, "???").map((i) => i.id)).toEqual(["3", "2", "1"]);
  });

  test("does not mutate its input", () => {
    const items = [makeItem({ id: "1", wearCount: 1 }), makeItem({ id: "2", wearCount: 2 })];
    const out = sortItems(items, "Mặc nhiều nhất");
    expect(out).not.toBe(items);
    expect(items.map((i) => i.id)).toEqual(["1", "2"]);
  });
});
