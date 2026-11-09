import type { Item } from "@/types/item";

export type RunResult =
  | { index: number; ok: true; item: Item }
  | { index: number; ok: false; error: unknown };

/**
 * Saves rows one after another. A failed row does not stop the run; an abort stops it
 * before the next row (a save in flight is never cancelled).
 */
export async function runImport(
  list: Item[],
  save: (item: Item) => Promise<Item>,
  opts: {
    onSaved?: (item: Item, index: number) => void;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let i = 0; i < list.length; i++) {
    if (opts.signal?.aborted) break;
    try {
      const item = await save(list[i]);
      results.push({ index: i, ok: true, item });
      opts.onSaved?.(item, i);
    } catch (error) {
      results.push({ index: i, ok: false, error });
    }
    opts.onProgress?.(i + 1, list.length);
  }
  return results;
}
