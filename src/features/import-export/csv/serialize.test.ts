import { describe, expect, it } from "vitest";
import type { Item } from "@/types/item";
import { CSV_HEADERS, csvField, toCsv, toDateOnly } from "./serialize";

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

// Temporary: replace with `parseCsv` from "./parse" after F-601.1 merges
// (F-601.2 AC2 covers the real round trip).
function readCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (quoted) {
      if (c === '"' && s[k + 1] === '"') {
        field += '"';
        k++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[k + 1] === "\n") k++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const col = (name: (typeof CSV_HEADERS)[number]) => CSV_HEADERS.indexOf(name);

describe("headers", () => {
  it("are exactly the English ids F-601.2 accepts, plus wear_count and last_worn", () => {
    expect(toCsv([]).slice(1)).toBe(
      "name,category,status,colors,seasons,brand,size,location,price,purchase_date,material,tags,notes,wear_count,last_worn",
    );
  });
});

describe("file", () => {
  it("starts with the UTF-8 BOM", () => {
    const out = toCsv([makeItem()]);
    expect(out[0]).toBe("﻿");
    expect(out.indexOf("﻿", 1)).toBe(-1);
  });
  it("empty list gives BOM + header only", () => {
    expect(toCsv([])).toBe("﻿" + CSV_HEADERS.join(","));
  });
  it("uses CRLF between records", () => {
    const out = toCsv([makeItem(), makeItem()]);
    expect(out.split("\r\n")).toHaveLength(3);
    expect(out.endsWith("\r\n")).toBe(false);
  });
});

describe("quoting", () => {
  it("plain value is not quoted", () => expect(csvField("Uniqlo")).toBe("Uniqlo"));
  it("value with comma is quoted", () => expect(csvField("a,b")).toBe('"a,b"'));
  it("value with quote is quoted and doubled", () =>
    expect(csvField('6" heel')).toBe('"6"" heel"'));
  it("value with LF or CRLF is quoted", () => {
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("a\r\nb")).toBe('"a\r\nb"');
    expect(csvField("a\rb")).toBe('"a\rb"');
  });
  it("empty string is an empty field", () => expect(csvField("")).toBe(""));
  it("Vietnamese diacritics pass through unchanged", () => {
    expect(csvField("Áo sơ mi trắng")).toBe("Áo sơ mi trắng");
    expect(csvField("Tủ phòng ngủ – ngăn 1")).toBe("Tủ phòng ngủ – ngăn 1");
  });
});

describe("values", () => {
  const rowOf = (i: Item) => readCsv(toCsv([i]))[1];

  it("multi-values joined with pipe", () => {
    const r = rowOf(
      makeItem({ colors: ["Trắng", "Kem"], seasons: ["Hè", "Thu"], tags: ["a", "b"] }),
    );
    expect(r[col("colors")]).toBe("Trắng|Kem");
    expect(r[col("seasons")]).toBe("Hè|Thu");
    expect(r[col("tags")]).toBe("a|b");
    expect(rowOf(makeItem())[col("colors")]).toBe("");
  });
  it("labels are exported as stored on Item", () => {
    const r = rowOf(makeItem({ category: "Áo", status: "Đang dùng" }));
    expect(r[col("category")]).toBe("Áo");
    expect(r[col("status")]).toBe("Đang dùng");
  });
  it("price is a plain integer, empty when 0", () => {
    expect(rowOf(makeItem({ price: 890000 }))[col("price")]).toBe("890000");
    expect(rowOf(makeItem({ price: 0 }))[col("price")]).toBe("");
  });
  it("wear_count is exported", () => {
    expect(rowOf(makeItem({ wearCount: 7 }))[col("wear_count")]).toBe("7");
    expect(rowOf(makeItem({ wearCount: 0 }))[col("wear_count")]).toBe("0");
  });
  it("missing optional fields do not throw", () => {
    const old = makeItem() as Partial<Item>;
    delete old.seasons;
    delete old.tags;
    delete old.material;
    delete old.notes;
    delete old.purchaseDate;
    const r = rowOf(old as Item);
    expect(r[col("seasons")]).toBe("");
    expect(r[col("tags")]).toBe("");
    expect(r[col("material")]).toBe("");
    expect(r[col("notes")]).toBe("");
    expect(r[col("purchase_date")]).toBe("");
  });
});

describe("toDateOnly", () => {
  it("keeps a date-only value (API mode)", () => {
    expect(toDateOnly("2026-11-05")).toBe("2026-11-05");
  });
  it("converts an ISO timestamp to the UTC+7 date (local mode)", () => {
    expect(toDateOnly("2026-11-06T18:30:00.000Z")).toBe("2026-11-07");
    expect(toDateOnly("2026-11-06T16:59:59.000Z")).toBe("2026-11-06");
  });
  it("empty or invalid gives empty", () => {
    expect(toDateOnly("")).toBe("");
    expect(toDateOnly("not a date")).toBe("");
  });
});

describe("round trip", () => {
  it("value with quote, comma and newline survives", () => {
    const item = makeItem({ name: "Áo, dài", notes: 'Nói "đẹp", mặc\nđi tiệc' });
    const rows = readCsv(toCsv([item]));
    expect(rows).toHaveLength(2);
    expect(rows[1][col("name")]).toBe("Áo, dài");
    expect(rows[1][col("notes")]).toBe('Nói "đẹp", mặc\nđi tiệc');
  });
  it("several items keep column alignment", () => {
    const full = makeItem({
      name: "Váy",
      category: "Váy/Đầm",
      status: "Cất kho",
      colors: ["Đỏ", "Đen"],
      seasons: ["Hè"],
      brand: "Zara",
      size: "M",
      location: "Tủ 1",
      price: 450000,
      purchaseDate: "2026-01-02",
      material: "Lụa",
      tags: ["tiệc"],
      notes: "ghi chú",
      wearCount: 3,
      lastWorn: "2026-11-06T18:30:00.000Z",
    });
    const rows = readCsv(toCsv([full, makeItem({ name: "Trống" })]));
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(r).toHaveLength(CSV_HEADERS.length));
    expect(rows[1]).toEqual([
      "Váy",
      "Váy/Đầm",
      "Cất kho",
      "Đỏ|Đen",
      "Hè",
      "Zara",
      "M",
      "Tủ 1",
      "450000",
      "2026-01-02",
      "Lụa",
      "tiệc",
      "ghi chú",
      "3",
      "2026-11-07",
    ]);
    expect(rows[2][col("name")]).toBe("Trống");
    expect(rows[2][col("brand")]).toBe("");
  });
});
