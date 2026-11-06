import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/types/item";
import { createLocalRepo, createSupabaseRepo } from "./repo";

const message = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  if (code === "23505") return "Dữ liệu bị trùng";
  if (code === "42501") return "Không có quyền thao tác";
  return (e as Error)?.message || "Có lỗi xảy ra, thử lại nhé";
};

/**
 * Single source of truth for wardrobe data.
 * Supabase when VITE_SUPABASE_* is set, otherwise localStorage + demo data.
 */
export function useWardrobe(starter: Item[], defaultLocations: string[]) {
  const repo = useMemo(
    () => (supabase ? createSupabaseRepo(supabase) : createLocalRepo(starter, defaultLocations)),
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
      const saved = await repo.save(item);
      upsertLocal(saved);
      return saved;
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
      const res = await repo.wear(item, delta);
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, ...res } : i)));
      return res;
    },
    [repo],
  );

  /** Sequential on purpose: keeps request rate and storage uploads gentle. */
  const importMany = useCallback(
    async (list: Item[], onProgress?: (done: number, total: number) => void) => {
      const out: Item[] = [];
      for (let i = 0; i < list.length; i++) {
        out.push(await repo.save({ ...list[i], id: "" }));
        onProgress?.(i + 1, list.length);
      }
      out.forEach(upsertLocal);
      return out;
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
