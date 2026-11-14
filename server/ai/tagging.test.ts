// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATEGORIES, COLOR_IDS, SEASONS } from "../validate.js";
import { buildTagSchema, parseTagSuggestion } from "./tagging.js";

const parse = (raw: unknown) => {
  const r = parseTagSuggestion(raw);
  if (!r.ok) throw new Error("not ok");
  return r.value;
};

describe("buildTagSchema", () => {
  it("uses the server lists", () => {
    const s = buildTagSchema() as any;
    expect(s.properties.category.enum).toEqual([...CATEGORIES, null]);
    for (const dead of ["bag", "sport", "home"]) {
      expect(s.properties.category.enum).not.toContain(dead);
    }
    expect(s.properties.colors.items.enum).toEqual(COLOR_IDS);
    expect(s.properties.seasons.items.enum).toEqual(SEASONS);
    expect(s.properties.colors.maxItems).toBe(3);
    expect(s.properties.seasons.maxItems).toBe(4);
    expect(s.properties.tags.maxItems).toBe(5);
    expect(s.required).toEqual([
      "name",
      "category",
      "colors",
      "seasons",
      "material",
      "brand",
      "tags",
    ]);
    expect(s.additionalProperties).toBe(false);
  });
});

describe("parseTagSuggestion", () => {
  it("happy path", () => {
    const v = {
      name: " Áo sơ mi trắng ",
      category: "top",
      colors: ["trang", "xam"],
      seasons: ["summer"],
      material: "cotton",
      brand: "Uniqlo",
      tags: ["công sở", "basic"],
    };
    expect(parse(v)).toEqual({ ...v, name: "Áo sơ mi trắng" });
  });

  it("category", () => {
    for (const c of ["top", "other"]) expect(parse({ category: c }).category).toBe(c);
    for (const c of ["bag", "sport", "home", "Áo", "TOP", "", 5, null, undefined]) {
      expect(parse({ category: c }).category).toBeNull();
    }
    expect(parse({}).category).toBeNull();
  });

  it("colors and seasons", () => {
    expect(
      parse({ colors: ["purple", "Đen", "DEN", "den", "den", "trang", 5, "xam", "kem"] }).colors,
    ).toEqual(["den", "trang", "xam"]);
    expect(parse({ colors: "den" }).colors).toEqual([]);
    expect(parse({ seasons: ["winter", "winter", "autumn", "x"] }).seasons).toEqual([
      "winter",
      "autumn",
    ]);
    expect(parse({ seasons: ["spring", "summer", "autumn", "winter"] }).seasons).toHaveLength(4);
    expect(parse({ seasons: null }).seasons).toEqual([]);
  });

  it("strings", () => {
    const decomposed = "Áo sơ mi";
    expect(parse({ name: decomposed }).name).toBe(decomposed.normalize("NFC"));
    for (const v of ["", "   ", "a\u0000b", "a\u0007b", "x".repeat(121), 5, null]) {
      expect(parse({ name: v }).name).toBeNull();
    }
    expect(parse({ name: "ễ".repeat(120) }).name).toBe("ễ".repeat(120));
    expect(parse({ brand: "b".repeat(201) }).brand).toBeNull();
    expect(parse({ material: "m".repeat(200) }).material).toBe("m".repeat(200));
  });

  it("tags", () => {
    expect(
      parse({ tags: [" a ", "a", "", "x".repeat(31), 5, "b", "c", "d", "e", "f"] }).tags,
    ).toEqual(["a", "b", "c", "d", "e"]);
    expect(parse({ tags: "a" }).tags).toEqual([]);
  });

  it("structure", () => {
    for (const bad of [null, [], "x", 5, undefined]) {
      expect(parseTagSuggestion(bad)).toEqual({ ok: false, code: "provider_bad_response" });
    }
    const evil = JSON.parse('{"__proto__": {"name": "x"}, "constructor": 1, "extra": 1}');
    const v = parse(evil);
    expect(Object.keys(v).sort()).toEqual([
      "brand",
      "category",
      "colors",
      "material",
      "name",
      "seasons",
      "tags",
    ]);
    expect(({} as any).name).toBeUndefined();
    const inherited = Object.create({ name: "inherited" });
    expect(parse(inherited).name).toBeNull();
  });
});
