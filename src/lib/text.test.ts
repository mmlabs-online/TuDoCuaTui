import { describe, expect, test } from "vitest";
import { normalize } from "./text";

const vowels: [string, string][] = [
  ["a", "aáàảãạ"],
  ["a", "ăắằẳẵặ"],
  ["a", "âấầẩẫậ"],
  ["e", "eéèẻẽẹ"],
  ["e", "êếềểễệ"],
  ["i", "iíìỉĩị"],
  ["o", "oóòỏõọ"],
  ["o", "ôốồổỗộ"],
  ["o", "ơớờởỡợ"],
  ["u", "uúùủũụ"],
  ["u", "ưứừửữự"],
  ["y", "yýỳỷỹỵ"],
];

describe("normalize", () => {
  test.each(vowels)("strips every tone from every vowel (%s)", (base, forms) => {
    for (const ch of forms) expect(normalize(ch)).toBe(base);
  });

  test.each(vowels)("handles uppercase vowels with tones (%s)", (base, forms) => {
    for (const ch of forms.toUpperCase()) expect(normalize(ch)).toBe(base);
  });

  test("maps đ and Đ to d", () => {
    expect(normalize("đồ")).toBe("do");
    expect(normalize("Đầm")).toBe("dam");
    expect(normalize("ĐĐ")).toBe("dd");
  });

  test("composed and decomposed input give the same result", () => {
    for (const [s, out] of [
      ["Áo sơ mi", "ao so mi"],
      ["Tủ ngăn 1", "tu ngan 1"],
      ["Xanh dương", "xanh duong"],
    ]) {
      expect(normalize(s)).toBe(out);
      expect(normalize(s.normalize("NFD"))).toBe(out);
      expect(normalize(s.normalize("NFC"))).toBe(out);
    }
  });

  test("lowercases mixed case", () => {
    for (const s of ["AO SƠ MI", "Áo Sơ Mi", "ao so mi"]) expect(normalize(s)).toBe("ao so mi");
  });

  test("collapses and trims whitespace", () => {
    expect(normalize("  Áo   sơ\tmi \n")).toBe("ao so mi");
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });

  test("leaves ASCII, digits and punctuation unchanged apart from case", () => {
    expect(normalize("Zara-2024, M/L")).toBe("zara-2024, m/l");
  });
});
