import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/types/item";
import { PhotoSaveError } from "./apiErrors";
import { runImport } from "./importRunner";
import type { DataMode } from "./mode";
import { createLocalRepo, createSupabaseRepo } from "./repo";
import { createHttpRepo } from "./repo.http";

export type ImportResult =
  | { index: number; ok: true; item: Item }
  | { index: number; ok: false; error: string };

const message = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  if (code === "23505") return "Dữ liệu bị trùng";
  if (code === "42501") return "Không có quyền thao tác";
  return (e as Error)?.message || "Có lỗi xảy ra, thử lại nhé";
};

/**
 * Single source of truth for wardrobe data.
 * `mode` api → Node API; supabase (default when VITE_SUPABASE_* is set) → Supabase;
 * otherwise localStorage + demo data.
 */
export function useWardrobe(
  starter: Item[],
  defaultLocations: string[],
  mode: DataMode = supabase ? "supabase" : "local",
) {
  const repo = useMemo(
    () =>
      mode === "api"
        ? createHttpRepo()
        : mode === "supabase" && supabase
          ? createSupabaseRepo(supabase)
          : createLocalRepo(starter, defaultLocations),
    [], // starter/defaultLocations are module constants
  );
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
    async (item: Item) => {
      try {
        const saved = await repo.save(item);
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

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  return {
    mode: repo.mode,
    items,
    locations,
    loading,
    error,
    refresh,
    save,
    remove,
    wear,
    importMany,
    signOut,
    message,
  };
}
