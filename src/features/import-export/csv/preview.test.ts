import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCsvPreview, PREVIEW_ROWS } from "./preview";
import { CSV_TEMPLATE } from "./template";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL("./__fixtures__/" + name, import.meta.url)), "utf8");
const opts = { today: "2026-11-09", now: "2026-11-09T00:00:00.000Z" };

function ready(text: string, locations?: string[]) {
  const p = buildCsvPreview(text, { ...opts, locations });
  if (p.kind !== "ready") throw new Error(`expected ready, got ${p.kind}`);
  return p;
}

describe("buildCsvPreview", () => {
  it("empty or whitespace text → empty", () => {
    expect(buildCsvPreview("")).toEqual({ kind: "empty" });
    expect(buildCsvPreview("  \n\t ")).toEqual({ kind: "empty" });
  });

  it("unterminated quote → parseError with its line", () => {
    const p = buildCsvPreview('name\n"abc', opts);
    expect(p).toEqual({ kind: "parseError", line: 2 });
  });

  it("header only → ready with 0 rows, 0 items, 0 skipped", () => {
    const p = ready("name,category");
    expect(p).toMatchObject({ total: 0, items: [], skipped: 0, rows: [] });
  });

  it("CSV_TEMPLATE → 1 item, 0 skipped, preview row 1 is ok", () => {
    const p = ready(CSV_TEMPLATE);
    expect(p.items).toHaveLength(1);
    expect(p.skipped).toBe(0);
    expect(p.rows[0]).toMatchObject({ row: 1, errors: [] });
    expect(p.rows[0].item?.name).toBe("Áo sơ mi trắng");
  });

  it("rows with errors are counted as skipped and listed with their messages; valid rows keep their row numbers", () => {
    const p = ready("name,category,price\nA,Áo,1\n,Xyz,1\nC,Áo,2\nD,Áo,abc\nE,Áo,3");
    expect(p.total).toBe(5);
    expect(p.itemRows).toEqual([1, 3, 5]);
    expect(p.items.map((i) => i.name)).toEqual(["A", "C", "E"]);
    expect(p.skipped).toBe(2);
    expect(p.rows[1].item).toBeUndefined();
    expect(p.rows[1].errors).toHaveLength(2);
    expect(p.rows[3].errors).toHaveLength(1);
    expect(p.rows[2].item?.name).toBe("C");
  });

  it("a generated 200-row CSV gives 200 items, 0 skipped, preview limited to 20 rows", () => {
    const text =
      "name,category\n" + Array.from({ length: 200 }, (_, i) => `Món ${i},Áo`).join("\n");
    const p = ready(text);
    expect(p.items).toHaveLength(200);
    expect(p.skipped).toBe(0);
    expect(p.total).toBe(200);
    expect(p.rows).toHaveLength(PREVIEW_ROWS);
  });

  it('Excel ";" fixture with BOM previews like the "," version', () => {
    const semi = ready("\uFEFF" + fixture("excel-semicolon.csv"));
    const comma = ready(
      [
        "Tên,Loại,Trạng thái,Màu,Giá,Ghi chú",
        'Áo sơ mi,Áo,Đang dùng,Trắng,"890,5","Mặc đi làm; giặt tay"',
        ",,,,,",
        "Quần tây,Quần,Mới,Đen,1200,",
      ].join("\n"),
    );
    expect(semi).toEqual(comma);
    expect(semi.total).toBe(2);
    expect(semi.rows.map((r) => r.errors)).toEqual([
      ["Giá không hợp lệ: 890,5"],
      ["Trạng thái không hợp lệ: Mới"],
    ]);
  });

  it('existing location "Tủ ngăn 1" is reused for "tủ ngăn 1"', () => {
    const p = ready("name,location\nA,tủ ngăn 1", ["Tủ ngăn 1"]);
    expect(p.items[0].location).toBe("Tủ ngăn 1");
  });

  it("wear_count / last_worn are reported as ignored columns", () => {
    const p = ready("name,wear_count,last_worn\nA,3,2026-01-01");
    expect(p.ignoredColumns).toEqual(["wear_count", "last_worn"]);
    expect(p.items[0].wearCount).toBe(0);
  });

  it("Vietnamese names in NFD come out NFC", () => {
    const nfd = "Áo".normalize("NFD");
    const p = ready(`name\n${nfd}`);
    expect(p.items[0].name).toBe("Áo".normalize("NFC"));
  });
});
