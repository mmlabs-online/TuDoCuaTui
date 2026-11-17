// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  DEPRECATED_CATEGORIES,
  SEASONS,
  STATUSES,
  isCalendarDate,
  isUuid,
  parseBackup,
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
  it("NUL in any string field -> invalidValue with the field name", () => {
    const nul = "a\u0000b";
    const cases: [string, unknown][] = [
      ["name", { name: nul }],
      ["brand", { name: "a", brand: nul }],
      ["size", { name: "a", size: nul }],
      ["material", { name: "a", material: nul }],
      ["notes", { name: "a", notes: nul }],
      ["location_name", { name: "a", location_name: nul }],
      ["colors", { name: "a", colors: [nul] }],
      ["tags", { name: "a", tags: ["ok", nul] }],
      ["seasons", { name: "a", seasons: [nul] }],
    ];
    for (const [field, body] of cases) {
      expect(bad(body)).toEqual({ field, reason: "invalidValue" });
    }
  });

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

  it("removed categories bag/sport/home -> invalidValue", () => {
    expect(CATEGORIES).toHaveLength(10);
    for (const category of DEPRECATED_CATEGORIES)
      expect(bad({ name: "a", category })).toEqual({ field: "category", reason: "invalidValue" });
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

describe("parseBackup", () => {
  const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const TS = "2026-03-04T05:00:00.000Z";
  const loc = (n: number, extra: Record<string, unknown> = {}) => ({
    id: u(n),
    name: `Tủ ${n}`,
    parent_id: null,
    sort_order: 0,
    created_at: TS,
    ...extra,
  });
  const item = (n: number, extra: Record<string, unknown> = {}) => ({
    id: u(100 + n),
    name: `Áo ${n}`,
    category: "top",
    status: "active",
    created_at: TS,
    updated_at: TS,
    ...extra,
  });
  const file = (over: Record<string, unknown> = {}) => ({
    version: 1,
    exportedAt: TS,
    locations: [],
    items: [],
    wearLogs: [],
    ...over,
  });
  const err = (body: unknown, caps?: Parameters<typeof parseBackup>[1]) => {
    const r = parseBackup(body, caps);
    if (r.ok) throw new Error("expected a failure");
    return { field: r.field, reason: r.reason };
  };

  it("accepts an empty backup and a full one; only known keys come out", () => {
    expect(parseBackup(file()).ok).toBe(true);
    const r = parseBackup(
      file({
        locations: [loc(1, { user_id: "x", extra: 1 })],
        items: [
          item(1, {
            user_id: "x",
            wear_count: 9,
            location_name: "\u0000bad",
            location_id: u(1),
            photo_id: u(900),
            price: 150000,
            purchase_date: "2026-01-02",
            colors: ["den"],
          }),
        ],
        wearLogs: [{ id: u(500), item_id: u(101), worn_on: "2001-01-01", user_id: "x" }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value.locations[0]).sort()).toEqual(
      ["created_at", "id", "name", "parent_id", "sort_order"].sort(),
    );
    expect(Object.keys(r.value.items[0]).sort()).toEqual(
      [
        "id",
        "name",
        "category",
        "status",
        "brand",
        "size",
        "material",
        "price",
        "purchase_date",
        "colors",
        "seasons",
        "tags",
        "notes",
        "location_id",
        "created_at",
        "updated_at",
        "photo_id",
      ].sort(),
    );
    expect(Object.keys(r.value.wearLogs[0]).sort()).toEqual(["id", "item_id", "worn_on"]);
    expect(r.value.items[0].location_id).toBe(u(1));
  });

  it("keeps Vietnamese names, NFC-normalized", () => {
    const r = parseBackup(file({ locations: [loc(1, { name: "  Tủ áo  " })] }));
    expect(r.ok && r.value.locations[0].name).toBe("Tủ áo");
  });

  it("rejects a non-object, a wrong version and unknown top-level keys", () => {
    expect(err(null)).toEqual({ field: null, reason: "notObject" });
    expect(err([])).toEqual({ field: null, reason: "notObject" });
    expect(err(file({ version: 2 })).reason).toBe("versionUnsupported");
    expect(err(file({ version: "1" })).reason).toBe("versionUnsupported");
    expect(err(file({ extra: 1 })).reason).toBe("unknownKey");
  });

  it("rejects a bad exportedAt and missing or non-array lists", () => {
    expect(err(file({ exportedAt: 5 }))).toEqual({ field: "exportedAt", reason: "invalidType" });
    for (const k of ["locations", "items", "wearLogs"]) {
      expect(err(file({ [k]: {} }))).toEqual({ field: k, reason: "invalidType" });
      const rest: Record<string, unknown> = { ...file() };
      delete rest[k];
      expect(err(rest)).toEqual({ field: k, reason: "invalidType" });
    }
  });

  it("caps each list one over the cap", () => {
    const caps = { bytes: 1, locations: 1, items: 1, wearLogs: 1 };
    expect(err(file({ locations: [loc(1), loc(2)] }), caps)).toEqual({
      field: "locations",
      reason: "tooMany",
    });
    expect(err(file({ items: [item(1), item(2)] }), caps).reason).toBe("tooMany");
    const w = (n: number) => ({ id: u(500 + n), item_id: u(101), worn_on: `2026-01-0${n}` });
    expect(err(file({ items: [item(1)], wearLogs: [w(1), w(2)] }), caps).field).toBe("wearLogs");
  });

  it("checks ids and duplicates with indexed fields", () => {
    expect(err(file({ items: [item(1), item(2, { id: "nope" })] }))).toEqual({
      field: "items[1].id",
      reason: "idInvalid",
    });
    expect(err(file({ items: [item(1), item(1)] }))).toEqual({
      field: "items[1].id",
      reason: "duplicateId",
    });
    expect(err(file({ locations: [loc(1), loc(1, { name: "other" })] })).reason).toBe(
      "duplicateId",
    );
  });

  it("reuses the item rules with indexed fields", () => {
    const items = [item(1), item(2), item(3), item(4, { name: "  " })];
    expect(err(file({ items }))).toEqual({ field: "items[3].name", reason: "nameRequired" });
    expect(err(file({ items: [item(1, { price: -1 })] }))).toEqual({
      field: "items[0].price",
      reason: "priceNegative",
    });
    expect(err(file({ items: [item(1, { category: "bag" })] }))).toEqual({
      field: "items[0].category",
      reason: "invalidValue",
    });
    expect(err(file({ items: ["x"] }))).toEqual({ field: "items[0]", reason: "notObject" });
  });

  it("requires ISO millisecond timestamps that round-trip", () => {
    const bads = ["2026-02-30T00:00:00.000Z", "2026-03-04", "2026-03-04T05:00:00Z", 5, undefined];
    for (const bad of bads) {
      expect(err(file({ items: [item(1, { created_at: bad })] }))).toEqual({
        field: "items[0].created_at",
        reason: "timestampInvalid",
      });
    }
    expect(err(file({ items: [item(1, { updated_at: "x" })] })).field).toBe("items[0].updated_at");
    expect(err(file({ locations: [loc(1, { created_at: "x" })] })).field).toBe(
      "locations[0].created_at",
    );
  });

  it("checks location fields", () => {
    expect(err(file({ locations: [loc(1, { name: "" })] })).reason).toBe("nameRequired");
    expect(err(file({ locations: [loc(1, { name: "x".repeat(81) })] })).reason).toBe("tooLong");
    expect(parseBackup(file({ locations: [loc(1, { name: "x".repeat(80) })] })).ok).toBe(true);
    expect(err(file({ locations: [loc(1, { name: "Tủ" }), loc(2, { name: "Tủ" })] }))).toEqual({
      field: "locations[1].name",
      reason: "duplicateName",
    });
    expect(err(file({ locations: [loc(1, { parent_id: u(1) })] })).reason).toBe("invalidValue");
    expect(err(file({ locations: [loc(1, { parent_id: u(2) })] })).reason).toBe("danglingRef");
    expect(
      err(file({ locations: [loc(1, { parent_id: u(2) }), loc(2, { parent_id: u(1) })] })).reason,
    ).toBe("cycle");
    for (const so of [1.5, "1", 2 ** 31, Number.MAX_SAFE_INTEGER + 1]) {
      expect(err(file({ locations: [loc(1, { sort_order: so })] })).reason).toBe("invalidValue");
    }
    expect(parseBackup(file({ locations: [loc(1, { sort_order: -5 })] })).ok).toBe(true);
  });

  it("checks references", () => {
    expect(err(file({ items: [item(1, { location_id: u(9) })] }))).toEqual({
      field: "items[0].location_id",
      reason: "danglingRef",
    });
    expect(parseBackup(file({ items: [item(1, { location_id: null })] })).ok).toBe(true);
    expect(err(file({ wearLogs: [{ id: u(500), item_id: u(9), worn_on: "2026-01-01" }] }))).toEqual(
      {
        field: "wearLogs[0].item_id",
        reason: "danglingRef",
      },
    );
  });

  it("checks wear logs", () => {
    const w = (n: number, day: string) => ({ id: u(500 + n), item_id: u(101), worn_on: day });
    expect(err(file({ items: [item(1)], wearLogs: [w(1, "2026-02-30")] }))).toEqual({
      field: "wearLogs[0].worn_on",
      reason: "dateInvalid",
    });
    expect(parseBackup(file({ items: [item(1)], wearLogs: [w(1, "2001-01-01")] })).ok).toBe(true);
    expect(
      err(file({ items: [item(1)], wearLogs: [w(1, "2026-01-01"), w(2, "2026-01-01")] })),
    ).toEqual({ field: "wearLogs[1]", reason: "duplicateWear" });
  });

  it("photo_id is null or a uuid", () => {
    expect(parseBackup(file({ items: [item(1, { photo_id: null })] })).ok).toBe(true);
    expect(err(file({ items: [item(1, { photo_id: "p" })] }))).toEqual({
      field: "items[0].photo_id",
      reason: "idInvalid",
    });
  });
});
