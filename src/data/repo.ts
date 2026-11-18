import type { Item } from "@/types/item";
import type { Backup, RestoreSummary } from "./backup";

export type WearResult = Pick<Item, "wearCount" | "lastWorn">;
/** `already` is true when +1 found a wear for today (nothing added); always false for -1. */
export type WearOutcome = WearResult & { already: boolean };

export interface SaveOptions {
  /**
   * Called once with the prepared (EXIF-free) JPEG, only when the item has a new photo to upload, before the item
   * is written. The returned item's field values are saved; its id and the uploaded bytes cannot change (F-703).
   */
  withPrepared?: (jpeg: Blob, item: Item) => Promise<Item>;
}

/** Persistence boundary. The UI only talks to this interface; the one implementation is the HTTP repo (D44). */
export interface WardrobeRepo {
  list(): Promise<Item[]>;
  locations(): Promise<string[]>;
  /** Create (when `id` is not persisted yet) or update. Returns the stored item. */
  save(item: Item, opts?: SaveOptions): Promise<Item>;
  remove(item: Item): Promise<void>;
  /** +1 = "Mặc hôm nay", -1 = undo the latest wear. */
  wear(item: Item, delta: 1 | -1): Promise<WearOutcome>;
  /** The whole account as a version-1 backup (F-602). */
  exportAll(): Promise<Backup>;
  /** Upsert by id, never deletes, never touches photos. The server validates (D49). */
  restore(backup: Backup): Promise<RestoreSummary>;
}
