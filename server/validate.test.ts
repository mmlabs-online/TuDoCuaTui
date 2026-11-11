// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  SEASONS,
  STATUSES,
  isCalendarDate,
  isUuid,
  parseItemInput,
  parseWearInput,
  vnToday,
} from "./validate.js";

const bad = (body: unknown) => {
  const r = parseItemInput(body);
  if (r.ok) throw new Error("expected failure");
  return { field: r.field, reason: r.reason };
};
const good = (body: unknown) => {
  const r = parseItemInput(body);
  if (!r.ok) throw new Error(`unexpected ${r.field} ${r.reason}`);
  return r.value;
};

describe("parseItemInput", () => {
  it("name: trims; '' / whitespace / non-string -> nameRequired; 120 code points ok, 121 -> nameTooLong", () => {
    expect(good({ name: "  Áo  " }).name).toBe("Áo");
    for (const name of ["", "   ", 5, undefined, null]) {
      expect(bad({ name })).toEqual({ field: "name", reason: "nameRequired" });
    }
    expect(good({ name: "😀".repeat(120) }).name).toHaveLength(240);
    expect(good({ name: "é".repeat(60) }).name).toBeTruthy();
    expect(bad({ name: "😀".repeat(121) })).toEqual({ field: "name", reason: "nameTooLong" });
  });

  it("category/status: each enum value ok; unknown or label -> invalidValue; missing -> default", () => {
    for (const category of CATEGORIES)
      expect(good({ name: "a", category }).category).toBe(category);
    for (const status of STATUSES) expect(good({ name: "a", status }).status).toBe(status);
    expect(bad({ name: "a", category: "Áo" })).toEqual({
      field: "category",
      reason: "invalidValue",
    });
    expect(bad({ name: "a", status: null })).toEqual({ field: "status", reason: "invalidValue" });
    expect(good({ name: "a" })).toMatchObject({ category: "other", status: "active" });
  });

  it("brand/size/material: trim, '' -> null, 200 ok / 201 -> tooLong, number -> invalidType", () => {
    for (const f of ["brand", "size", "material"]) {
      expect(good({ name: "a", [f]: " x " })[f as "brand"]).toBe("x");
      expect(good({ name: "a", [f]: "" })[f as "brand"]).toBeNull();
      expect(good({ name: "a", [f]: "a".repeat(200) })[f as "brand"]).toHaveLength(200);
      expect(bad({ name: "a", [f]: "a".repeat(201) })).toEqual({ field: f, reason: "tooLong" });
      expect(bad({ name: "a", [f]: 3 })).toEqual({ field: f, reason: "invalidType" });
    }
  });

  it("notes: 2000 ok / 2001 -> tooLong", () => {
    expect(good({ name: "a", notes: "n".repeat(2000) }).notes).toHaveLength(2000);
    expect(bad({ name: "a", notes: "n".repeat(2001) })).toEqual({
      field: "notes",
      reason: "tooLong",
    });
  });

  it("price: null/0/150000 ok; negative -> priceNegative; fractions, strings, 1e14, 2^53 -> priceInvalid", () => {
    expect(good({ name: "a" }).price).toBeNull();
    expect(good({ name: "a", price: null }).price).toBeNull();
    expect(good({ name: "a", price: 0 }).price).toBe(0);
    expect(good({ name: "a", price: 150000 }).price).toBe(150000);
    expect(bad({ name: "a", price: -1 })).toEqual({ field: "price", reason: "priceNegative" });
    for (const price of [1.5, Number.NaN, "100", 1e14, 2 ** 53, -1.5]) {
      expect(bad({ name: "a", price })).toEqual({ field: "price", reason: "priceInvalid" });
    }
  });

  it("purchase_date: null/'' -> null; impossible dates and timestamps -> dateInvalid; future ok", () => {
    expect(good({ name: "a", purchase_date: null }).purchase_date).toBeNull();
    expect(good({ name: "a", purchase_date: "" }).purchase_date).toBeNull();
    expect(good({ name: "a", purchase_date: "2024-02-29" }).purchase_date).toBe("2024-02-29");
    expect(good({ name: "a", purchase_date: "2999-01-01" }).purchase_date).toBe("2999-01-01");
    for (const purchase_date of [
      "2026-02-29",
      "2026-13-01",
      "2026-01-01T00:00:00Z",
      "0999-01-01",
      5,
    ]) {
      expect(bad({ name: "a", purchase_date })).toEqual({
        field: "purchase_date",
        reason: "dateInvalid",
      });
    }
  });

  it("colors/tags: arrays of strings; 50 ok, 51 -> tooMany; 51 code points -> tooLong; bad types -> invalidType", () => {
    for (const f of ["colors", "tags"]) {
      expect(good({ name: "a", [f]: Array(50).fill("x") })[f as "tags"]).toHaveLength(50);
      expect(bad({ name: "a", [f]: Array(51).fill("x") })).toEqual({ field: f, reason: "tooMany" });
      expect(bad({ name: "a", [f]: ["😀".repeat(51)] })).toEqual({ field: f, reason: "tooLong" });
      expect(bad({ name: "a", [f]: "x" })).toEqual({ field: f, reason: "invalidType" });
      expect(bad({ name: "a", [f]: [1] })).toEqual({ field: f, reason: "invalidType" });
    }
  });

  it("seasons: subset ok; unknown or label -> invalidValue", () => {
    expect(good({ name: "a", seasons: [...SEASONS] }).seasons).toEqual(SEASONS);
    expect(bad({ name: "a", seasons: ["monsoon"] })).toEqual({
      field: "seasons",
      reason: "invalidValue",
    });
    expect(bad({ name: "a", seasons: ["Mùa hè"] })).toEqual({
      field: "seasons",
      reason: "invalidValue",
    });
    expect(bad({ name: "a", seasons: 1 })).toEqual({ field: "seasons", reason: "invalidType" });
  });

  it("location_name: NFC + trim; NFD equals NFC; '' -> null; 80 ok, 81 -> tooLong; non-string -> invalidType", () => {
    const nfc = "Tủ phòng ngủ";
    expect(good({ name: "a", location_name: `  ${nfc.normalize("NFD")} ` }).location_name).toBe(
      nfc,
    );
    expect(good({ name: "a", location_name: "" }).location_name).toBeNull();
    expect(good({ name: "a", location_name: "l".repeat(80) }).location_name).toHaveLength(80);
    expect(bad({ name: "a", location_name: "l".repeat(81) })).toEqual({
      field: "location_name",
      reason: "tooLong",
    });
    expect(bad({ name: "a", location_name: 1 })).toEqual({
      field: "location_name",
      reason: "invalidType",
    });
  });

  it("body not a plain object -> field null, reason notObject", () => {
    for (const body of [[], null, "x", 5, undefined]) {
      expect(bad(body)).toEqual({ field: null, reason: "notObject" });
    }
  });

  it("unknown keys are dropped, never copied", () => {
    const body = JSON.parse(
      '{"name":"a","id":"x","location_id":"y","wear_count":9,"created_at":"z","user_id":"u","__proto__":{"polluted":1}}',
    );
    const v = good(body);
    expect(Object.keys(v).sort()).toEqual(
      [
        "brand",
        "category",
        "colors",
        "location_name",
        "material",
        "name",
        "notes",
        "price",
        "purchase_date",
        "seasons",
        "size",
        "status",
        "tags",
      ].sort(),
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("first error wins in fixed field order", () => {
    expect(bad({ name: "", category: "x", price: -1 }).field).toBe("name");
    expect(bad({ name: "a", category: "x", price: -1 }).field).toBe("category");
    expect(bad({ name: "a", price: -1, notes: 3 }).field).toBe("price");
  });
});

describe("helpers", () => {
  it("isUuid: lowercase and uppercase ok; wrong length, non-hex, percent-encoded -> false", () => {
    const u = "11111111-1111-4111-8111-111111111111";
    expect(isUuid(u)).toBe(true);
    expect(isUuid(u.toUpperCase())).toBe(true);
    expect(isUuid(u.slice(1))).toBe(false);
    expect(isUuid(u + "1")).toBe(false);
    expect(isUuid(u.replace("8111", "g111"))).toBe(false);
    expect(isUuid(u.replace(/-/g, "%2D"))).toBe(false);
    expect(isUuid(5)).toBe(false);
  });

  it("isCalendarDate rejects non-strings and malformed shapes", () => {
    expect(isCalendarDate("2026-1-1")).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
    expect(isCalendarDate("2026-03-04")).toBe(true);
  });

  it("vnToday uses UTC+7: rolls over at 17:00Z", () => {
    expect(vnToday(Date.parse("2026-03-04T16:59:59Z"))).toBe("2026-03-04");
    expect(vnToday(Date.parse("2026-03-04T17:00:00Z"))).toBe("2026-03-05");
  });
});

describe("parseWearInput", () => {
  const now = Date.parse("2026-03-04T05:00:00Z"); // 2026-03-04 in Vietnam
  const fail = (b: unknown) => {
    const r = parseWearInput(b, now);
    if (r.ok) throw new Error("expected failure");
    return { field: r.field, reason: r.reason };
  };

  it("delta 1/-1 ok; 0, 2, '1', 1.0001 -> invalidValue", () => {
    expect(parseWearInput({ delta: 1, today: "2026-03-04" }, now)).toEqual({
      ok: true,
      value: { delta: 1, today: "2026-03-04" },
    });
    expect(parseWearInput({ delta: -1, today: "2026-03-04" }, now).ok).toBe(true);
    for (const delta of [0, 2, "1", 1.0001]) {
      expect(fail({ delta, today: "2026-03-04" })).toEqual({
        field: "delta",
        reason: "invalidValue",
      });
    }
  });

  it("today: invalid -> dateInvalid; +-1 day ok, +-2 -> todayOutOfRange; non-object -> notObject", () => {
    expect(fail({ delta: 1, today: "nope" })).toEqual({ field: "today", reason: "dateInvalid" });
    expect(parseWearInput({ delta: 1, today: "2026-03-03" }, now).ok).toBe(true);
    expect(parseWearInput({ delta: 1, today: "2026-03-05" }, now).ok).toBe(true);
    for (const today of ["2026-03-02", "2026-03-06"]) {
      expect(fail({ delta: 1, today })).toEqual({ field: "today", reason: "todayOutOfRange" });
    }
    expect(fail(null)).toEqual({ field: null, reason: "notObject" });
  });

  it("boundary at 17:00Z (UTC+7 midnight)", () => {
    const before = Date.parse("2026-03-04T16:59:59Z");
    const after = Date.parse("2026-03-04T17:00:00Z");
    expect(parseWearInput({ delta: 1, today: "2026-03-06" }, before).ok).toBe(false);
    expect(parseWearInput({ delta: 1, today: "2026-03-06" }, after).ok).toBe(true);
  });
});
