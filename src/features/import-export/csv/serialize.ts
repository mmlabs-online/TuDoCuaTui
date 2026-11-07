import type { Item } from "@/types/item";

const BOM = "﻿";

/** English ids accepted by the F-601.2 importer, plus the two derived columns (ignored on import, D7). */
export const CSV_HEADERS = [
  "name",
  "category",
  "status",
  "colors",
  "seasons",
  "brand",
  "size",
  "location",
  "price",
  "purchase_date",
  "material",
  "tags",
  "notes",
  "wear_count",
  "last_worn",
] as const;

/** RFC 4180: quote fields containing `,`, `"` or a line break; double any `"`. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** YYYY-MM-DD. Date-only values pass through; timestamps become the UTC+7 date. */
export function toDateOnly(value: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const join = (a: string[] | undefined) => (a ?? []).join("|");

export function toCsv(items: Item[]): string {
  const rows = items.map((i) =>
    [
      i.name ?? "",
      i.category ?? "",
      i.status ?? "",
      join(i.colors),
      join(i.seasons),
      i.brand ?? "",
      i.size ?? "",
      i.location ?? "",
      i.price > 0 ? String(Math.round(i.price)) : "",
      toDateOnly(i.purchaseDate ?? ""),
      i.material ?? "",
      join(i.tags),
      i.notes ?? "",
      String(i.wearCount ?? 0),
      toDateOnly(i.lastWorn ?? ""),
    ]
      .map(csvField)
      .join(","),
  );
  return BOM + [CSV_HEADERS.join(","), ...rows].join("\r\n");
}
