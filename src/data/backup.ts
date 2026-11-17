/** Wire format of `GET /api/backup` / `POST /api/restore` (F-602.1, `server/README.md`). */
export type BackupLocation = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
};

export type BackupItem = {
  id: string;
  name: string;
  category: string;
  status: string;
  brand: string | null;
  size: string | null;
  material: string | null;
  price: number | null;
  purchase_date: string | null;
  location_id: string | null;
  colors: string[];
  seasons: string[];
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  photo_id: string | null;
};

export type BackupWearLog = { id: string; item_id: string; worn_on: string };

export type Backup = {
  version: 1;
  exportedAt: string;
  locations: BackupLocation[];
  items: BackupItem[];
  wearLogs: BackupWearLog[];
};

export type RestoreSummary = {
  locations: {
    inserted: number;
    updated: number;
    unchanged: number;
    merged: number;
    remapped: number;
  };
  items: { inserted: number; updated: number; unchanged: number; remapped: number };
  wearLogs: { inserted: number; unchanged: number };
  photosMissing: number;
};

/** Mirror of `server/validate.js:206`. The client only pre-checks; the server is authoritative (D49). */
export const BACKUP_CAPS = {
  bytes: 8 * 1024 * 1024,
  locations: 200,
  items: 3000,
  wearLogs: 50000,
};
type Caps = typeof BACKUP_CAPS;
export type BackupList = "locations" | "items" | "wearLogs";

export type BackupCounts = {
  locations: number;
  items: number;
  wearLogs: number;
  withPhoto: number;
};

export type PrecheckError =
  | { reason: "tooLarge"; max: number }
  | { reason: "empty" | "notJson" | "legacyArray" | "notObject" | "versionUnsupported" }
  | { reason: "missingList"; field: BackupList }
  | { reason: "tooMany"; field: BackupList; max: number };

export type PrecheckResult =
  | { ok: true; backup: Backup; counts: BackupCounts }
  | ({ ok: false } & PrecheckError);

export function precheckBackupSize(
  bytes: number,
  caps: Caps = BACKUP_CAPS,
): { ok: true } | { ok: false; reason: "tooLarge"; max: number } {
  return bytes > caps.bytes ? { ok: false, reason: "tooLarge", max: caps.bytes } : { ok: true };
}

/** Size, JSON, version, lists and caps only. Rows are validated by the server. */
export function precheckBackup(text: string, caps: Caps = BACKUP_CAPS): PrecheckResult {
  if (!text.trim()) return { ok: false, reason: "empty" };
  if (new TextEncoder().encode(text).length > caps.bytes) {
    return { ok: false, reason: "tooLarge", max: caps.bytes };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  if (Array.isArray(data)) return { ok: false, reason: "legacyArray" };
  if (typeof data !== "object" || data === null) return { ok: false, reason: "notObject" };
  const obj = data as Record<string, unknown>;
  if (obj.version !== 1) return { ok: false, reason: "versionUnsupported" };
  for (const field of ["locations", "items", "wearLogs"] as const) {
    const list = obj[field];
    if (!Array.isArray(list)) return { ok: false, reason: "missingList", field };
    if (list.length > caps[field]) return { ok: false, reason: "tooMany", field, max: caps[field] };
  }
  const backup = obj as unknown as Backup;
  return {
    ok: true,
    backup,
    counts: {
      locations: backup.locations.length,
      items: backup.items.length,
      wearLogs: backup.wearLogs.length,
      withPhoto: backup.items.filter((i) => i?.photo_id).length,
    },
  };
}

export type SummaryLine = { key: string; n: number };

/** Ordered lines for the restore summary; zero `merged`, `remapped` and `photosMissing` are hidden. */
export function summaryLines(s: RestoreSummary): SummaryLine[] {
  const lines: SummaryLine[] = [
    { key: "itemsInserted", n: s.items.inserted },
    { key: "itemsUpdated", n: s.items.updated },
    { key: "itemsUnchanged", n: s.items.unchanged },
    { key: "itemsRemapped", n: s.items.remapped },
    { key: "locationsInserted", n: s.locations.inserted },
    { key: "locationsUpdated", n: s.locations.updated },
    { key: "locationsUnchanged", n: s.locations.unchanged },
    { key: "locationsMerged", n: s.locations.merged },
    { key: "locationsRemapped", n: s.locations.remapped },
    { key: "wearLogsInserted", n: s.wearLogs.inserted },
    { key: "wearLogsUnchanged", n: s.wearLogs.unchanged },
    { key: "photosMissing", n: s.photosMissing },
  ];
  const optional = ["itemsRemapped", "locationsMerged", "locationsRemapped", "photosMissing"];
  return lines.filter((l) => !(optional.includes(l.key) && l.n === 0));
}
