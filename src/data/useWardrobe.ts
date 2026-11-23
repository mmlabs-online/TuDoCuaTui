import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item } from "@/types/item";
import { PhotoSaveError } from "./apiErrors";
import type { Backup } from "./backup";
import { runImport } from "./importRunner";
import {
  abortableWait,
  runPhotoImport,
  type PhotoImportOptions,
  type PhotoJob,
} from "./photoImport";
import type { GetToken } from "./authFetch";
import { makeThumb } from "./photoThumb";
import { createPhotoLoader, type PhotoLoader } from "./photoUrls";
import { createHttpRepo } from "./repo.http";
import type { SaveOptions } from "./repo";

export type ImportResult =
  | { index: number; ok: true; item: Item }
  | { index: number; ok: false; error: string };

const message = (e: unknown) => {
  return (e as Error)?.message || "Có lỗi xảy ra, thử lại nhé";
};

/**
 * Single source of truth for wardrobe data.
 * Always the Node API. With `getToken` (production sign-in) photos are fetched with the bearer and shown as
 * blob: URLs (D34); without it (the dev proxy authenticates) they load from their plain URL.
 */
export function useWardrobe({
  getToken,
  onAuthLost,
}: { getToken?: GetToken; onAuthLost?: () => void } = {}) {
  const repo = useMemo(
    () => createHttpRepo(undefined, undefined, undefined, { getToken, onAuthLost }),
    [], // getToken is injected once
  );
  const photos = useMemo<PhotoLoader | null>(
    () => (getToken ? createPhotoLoader({ getToken, onAuthLost, makeThumb }) : null),
    [], // getToken is injected once
  );
  useEffect(() => () => photos?.clear(), [photos]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [its, locs] = await Promise.all([repo.list(), repo.locations()]);
      setItems(its);
      setLocations(locs);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertLocal = (saved: Item) => {
    setItems((p) =>
      p.some((i) => i.id === saved.id)
        ? p.map((i) => (i.id === saved.id ? saved : i))
        : [saved, ...p],
    );
    if (saved.location)
      setLocations((p) => (p.includes(saved.location) ? p : [...p, saved.location]));
  };

  const save = useCallback(
    async (item: Item, opts?: SaveOptions) => {
      try {
        const saved = await (opts ? repo.save(item, opts) : repo.save(item));
        upsertLocal(saved);
        return saved;
      } catch (e) {
        if (e instanceof PhotoSaveError) upsertLocal(e.item);
        throw e;
      }
    },
    [repo],
  );

  const remove = useCallback(
    async (item: Item) => {
      await repo.remove(item);
      setItems((p) => p.filter((i) => i.id !== item.id));
    },
    [repo],
  );

  const wear = useCallback(
    async (item: Item, delta: 1 | -1) => {
      const out = await repo.wear(item, delta);
      const stats = { wearCount: out.wearCount, lastWorn: out.lastWorn };
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, ...stats } : i)));
      return out;
    },
    [repo],
  );

  const exportBackup = useCallback(() => repo.exportAll(), [repo]);

  const restoreBackup = useCallback(
    async (backup: Backup) => {
      const summary = await repo.restore(backup);
      await refresh();
      return summary;
    },
    [repo, refresh],
  );

  /** Sequential on purpose: keeps request rate and storage uploads gentle. */
  const importMany = useCallback(
    async (
      list: Item[],
      opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
    ): Promise<ImportResult[]> => {
      const results = await runImport(list, (it) => repo.save({ ...it, id: "" }), {
        ...opts,
        onSaved: upsertLocal,
      });
      return results.map((r) => (r.ok ? r : { ...r, error: message(r.error) }));
    },
    [repo],
  );

  /** One item per photo through `save` (which prepares each photo first, D48); saved items show up at once. */
  const importPhotos = useCallback(
    (jobs: PhotoJob[], opts: PhotoImportOptions) =>
      runPhotoImport(
        jobs,
        {
          save,
          wait: abortableWait,
          createUrl: (f) => URL.createObjectURL(f),
          revokeUrl: (u) => URL.revokeObjectURL(u),
        },
        opts,
      ),
    [save],
  );

  return {
    photos,
    items,
    locations,
    loading,
    error,
    refresh,
    save,
    remove,
    wear,
    importMany,
    importPhotos,
    exportBackup,
    restoreBackup,
    message,
  };
}
