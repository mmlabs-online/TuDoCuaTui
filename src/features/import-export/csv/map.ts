import {
  CATEGORY_ALIASES,
  CATEGORY_TO_DB,
  COLOR_TO_DB,
  OTHER_CATEGORY,
  SEASON_TO_DB,
  STATUS_TO_DB,
} from "@/data/mappers";
import { normalize } from "@/lib/text";
import type { Item, Status } from "@/types/item";
import { CSV_MAP_COPY as COPY } from "../copy";
import type { ParsedCsv } from "./parse";
import { NAME_MAX, nameError } from "@/features/items/validate";
import { toDateOnly } from "./serialize";

export type CsvField =
  | "name"
  | "category"
  | "status"
  | "colors"
  | "seasons"
  | "brand"
  | "size"
  | "location"
  | "price"
  | "purchase_date"
  | "material"
  | "tags"
  | "notes";

export interface RowError {
  /** 1-based index into `parsed.rows` (header excluded). */
  row: number;
  field: CsvField;
  message: string;
}

export interface MapResult {
  valid: Item[];
  errors: RowError[];
  ignoredColumns: string[];
}

export interface MapOptions {
  /** Existing location names (D8 matching). */
  locations?: string[];
  /** YYYY-MM-DD; defaults to today in UTC+7. */
  today?: string;
  /** createdAt of the produced items; defaults to the current time. */
  now?: string;
}

const ALIASES: Record<CsvField, string[]> = {
  name: ["Tên", "name"],
  category: ["Loại", "category"],
  status: ["Trạng thái", "status"],
  colors: ["Màu", "colors"],
  seasons: ["Mùa", "seasons"],
  brand: ["Hãng", "brand"],
  size: ["Size", "size"],
  location: ["Vị trí", "location"],
  price: ["Giá", "price"],
  purchase_date: ["Ngày mua", "purchase_date"],
  material: ["Chất liệu", "material"],
  tags: ["Tag", "tags"],
  notes: ["Ghi chú", "notes"],
};

const HEADER_TO_FIELD = new Map<string, CsvField>(
  (Object.entries(ALIASES) as [CsvField, string[]][]).flatMap(([field, names]) =>
    names.map((n) => [normalize(n), field] as const),
  ),
);

/** normalize(label) and normalize(id) → label. */
function lookup(table: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [label, id] of Object.entries(table)) {
    m.set(normalize(label), label);
    m.set(normalize(id), label);
  }
  return m;
}

const CATEGORIES = lookup(CATEGORY_TO_DB);
for (const [old, label] of Object.entries(CATEGORY_ALIASES)) CATEGORIES.set(normalize(old), label);
const STATUSES = lookup(STATUS_TO_DB);
const SEASONS = lookup(SEASON_TO_DB);
const COLORS = lookup(COLOR_TO_DB);

export function splitMulti(s: string): string[] {
  const parts = s
    .split(/[;|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/** Integer price, or null when the text is not a valid price. Empty → 0. */
export function parsePrice(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  return null;
}

export type DateResult = { ok: true; value: string } | { ok: false; reason: "bad" | "future" };

export function parseDate(s: string, today: string): DateResult {
  const t = s.trim();
  if (t === "") return { ok: true, value: "" };
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return { ok: false, reason: "bad" };
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    return { ok: false, reason: "bad" };
  const value = dt.toISOString().slice(0, 10);
  if (value > today) return { ok: false, reason: "future" };
  return { ok: true, value };
}

export function mapRows(parsed: ParsedCsv, options: MapOptions = {}): MapResult {
  const today = options.today ?? toDateOnly(new Date().toISOString());
  const now = options.now ?? new Date().toISOString();

  const columns = new Map<CsvField, number>();
  const ignoredColumns: string[] = [];
  parsed.headers.forEach((h, i) => {
    const key = normalize(h);
    if (key === "") return;
    const field = HEADER_TO_FIELD.get(key);
    if (field && !columns.has(field)) columns.set(field, i);
    else ignoredColumns.push(h.trim());
  });

  const locations = new Map<string, string>();
  for (const l of options.locations ?? []) {
    const name = l.trim().normalize("NFC");
    if (name && !locations.has(normalize(name))) locations.set(normalize(name), name);
  }

  const valid: Item[] = [];
  const errors: RowError[] = [];

  parsed.rows.forEach((cells, index) => {
    const row = index + 1;
    const rowErrors: RowError[] = [];
    const fail = (field: CsvField, message: string) => rowErrors.push({ row, field, message });
    const cell = (f: CsvField) => {
      const i = columns.get(f);
      return ((i === undefined ? "" : cells[i]) ?? "").trim().normalize("NFC");
    };

    const name = cell("name");
    const ne = nameError(name);
    if (ne === "nameRequired") fail("name", COPY.nameRequired);
    else if (ne === "nameTooLong") fail("name", COPY.nameTooLong(NAME_MAX));

    const rawCategory = cell("category");
    let category = OTHER_CATEGORY;
    if (rawCategory !== "") {
      const hit = CATEGORIES.get(normalize(rawCategory));
      if (hit) category = hit;
      else fail("category", COPY.unknownCategory(rawCategory));
    }

    const rawStatus = cell("status");
    let status = "Đang dùng";
    if (rawStatus !== "") {
      const hit = STATUSES.get(normalize(rawStatus));
      if (hit) status = hit;
      else fail("status", COPY.unknownStatus(rawStatus));
    }

    const multi = (
      field: "colors" | "seasons",
      table: Map<string, string>,
      message: (v: string[]) => string,
    ) => {
      const out: string[] = [];
      const unknown: string[] = [];
      for (const v of splitMulti(cell(field))) {
        const hit = table.get(normalize(v));
        if (!hit) unknown.push(v);
        else if (!out.includes(hit)) out.push(hit);
      }
      if (unknown.length) fail(field, message(unknown));
      return out;
    };
    const colors = multi("colors", COLORS, COPY.unknownColors);
    const seasons = multi("seasons", SEASONS, COPY.unknownSeasons);

    const rawPrice = cell("price");
    const price = parsePrice(rawPrice);
    if (price === null) fail("price", COPY.badPrice(rawPrice));

    const rawDate = cell("purchase_date");
    const date = parseDate(rawDate, today);
    if (!date.ok)
      fail(
        "purchase_date",
        date.reason === "bad" ? COPY.badDate(rawDate) : COPY.futureDate(rawDate),
      );

    let location = cell("location");
    if (location !== "") {
      const key = normalize(location);
      const known = locations.get(key);
      if (known) location = known;
      else locations.set(key, location);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    valid.push({
      id: "",
      name,
      category,
      status: status as Status,
      colors,
      seasons,
      brand: cell("brand"),
      size: cell("size"),
      location,
      price: price ?? 0,
      purchaseDate: date.ok ? date.value : "",
      material: cell("material"),
      tags: splitMulti(cell("tags")),
      notes: cell("notes"),
      photo: "",
      wearCount: 0,
      lastWorn: "",
      createdAt: now,
    });
  });

  return { valid, errors, ignoredColumns };
}
