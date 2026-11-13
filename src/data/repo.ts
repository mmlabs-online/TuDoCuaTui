import type { Item } from "@/types/item";
import { localToday, toLocalDate } from "@/lib/dates";
import { toCategoryLabel } from "./mappers";

export type WearResult = Pick<Item, "wearCount" | "lastWorn">;
/** `already` is true when +1 found a wear for today (nothing added); always false for -1. */
export type WearOutcome = WearResult & { already: boolean };

/** Persistence boundary. The UI only talks to this interface. */
export interface WardrobeRepo {
  mode: "local" | "api";
  list(): Promise<Item[]>;
  locations(): Promise<string[]>;
  /** Create (when `id` is not persisted yet) or update. Returns the stored item. */
  save(item: Item): Promise<Item>;
  remove(item: Item): Promise<void>;
  /** +1 = "Mặc hôm nay", -1 = undo the latest wear. */
  wear(item: Item, delta: 1 | -1): Promise<WearOutcome>;
}

// =====================================================================
// Local mode — localStorage, demo data. Used when the Node API is not reachable (`pnpm dev`, Figma Make preview).
// =====================================================================
const LS_KEY = "tu-do-items";

export function createLocalRepo(starter: Item[], defaultLocations: string[]): WardrobeRepo {
  let cache: Item[] | null = null;
  const prevWorn = new Map<string, string>(); // lastWorn before today's wear, for undo (session only)
  const load = (): Item[] => {
    if (cache) return cache;
    let items: Item[];
    try {
      items = JSON.parse(localStorage.getItem(LS_KEY) || "null") ?? starter;
    } catch {
      items = starter;
    }
    cache = items.map((i) => ({ ...i, category: toCategoryLabel(i.category) }));
    return cache;
  };
  const persist = (items: Item[]) => {
    cache = items;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch {
      /* quota / private mode — keep in memory */
    }
  };

  return {
    mode: "local",
    async list() {
      return load();
    },
    async locations() {
      return [
        ...new Set([
          ...defaultLocations,
          ...load()
            .map((i) => i.location)
            .filter(Boolean),
        ]),
      ];
    },
    async save(item) {
      const items = load();
      const saved = { ...item, id: item.id || crypto.randomUUID() };
      const exists = items.some((i) => i.id === saved.id);
      persist(exists ? items.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...items]);
      return saved;
    },
    async remove(item) {
      persist(load().filter((i) => i.id !== item.id));
    },
    async wear(item, delta) {
      const items = load();
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
      persist(items.map((i) => (i.id === item.id ? { ...i, ...res } : i)));
      return { ...res, already: false };
    },
  };
}
