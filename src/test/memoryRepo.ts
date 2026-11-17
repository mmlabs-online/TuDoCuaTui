import type { Item } from "@/types/item";
import { localToday, toLocalDate } from "@/lib/dates";
import type { Backup } from "@/data/backup";
import type { WardrobeRepo, WearResult } from "@/data/repo";

/** In-memory `WardrobeRepo` test double (formerly the local-mode repo; D44 removed it from production). */
export function createMemoryRepo(starter: Item[], defaultLocations: string[]): WardrobeRepo {
  let items = starter.map((i) => ({ ...i }));
  let backup: Backup = { version: 1, exportedAt: "", locations: [], items: [], wearLogs: [] };
  const prevWorn = new Map<string, string>(); // lastWorn before today's wear, for undo

  return {
    async list() {
      return items;
    },
    async locations() {
      return [...new Set([...defaultLocations, ...items.map((i) => i.location).filter(Boolean)])];
    },
    async save(item) {
      const saved = { ...item, id: item.id || crypto.randomUUID() };
      const exists = items.some((i) => i.id === saved.id);
      items = exists ? items.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...items];
      return saved;
    },
    async remove(item) {
      items = items.filter((i) => i.id !== item.id);
    },
    async wear(item, delta) {
      const cur = items.find((i) => i.id === item.id) ?? item;
      const today = localToday();
      const wornToday = toLocalDate(cur.lastWorn) === today;
      if (delta > 0 && wornToday) {
        return { wearCount: cur.wearCount, lastWorn: cur.lastWorn, already: true };
      }
      const wearCount = Math.max(0, cur.wearCount + delta);
      let lastWorn = cur.lastWorn;
      if (delta > 0) {
        prevWorn.set(item.id, cur.lastWorn);
        lastWorn = today;
      } else if (wearCount === 0) {
        lastWorn = "";
      } else if (wornToday) {
        lastWorn = prevWorn.get(item.id) ?? "";
        prevWorn.delete(item.id);
      }
      const res: WearResult = { wearCount, lastWorn };
      items = items.map((i) => (i.id === item.id ? { ...i, ...res } : i));
      return { ...res, already: false };
    },
    async exportAll() {
      return { ...backup, exportedAt: new Date().toISOString() };
    },
    async restore(b) {
      backup = b;
      return {
        locations: {
          inserted: b.locations.length,
          updated: 0,
          unchanged: 0,
          merged: 0,
          remapped: 0,
        },
        items: { inserted: b.items.length, updated: 0, unchanged: 0, remapped: 0 },
        wearLogs: { inserted: b.wearLogs.length, unchanged: 0 },
        photosMissing: b.items.filter((i) => i.photo_id).length,
      };
    },
  };
}
