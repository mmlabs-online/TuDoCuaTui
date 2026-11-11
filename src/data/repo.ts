import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Item } from "@/types/item";
import { localToday, toLocalDate } from "@/lib/dates";
import { PHOTO_BUCKET } from "@/lib/supabase";
import { itemToRow, rowToItem } from "./mappers";
import { resizeImage, urlToBlob } from "./photos";

export type WearResult = Pick<Item, "wearCount" | "lastWorn">;
/** `already` is true when +1 found a wear for today (nothing added); always false for -1. */
export type WearOutcome = WearResult & { already: boolean };

/** Persistence boundary. The UI only talks to this interface. */
export interface WardrobeRepo {
  mode: "local" | "supabase" | "api";
  list(): Promise<Item[]>;
  locations(): Promise<string[]>;
  /** Create (when `id` is not persisted yet) or update. Returns the stored item. */
  save(item: Item): Promise<Item>;
  remove(item: Item): Promise<void>;
  /** +1 = "Mặc hôm nay", -1 = undo the latest wear. */
  wear(item: Item, delta: 1 | -1): Promise<WearOutcome>;
}

// =====================================================================
// Local mode — localStorage, demo data. Used when Supabase env is missing.
// =====================================================================
const LS_KEY = "tu-do-items";

export function createLocalRepo(starter: Item[], defaultLocations: string[]): WardrobeRepo {
  let cache: Item[] | null = null;
  const prevWorn = new Map<string, string>(); // lastWorn before today's wear, for undo (session only)
  const load = (): Item[] => {
    if (cache) return cache;
    try {
      cache = JSON.parse(localStorage.getItem(LS_KEY) || "null") ?? starter;
    } catch {
      cache = starter;
    }
    return cache!;
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

// =====================================================================
// Supabase mode
// =====================================================================
type Client = SupabaseClient<Database>;

export function createSupabaseRepo(sb: Client): WardrobeRepo {
  const uid = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error("Chưa đăng nhập");
    return data.user.id;
  };

  const sign = async (paths: string[]) => {
    const map: Record<string, string> = {};
    if (!paths.length) return map;
    const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
    if (error) throw error;
    data?.forEach((d) => {
      if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
    });
    return map;
  };

  const fetchOne = async (id: string): Promise<Item> => {
    const { data, error } = await sb
      .from("tudo_items_with_stats")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    const urls = await sign(data.primary_photo_path ? [data.primary_photo_path] : []);
    return rowToItem(data, data.primary_photo_path ? urls[data.primary_photo_path] : "");
  };

  const ensureLocation = async (name: string): Promise<string | null> => {
    const clean = name.trim();
    if (!clean) return null;
    const { data: found, error: fErr } = await sb
      .from("tudo_locations")
      .select("id")
      .eq("name", clean)
      .maybeSingle();
    if (fErr) throw fErr;
    if (found) return found.id;
    const { data, error } = await sb
      .from("tudo_locations")
      .insert({ name: clean })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  };

  const removePhotos = async (itemId: string) => {
    const { data, error } = await sb
      .from("tudo_item_photos")
      .select("id, storage_path")
      .eq("item_id", itemId);
    if (error) throw error;
    if (!data?.length) return;
    await sb.storage.from(PHOTO_BUCKET).remove(data.map((p) => p.storage_path));
    await sb.from("tudo_item_photos").delete().eq("item_id", itemId);
  };

  const uploadPrimary = async (itemId: string, source: Blob) => {
    const user = await uid();
    const { blob, width, height } = await resizeImage(source);
    const path = `${user}/${itemId}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw upErr;
    await removePhotos(itemId); // one photo per item for now — replace the old one
    const { error } = await sb
      .from("tudo_item_photos")
      .insert({ item_id: itemId, storage_path: path, is_primary: true, width, height });
    if (error) {
      await sb.storage.from(PHOTO_BUCKET).remove([path]); // no orphans
      throw error;
    }
  };

  /** Photo of a duplicated item points at another item's file → copy it into this item's folder. */
  const copyPhoto = async (itemId: string, fromPath: string) => {
    const user = await uid();
    const path = `${user}/${itemId}/${crypto.randomUUID()}.jpg`;
    const { error: cpErr } = await sb.storage.from(PHOTO_BUCKET).copy(fromPath, path);
    if (cpErr) throw cpErr;
    const { error } = await sb
      .from("tudo_item_photos")
      .insert({ item_id: itemId, storage_path: path, is_primary: true });
    if (error) throw error;
  };

  return {
    mode: "supabase",

    async list() {
      const { data, error } = await sb
        .from("tudo_items_with_stats")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const urls = await sign(
        rows.map((r) => r.primary_photo_path).filter((p): p is string => !!p),
      );
      return rows.map((r) =>
        rowToItem(r, r.primary_photo_path ? (urls[r.primary_photo_path] ?? "") : ""),
      );
    },

    async locations() {
      const { data, error } = await sb
        .from("tudo_locations")
        .select("name")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((l) => l.name);
    },

    async save(item) {
      const locationId = await ensureLocation(item.location);
      const { data, error } = await sb
        .from("tudo_items")
        .upsert(itemToRow(item, locationId))
        .select("id")
        .single();
      if (error) throw error;
      const id = data.id;

      const ownsPhoto = !!item.photoPath && item.photoPath.split("/")[1] === id;
      if (item.photo.startsWith("data:") || item.photo.startsWith("blob:")) {
        await uploadPrimary(id, await urlToBlob(item.photo));
      } else if (!item.photo && item.photoPath) {
        await removePhotos(id);
      } else if (item.photoPath && !ownsPhoto) {
        await copyPhoto(id, item.photoPath);
      } else if (item.photo.startsWith("http") && !item.photoPath) {
        // external URL (e.g. demo/import) — best effort, skip if CORS blocks it
        try {
          await uploadPrimary(id, await urlToBlob(item.photo));
        } catch {
          /* keep the item without photo */
        }
      }
      return fetchOne(id);
    },

    async remove(item) {
      await removePhotos(item.id);
      const { error } = await sb.from("tudo_items").delete().eq("id", item.id);
      if (error) throw error;
    },

    async wear(item, delta) {
      let already = false;
      if (delta > 0) {
        const { data, error } = await sb
          .from("tudo_wear_logs")
          .upsert(
            { item_id: item.id, worn_on: localToday() },
            { onConflict: "item_id,worn_on", ignoreDuplicates: true },
          )
          .select("id");
        if (error) throw error;
        already = !data?.length;
      } else {
        const { data, error } = await sb
          .from("tudo_wear_logs")
          .select("id")
          .eq("item_id", item.id)
          .order("worn_on", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const { error: dErr } = await sb.from("tudo_wear_logs").delete().eq("id", data.id);
          if (dErr) throw dErr;
        }
      }
      const { data, error } = await sb
        .from("tudo_items_with_stats")
        .select("wear_count, last_worn")
        .eq("id", item.id)
        .single();
      if (error) throw error;
      return { wearCount: data.wear_count ?? 0, lastWorn: data.last_worn ?? "", already };
    },
  };
}
