// @ts-check
// Pure input validation for the /api endpoints. Returns the first error in a fixed field order.

// Copied from db/migrations/20261110120000_init.sql + 20261112140000_item_category_v2.sql; api.db.test.ts guards against drift.
// Display order (D29).
export const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "set",
  "shoes",
  "ao_dai",
  "outer",
  "bikini",
  "accessory",
  "other",
];
// Still in the Postgres enum (expand-only) but rejected by the API.
export const DEPRECATED_CATEGORIES = ["bag", "sport", "home"];
export const STATUSES = ["active", "stored", "laundry", "lent", "out"];
export const SEASONS = ["spring", "summer", "autumn", "winter"];
// Copy of src/data/mappers.ts COLOR_TO_DB values; server/ai/parity.test.ts guards drift.
export const COLOR_IDS = [
  "den",
  "trang",
  "xam",
  "kem",
  "be",
  "nau",
  "do",
  "hong",
  "cam",
  "vang",
  "xanhla",
  "reu",
  "xanhduong",
  "navy",
  "tim",
  "hoatiet",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86400000;

/** @param {string} s */
const cpLen = (s) => [...s].length;
/** @param {string} s */
const hasNul = (s) => s.includes("\u0000");
/** @param {unknown} s */
export const isUuid = (s) => typeof s === "string" && UUID.test(s);

/** @param {unknown} s */
export function isCalendarDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  if (Number(s.slice(0, 4)) < 1000) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in Asia/Ho_Chi_Minh (UTC+7, no DST). @param {number} now epoch ms */
export const vnToday = (now) => new Date(now + 7 * 3600e3).toISOString().slice(0, 10);

/** @typedef {{ ok: false, field: string | null, reason: string }} Fail */
/** @param {string | null} field @param {string} reason @returns {Fail} */
const fail = (field, reason) => ({ ok: false, field, reason });
/** @param {unknown} v */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Optional trimmed string: undefined/null/'' -> null.
 * @param {unknown} v @param {number} max @param {string} field
 * @returns {{ value: string | null } | Fail}
 */
function optString(v, max, field) {
  if (v === undefined || v === null) return { value: null };
  if (typeof v !== "string") return fail(field, "invalidType");
  if (hasNul(v)) return fail(field, "invalidValue");
  const t = v.trim();
  if (cpLen(t) > max) return fail(field, "tooLong");
  return { value: t === "" ? null : t };
}

/**
 * @param {unknown} v @param {string} field @param {number} maxLen
 * @param {readonly string[] | null} allowed
 * @returns {{ value: string[] } | Fail}
 */
function stringArray(v, field, maxLen, allowed) {
  if (v === undefined) return { value: [] };
  if (!Array.isArray(v)) return fail(field, "invalidType");
  if (v.length > 50) return fail(field, "tooMany");
  for (const e of v) {
    if (typeof e !== "string") return fail(field, "invalidType");
    if (hasNul(e) || (allowed && !allowed.includes(e))) return fail(field, "invalidValue");
    if (cpLen(e) > maxLen) return fail(field, "tooLong");
  }
  return { value: [...v] };
}

/** @param {unknown} body */
export function parseItemInput(body) {
  if (!isObject(body)) return fail(null, "notObject");
  const b = /** @type {Record<string, unknown>} */ (body);

  if (typeof b.name !== "string" || b.name.trim() === "") return fail("name", "nameRequired");
  if (hasNul(b.name)) return fail("name", "invalidValue");
  const name = b.name.trim();
  if (cpLen(name) > 120) return fail("name", "nameTooLong");

  /** @param {string} field @param {readonly string[]} allowed @param {string} dflt */
  const pick = (field, allowed, dflt) => {
    const v = b[field];
    if (v === undefined) return dflt;
    return typeof v === "string" && allowed.includes(v) ? v : null;
  };
  const category = pick("category", CATEGORIES, "other");
  if (category === null) return fail("category", "invalidValue");
  const status = pick("status", STATUSES, "active");
  if (status === null) return fail("status", "invalidValue");

  const brand = optString(b.brand, 200, "brand");
  if ("ok" in brand) return brand;
  const size = optString(b.size, 200, "size");
  if ("ok" in size) return size;
  const material = optString(b.material, 200, "material");
  if ("ok" in material) return material;

  let price = null;
  if (b.price !== undefined && b.price !== null) {
    const p = b.price;
    if (typeof p === "number" && Number.isSafeInteger(p) && p < 0) {
      return fail("price", "priceNegative");
    }
    if (typeof p !== "number" || !Number.isSafeInteger(p) || p >= 1e14) {
      return fail("price", "priceInvalid");
    }
    price = p;
  }

  let purchaseDate = null;
  const pd = b.purchase_date;
  if (pd !== undefined && pd !== null && pd !== "") {
    if (!isCalendarDate(pd)) return fail("purchase_date", "dateInvalid");
    purchaseDate = pd;
  }

  let locationName = null;
  const ln = b.location_name;
  if (ln !== undefined && ln !== null) {
    if (typeof ln !== "string") return fail("location_name", "invalidType");
    if (hasNul(ln)) return fail("location_name", "invalidValue");
    const t = ln.normalize("NFC").trim();
    if (cpLen(t) > 80) return fail("location_name", "tooLong");
    locationName = t === "" ? null : t;
  }

  const colors = stringArray(b.colors, "colors", 50, null);
  if ("ok" in colors) return colors;
  const seasons = stringArray(b.seasons, "seasons", 50, SEASONS);
  if ("ok" in seasons) return seasons;
  const tags = stringArray(b.tags, "tags", 50, null);
  if ("ok" in tags) return tags;
  const notes = optString(b.notes, 2000, "notes");
  if ("ok" in notes) return notes;

  return {
    ok: /** @type {const} */ (true),
    value: {
      name,
      category,
      status,
      brand: brand.value,
      size: size.value,
      material: material.value,
      price,
      purchase_date: purchaseDate,
      location_name: locationName,
      colors: colors.value,
      seasons: seasons.value,
      tags: tags.value,
      notes: notes.value,
    },
  };
}

/** @param {unknown} body @param {number} now epoch ms */
export function parseWearInput(body, now) {
  if (!isObject(body)) return fail(null, "notObject");
  const b = /** @type {Record<string, unknown>} */ (body);
  if (b.delta !== 1 && b.delta !== -1) return fail("delta", "invalidValue");
  if (!isCalendarDate(b.today)) return fail("today", "dateInvalid");
  const diff = Math.abs(
    Date.parse(`${b.today}T00:00:00Z`) - Date.parse(`${vnToday(now)}T00:00:00Z`),
  );
  if (diff > DAY_MS) return fail("today", "todayOutOfRange");
  return {
    ok: /** @type {const} */ (true),
    value: { delta: /** @type {1 | -1} */ (b.delta), today: /** @type {string} */ (b.today) },
  };
}
