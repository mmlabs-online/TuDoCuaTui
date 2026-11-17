import type { Item } from "@/types/item";

export type WearResult = Pick<Item, "wearCount" | "lastWorn">;
/** `already` is true when +1 found a wear for today (nothing added); always false for -1. */
export type WearOutcome = WearResult & { already: boolean };

/** Persistence boundary. The UI only talks to this interface; the one implementation is the HTTP repo (D44). */
export interface WardrobeRepo {
  list(): Promise<Item[]>;
  locations(): Promise<string[]>;
  /** Create (when `id` is not persisted yet) or update. Returns the stored item. */
  save(item: Item): Promise<Item>;
  remove(item: Item): Promise<void>;
  /** +1 = "Mặc hôm nay", -1 = undo the latest wear. */
  wear(item: Item, delta: 1 | -1): Promise<WearOutcome>;
}
