import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_TO_DB, COLOR_TO_DB, SEASON_TO_DB, STATUS_TO_DB } from "@/data/mappers";
import { locations, starter } from "@/data/demo";
import { normalize } from "@/lib/text";
import { mapRows, parseDate, parsePrice, splitMulti } from "./map";
import { parseCsv } from "./parse";
import { toCsv, toDateOnly } from "./serialize";
import { CSV_TEMPLATE } from "./template";

const TODAY = "2026-11-09";
const NOW = "2026-11-09T00:00:00.000Z";
const opts = { today: TODAY, now: NOW };
const run = (csv: string, extra: Record<string, unknown> = {}) =>
  mapRows(parseCsv(csv), { ...opts, ...extra });
/** One-column-per-header helper: first data row only. */
const one = (header: string, value: string) => run(`${header}\n${value}`);
const withName = (header: string, value: string) => run(`name,${header}\nA,"${value}"`);

describe("template", () => {
  it("CSV_TEMPLATE maps to one valid item with no errors", () => {
    const r = run(CSV_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]).toMatchObject({
      name: "Áo sơ mi trắng",
      category: "Áo",
      status: "Đang dùng",
      colors: ["Trắng", "Kem"],
      brand: "Uniqlo",
      size: "M",
      location: "Tủ ngăn 1",
      price: 890000,
    });
  });
});

describe("round trip", () => {
  it('toCsv(starter) → parseCsv → mapRows gives every demo item back, no errors, ignoredColumns = ["wear_count","last_worn"]', () => {
    const r = mapRows(parseCsv(toCsv(starter)), { locations });
    expect(r.errors).toEqual([]);
    expect(r.ignoredColumns).toEqual(["wear_count", "last_worn"]);
    expect(r.valid).toHaveLength(starter.length);
    r.valid.forEach((got, i) => {
      const want = starter[i];
      expect({
        name: got.name,
        category: got.category,
        status: got.status,
        colors: got.colors,
        seasons: got.seasons,
        brand: got.brand,
        size: got.size,
        location: got.location,
        price: got.price,
        purchaseDate: got.purchaseDate,
        material: got.material,
        tags: got.tags,
        notes: got.notes,
      }).toEqual({
        name: want.name,
        category: want.category,
        status: want.status,
        colors: want.colors,
        seasons: want.seasons,
        brand: want.brand,
        size: want.size,
        location: want.location,
        price: want.price,
        purchaseDate: toDateOnly(want.purchaseDate),
        material: want.material,
        tags: want.tags,
        notes: want.notes,
      });
    });
  });

  it("value with quote, comma, newline and empty price survives", () => {
    const item = { ...starter[0], name: 'Áo "đẹp", loại 1', notes: "dòng 1\ndòng 2", price: 0 };
    const r = mapRows(parseCsv(toCsv([item])), opts);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ name: item.name, notes: item.notes, price: 0 });
  });

  it("a ;-delimited file with VN headers maps the same as the , English one", () => {
    const en = run("name,category,colors,price\nÁo,Áo,Trắng|Kem,890000");
    const vn = run("Tên;Loại;Màu;Giá\nÁo;Áo;Trắng|Kem;890000");
    expect(vn.valid).toEqual(en.valid);
    expect(vn.errors).toEqual([]);
  });
});

describe("rows", () => {
  it("bad rows are reported with their row number and valid rows around them are kept", () => {
    const r = run("name,price\nA,1\n,2\nC,3\nD,abc");
    expect(r.valid.map((i) => i.name)).toEqual(["A", "C"]);
    expect(r.errors.map((e) => [e.row, e.field])).toEqual([
      [2, "name"],
      [4, "price"],
    ]);
  });

  it("one row with several bad fields reports one error per field", () => {
    const r = run("name,category,status,price\n,xyz,abc,-1");
    expect(r.valid).toEqual([]);
    expect(r.errors.map((e) => e.field)).toEqual(["name", "category", "status", "price"]);
  });

  it("short rows read missing cells as empty; extra cells are ignored", () => {
    const r = run("name,brand,size\nA\nB,X,M,extra,more");
    expect(r.errors).toEqual([]);
    expect(r.valid.map((i) => [i.name, i.brand, i.size])).toEqual([
      ["A", "", ""],
      ["B", "X", "M"],
    ]);
  });

  it("header-only input gives no items and no errors", () => {
    expect(run("name,category")).toEqual({ valid: [], errors: [], ignoredColumns: [] });
  });

  it("no name column → every row has a name error", () => {
    const r = run("brand\nX\nY");
    expect(r.valid).toEqual([]);
    expect(r.errors.map((e) => [e.row, e.field])).toEqual([
      [1, "name"],
      [2, "name"],
    ]);
  });
});

describe("headers", () => {
  // [Vietnamese, English, Item property, cell text, expected value]
  const pairs: [string, string, string, string, unknown][] = [
    ["Tên", "name", "name", "N", "N"],
    ["Loại", "category", "category", "Quần", "Quần"],
    ["Trạng thái", "status", "status", "Cất kho", "Cất kho"],
    ["Màu", "colors", "colors", "Đen", ["Đen"]],
    ["Mùa", "seasons", "seasons", "Hạ", ["Hạ"]],
    ["Hãng", "brand", "brand", "B", "B"],
    ["Size", "size", "size", "L", "L"],
    ["Vị trí", "location", "location", "Kệ", "Kệ"],
    ["Giá", "price", "price", "5", 5],
    ["Ngày mua", "purchase_date", "purchaseDate", "2026-01-02", "2026-01-02"],
    ["Chất liệu", "material", "material", "Cotton", "Cotton"],
    ["Tag", "tags", "tags", "t1", ["t1"]],
    ["Ghi chú", "notes", "notes", "ghi", "ghi"],
  ];

  it("every Vietnamese and English alias maps to its field", () => {
    for (const [vn, en, prop, cell, want] of pairs) {
      const stripped = normalize(vn).replace(/ /g, "  ");
      for (const header of [vn, en, vn.toUpperCase(), `  ${stripped}  `]) {
        const r = prop === "name" ? run(`${header}\n${cell}`) : run(`name,${header}\nA,${cell}`);
        expect(r.errors, header).toEqual([]);
        expect(r.ignoredColumns, header).toEqual([]);
        expect((r.valid[0] as Record<string, unknown>)[prop], header).toEqual(want);
      }
    }
  });

  it("unknown headers and wear_count/last_worn go to ignoredColumns (original text, in column order); blank headers are dropped silently", () => {
    const r = run("name,Wear_Count,Foo Bar, ,last_worn\nA,1,x,y,2026-01-01");
    expect(r.ignoredColumns).toEqual(["Wear_Count", "Foo Bar", "last_worn"]);
    expect(r.valid).toHaveLength(1);
  });

  it("a duplicated header keeps the first column and ignores the second", () => {
    const r = run("name,brand,Hãng\nA,First,Second");
    expect(r.valid[0].brand).toBe("First");
    expect(r.ignoredColumns).toEqual(["Hãng"]);
  });
});

describe("enums", () => {
  const cases: [string, string, Record<string, string>][] = [
    ["category", "category", CATEGORY_TO_DB],
    ["status", "status", STATUS_TO_DB],
  ];

  it("every category/status/season/color label and id maps to the label", () => {
    for (const [header, prop, table] of cases) {
      for (const [label, id] of Object.entries(table)) {
        for (const v of [label, id]) {
          const r = run(`name,${header}\nA,${v}`);
          expect(r.errors, v).toEqual([]);
          expect((r.valid[0] as Record<string, unknown>)[prop], v).toBe(label);
        }
      }
    }
    for (const [header, table] of [
      ["seasons", SEASON_TO_DB],
      ["colors", COLOR_TO_DB],
    ] as const) {
      for (const [label, id] of Object.entries(table)) {
        for (const v of [label, id]) {
          const r = run(`name,${header}\nA,${v}`);
          expect(r.errors, v).toEqual([]);
          expect((r.valid[0] as Record<string, unknown>)[header], v).toEqual([label]);
        }
      }
    }
  });

  it('case and diacritics do not matter ("ao khoac", "AO KHOÁC", "outer")', () => {
    for (const v of ["ao khoac", "AO KHOÁC", "outer"])
      expect(withName("category", v).valid[0].category).toBe("Áo khoác");
  });

  it('empty category → "Khác", empty status → "Đang dùng"', () => {
    const r = run("name,category,status\nA,,");
    expect(r.valid[0]).toMatchObject({ category: "Khác", status: "Đang dùng" });
  });

  it("unknown category / status / season / color → error on that field, message names the value", () => {
    for (const field of ["category", "status", "seasons", "colors"]) {
      const r = withName(field, "zzz");
      expect(r.valid).toEqual([]);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].field).toBe(field);
      expect(r.errors[0].message).toContain("zzz");
    }
  });
});

describe("multi-values", () => {
  it("splits on ; and |, trims, drops empties and duplicates", () => {
    expect(splitMulti(" a ; b|c ;; | a ")).toEqual(["a", "b", "c"]);
    const r = run('name,colors,seasons,tags\nA,"Đen; Trắng|den",Xuân|Hạ;,"x;y|x"');
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({
      colors: ["Đen", "Trắng"],
      seasons: ["Xuân", "Hạ"],
      tags: ["x", "y"],
    });
  });
});

describe("validation", () => {
  it("name empty or blank → error", () => {
    expect(run("name,brand\n   ,X").errors[0]).toMatchObject({ row: 1, field: "name" });
    expect(run("name,brand\n,X").errors[0].field).toBe("name");
  });

  it("name of 120 characters ok, 121 → error", () => {
    expect(one("name", "a".repeat(120)).errors).toEqual([]);
    expect(one("name", "a".repeat(121)).errors[0].field).toBe("name");
  });

  it("length counts NFC characters (NFD input of 120 chars is ok)", () => {
    const nfd = "ế".normalize("NFD").repeat(120);
    expect(nfd.length).toBeGreaterThan(120);
    const r = one("name", nfd);
    expect(r.errors).toEqual([]);
    expect(r.valid[0].name).toBe("ế".repeat(120));
  });

  it("price accepts 890000, 890.000, 890,000, 1.250.000 and empty (→ 0)", () => {
    expect(parsePrice("890000")).toBe(890000);
    expect(parsePrice("890.000")).toBe(890000);
    expect(parsePrice("890,000")).toBe(890000);
    expect(parsePrice("1.250.000")).toBe(1250000);
    expect(parsePrice("")).toBe(0);
    expect(withName("price", "890.000").valid[0].price).toBe(890000);
  });

  it("price rejects -1, 12.5, 1.2345, 1.234,000, abc", () => {
    for (const v of ["-1", "12.5", "1.2345", "1.234,000", "abc"]) {
      expect(parsePrice(v), v).toBeNull();
      expect(withName("price", v).errors[0].field).toBe("price");
    }
  });

  it('date accepts 2026-01-02, 02/01/2026, 2/1/2026 → "2026-01-02"', () => {
    for (const v of ["2026-01-02", "02/01/2026", "2/1/2026"])
      expect(parseDate(v, TODAY), v).toEqual({ ok: true, value: "2026-01-02" });
    expect(parseDate("", TODAY)).toEqual({ ok: true, value: "" });
    expect(withName("purchase_date", "02/01/2026").valid[0].purchaseDate).toBe("2026-01-02");
  });

  it("date rejects 31/02/2026, 2026-13-01, 2026/01/02, abc", () => {
    for (const v of ["31/02/2026", "2026-13-01", "2026/01/02", "abc"]) {
      expect(parseDate(v, TODAY), v).toEqual({ ok: false, reason: "bad" });
      expect(withName("purchase_date", v).errors[0].field).toBe("purchase_date");
    }
  });

  it("date equal to today (UTC+7) ok, tomorrow → error", () => {
    expect(parseDate("2026-11-09", TODAY).ok).toBe(true);
    expect(parseDate("2026-11-10", TODAY)).toEqual({ ok: false, reason: "future" });
    expect(withName("purchase_date", "10/11/2026").errors[0].field).toBe("purchase_date");
  });

  describe("default today", () => {
    afterEach(() => vi.useRealTimers());
    it("today defaults to the UTC+7 date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-08T18:00:00Z"));
      const ok = mapRows(parseCsv("name,purchase_date\nA,2026-11-09"));
      const bad = mapRows(parseCsv("name,purchase_date\nA,2026-11-10"));
      expect(ok.errors).toEqual([]);
      expect(bad.errors).toHaveLength(1);
    });
  });
});

describe("locations", () => {
  it('"tủ ngăn 1" maps to existing "Tủ ngăn 1"', () => {
    const r = run("name,location\nA,tủ ngăn 1", { locations: ["Tủ ngăn 1"] });
    expect(r.valid[0].location).toBe("Tủ ngăn 1");
  });

  it('a new location keeps its first spelling for later rows ("Kệ Mới" then "ke moi" → "Kệ Mới")', () => {
    const r = run("name,location\nA,Kệ Mới\nB,ke moi", { locations: ["Khác"] });
    expect(r.valid.map((i) => i.location)).toEqual(["Kệ Mới", "Kệ Mới"]);
  });

  it('empty location stays ""', () => {
    expect(run("name,location\nA,", { locations: ["X"] }).valid[0].location).toBe("");
  });
});

describe("text fields", () => {
  it("brand, size, material, notes are trimmed and NFC-normalised; Vietnamese passes through", () => {
    const r = run(
      `name,brand,size,material,notes\nA,  ${"Việt".normalize("NFD")} ,  M ,Lụa , ghi chú `,
    );
    expect(r.valid[0]).toMatchObject({
      brand: "Việt".normalize("NFC"),
      size: "M",
      material: "Lụa",
      notes: "ghi chú",
    });
  });
});

describe("output", () => {
  it('valid items have id "", photo "", wearCount 0, lastWorn "", createdAt from options.now', () => {
    const r = run("name\nA");
    expect(r.valid[0]).toMatchObject({
      id: "",
      photo: "",
      wearCount: 0,
      lastWorn: "",
      createdAt: NOW,
      price: 0,
      purchaseDate: "",
      colors: [],
      seasons: [],
      tags: [],
    });
  });

  it("createdAt defaults to the current time", () => {
    expect(mapRows(parseCsv("name\nA")).valid[0].createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });
});
