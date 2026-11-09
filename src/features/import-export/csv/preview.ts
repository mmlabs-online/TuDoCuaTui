import type { Item } from "@/types/item";
import { type MapOptions, mapRows } from "./map";
import { CsvParseError, parseCsv } from "./parse";

export const PREVIEW_ROWS = 20;

export interface CsvPreviewRow {
  /** 1-based data row (header excluded). */
  row: number;
  item?: Item;
  errors: string[];
}

export type CsvPreview =
  | { kind: "empty" }
  | { kind: "parseError"; line: number }
  | {
      kind: "ready";
      total: number;
      items: Item[];
      /** Data row of each entry in `items`. */
      itemRows: number[];
      skipped: number;
      rows: CsvPreviewRow[];
      ignoredColumns: string[];
    };

export function buildCsvPreview(text: string, options?: MapOptions): CsvPreview {
  if (text.trim() === "") return { kind: "empty" };
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (e) {
    if (e instanceof CsvParseError) return { kind: "parseError", line: e.line };
    throw e;
  }
  const { valid, errors, ignoredColumns } = mapRows(parsed, options);
  const total = parsed.rows.length;
  const byRow = new Map<number, string[]>();
  for (const e of errors) byRow.set(e.row, [...(byRow.get(e.row) ?? []), e.message]);
  const itemRows: number[] = [];
  for (let r = 1; r <= total; r++) if (!byRow.has(r)) itemRows.push(r);
  const rows = Array.from({ length: Math.min(PREVIEW_ROWS, total) }, (_, i) => {
    const row = i + 1;
    const errs = byRow.get(row) ?? [];
    return errs.length
      ? { row, errors: errs }
      : { row, item: valid[itemRows.indexOf(row)], errors: errs };
  });
  return {
    kind: "ready",
    total,
    items: valid,
    itemRows,
    skipped: byRow.size,
    rows,
    ignoredColumns,
  };
}
