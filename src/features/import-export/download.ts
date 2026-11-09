import type { Item } from "@/types/item";
import { toCsv } from "@/features/import-export/csv/serialize";

type ExportType = "json" | "csv";

export function exportFile(
  items: Item[],
  type: ExportType,
): { content: string; mime: string; filename: string } {
  return {
    content: type === "json" ? JSON.stringify(items, null, 2) : toCsv(items),
    mime: type === "json" ? "application/json" : "text/csv;charset=utf-8",
    filename: `tu-do-cua-toi.${type}`,
  };
}

export function download(items: Item[], type: ExportType): void {
  const { content, mime, filename } = exportFile(items, type);
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
