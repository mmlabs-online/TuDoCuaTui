import type { Item } from "@/types/item";
import type { Backup } from "@/data/backup";
import { toCsv } from "@/features/import-export/csv/serialize";

type SavedFile = { content: string; mime: string; filename: string };

export function exportFile(items: Item[], type: "csv"): SavedFile {
  return {
    content: toCsv(items),
    mime: "text/csv;charset=utf-8",
    filename: `tu-do-cua-toi.${type}`,
  };
}

/** The server backup, pretty-printed so two exports can be diffed. */
export function backupFile(backup: Backup): SavedFile {
  return {
    content: JSON.stringify(backup, null, 2),
    mime: "application/json",
    filename: "tu-do-cua-toi.json",
  };
}

function saveFile({ content, mime, filename }: SavedFile): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function download(items: Item[], type: "csv"): void {
  saveFile(exportFile(items, type));
}

export function downloadBackup(backup: Backup): void {
  saveFile(backupFile(backup));
}
