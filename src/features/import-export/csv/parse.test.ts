import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CsvParseError, parseCsv } from "./parse";

const BOM = "\uFEFF";
const read = (name: string) =>
  readFileSync(fileURLToPath(new URL("./__fixtures__/" + name, import.meta.url)), "utf8");
const crlf = (s: string) => s.replace(/\n/g, "\r\n");

describe("basics", () => {
  test("parses headers and rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual({ headers: ["a", "b"], rows: [["1", "2"]] });
  });
  test("returns empty headers and rows for empty or blank input", () => {
    for (const text of ["", "\n\n", BOM]) expect(parseCsv(text)).toEqual({ headers: [], rows: [] });
  });
  test("returns no rows for a header-only file", () => {
    expect(parseCsv("a,b")).toEqual({ headers: ["a", "b"], rows: [] });
    expect(parseCsv("a,b\n")).toEqual({ headers: ["a", "b"], rows: [] });
  });
  test("keeps Vietnamese text unchanged", () => {
    expect(parseCsv("Tên,Màu\nÁo sơ mi,Trắng")).toEqual({
      headers: ["Tên", "Màu"],
      rows: [["Áo sơ mi", "Trắng"]],
    });
  });
  test("does not trim unquoted fields", () => {
    expect(parseCsv(" a , b ").headers).toEqual([" a ", " b "]);
  });
});

describe("BOM", () => {
  test("strips a leading BOM from the first header", () => {
    expect(parseCsv(BOM + "name,x").headers[0]).toBe("name");
  });
  test("keeps a BOM that is not at the start", () => {
    expect(parseCsv("a\n" + BOM + "b").rows[0][0]).toBe(BOM + "b");
  });
});

describe("delimiter", () => {
  test("picks ; when the header has more unquoted ; than ,", () => {
    expect(parseCsv("a;b;c\n1,5;2;3").rows).toEqual([["1,5", "2", "3"]]);
  });
  test("picks , for a comma header", () => {
    expect(parseCsv("a,b\n1;5,2").rows).toEqual([["1;5", "2"]]);
  });
  test("ignores delimiters inside quoted headers", () => {
    expect(parseCsv('"a;b;c",d').headers).toEqual(["a;b;c", "d"]);
    expect(parseCsv('"x,y";z\n1;2')).toEqual({ headers: ["x,y", "z"], rows: [["1", "2"]] });
  });
  test("defaults to , on a tie or a single column", () => {
    expect(parseCsv("name\nx").headers).toEqual(["name"]);
    expect(parseCsv("a;b,c").headers).toEqual(["a;b", "c"]);
  });
  test("detects from a header that spans lines inside quotes", () => {
    expect(parseCsv('"multi\nline";b\n1;2')).toEqual({
      headers: ["multi\nline", "b"],
      rows: [["1", "2"]],
    });
  });
  test("skips leading blank lines when detecting", () => {
    expect(parseCsv("\n;\na;b\n1;2").headers).toEqual(["a", "b"]);
  });
});

describe("quoting", () => {
  test("keeps a delimiter inside quotes", () => {
    expect(parseCsv('a,b\n"Hà Nội, VN",x').rows).toEqual([["Hà Nội, VN", "x"]]);
  });
  test("unescapes doubled quotes", () => {
    expect(parseCsv('a,b\n"5"" màn",""').rows).toEqual([['5" màn', ""]]);
  });
  test("keeps LF and CRLF inside quotes as \n", () => {
    expect(parseCsv('a\n"a\r\nb"').rows).toEqual([["a\nb"]]);
    expect(parseCsv('a\n"a\nb"').rows).toEqual([["a\nb"]]);
    expect(parseCsv('a\n"a\rb"').rows).toEqual([["a\nb"]]);
  });
  test("treats a quote inside an unquoted field as a literal", () => {
    expect(parseCsv('a,b\n5" screen,x').rows).toEqual([['5" screen', "x"]]);
  });
  test("ignores spaces around a quoted field", () => {
    expect(parseCsv('a, "b" ,c').headers).toEqual(["a", "b", "c"]);
  });
  test("appends non-space text after a closing quote literally", () => {
    expect(parseCsv('"ab"cd,e').headers).toEqual(["abcd", "e"]);
  });
});

describe("line endings", () => {
  test("parses CRLF, LF and mixed input identically", () => {
    const lf = parseCsv("a,b\n1,2\n3,4");
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual(lf);
    expect(parseCsv("a,b\r\n1,2\n3,4")).toEqual(lf);
    expect(lf.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
  test("ignores a trailing LF / CRLF", () => {
    expect(parseCsv("a\n1\n").rows).toEqual([["1"]]);
    expect(parseCsv("a\r\n1\r\n").rows).toEqual([["1"]]);
  });
  test("treats a lone CR as a line break", () => {
    expect(parseCsv("a\rb")).toEqual({ headers: ["a"], rows: [["b"]] });
  });
});

describe("empty lines", () => {
  test("skips blank lines before the header, between rows and at the end", () => {
    expect(parseCsv("\r\n\na,b\n\n1,2\r\n\r\n3,4\n\n")).toEqual({
      headers: ["a", "b"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
  });
  test("skips delimiter-only lines", () => {
    expect(parseCsv("a;b\n;\n1;2").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a,b\n,,\n1,2").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a,b\n   ,  \n1,2").rows).toEqual([["1", "2"]]);
  });
  test("keeps a row with one non-empty field", () => {
    expect(parseCsv("a,b\n,x").rows).toEqual([["", "x"]]);
  });
});

describe("ragged rows", () => {
  test("keeps short and long rows as-is", () => {
    expect(parseCsv("a,b,c\n1\n1,2,3,4").rows).toEqual([["1"], ["1", "2", "3", "4"]]);
  });
  test("keeps an empty field for a trailing delimiter", () => {
    expect(parseCsv("a,b\n1,").rows).toEqual([["1", ""]]);
    expect(parseCsv("a,b,").headers).toEqual(["a", "b", ""]);
  });
});

describe("errors", () => {
  test("throws CsvParseError with the line of the opening quote", () => {
    let error: unknown;
    try {
      parseCsv('a,b\n1,"open\nmore');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CsvParseError);
    expect(error).toBeInstanceOf(Error);
    expect((error as CsvParseError).line).toBe(2);
    expect((error as CsvParseError).name).toBe("CsvParseError");
  });
  test("throws for an unterminated quote in the header", () => {
    expect(() => parseCsv('"a,b')).toThrow(expect.objectContaining({ line: 1 }));
  });
});

describe("fixtures", () => {
  test("parses the Excel semicolon export", () => {
    expect(parseCsv(BOM + crlf(read("excel-semicolon.csv")))).toEqual({
      headers: ["Tên", "Loại", "Trạng thái", "Màu", "Giá", "Ghi chú"],
      rows: [
        ["Áo sơ mi", "Áo", "Đang dùng", "Trắng", "890,5", "Mặc đi làm; giặt tay"],
        ["Quần tây", "Quần", "Mới", "Đen", "1200", ""],
      ],
    });
  });
  test("parses the Google Sheets export", () => {
    expect(parseCsv(read("google-sheets.csv"))).toEqual({
      headers: ["name", "category", "notes"],
      rows: [
        ["Áo, thun", "Áo", "Dòng 1\nDòng 2"],
        ['Màn 5" đẹp', "Quần", 'a, "b"\nc'],
        ["Giày", "Giày", ""],
      ],
    });
  });
  test("parses ragged.csv", () => {
    expect(parseCsv(read("ragged.csv"))).toEqual({
      headers: ["a", "b", "c"],
      rows: [["1"], ["1", "2", "3", "4"], ["1", ""]],
    });
  });
});
