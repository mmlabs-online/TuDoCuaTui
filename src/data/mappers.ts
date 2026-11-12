import type { Database } from "@/types/database";
import type { Item, Status } from "@/types/item";

type Enums = Database["public"]["Enums"];
type ItemRow = Database["public"]["Views"]["tudo_items_with_stats"]["Row"];
type ItemInsert = Database["public"]["Tables"]["tudo_items"]["Insert"];

const invert = <K extends string, V extends string>(o: Record<K, V>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<V, K>;

export type CategoryId =
  | "top"
  | "bottom"
  | "dress"
  | "set"
  | "shoes"
  | "ao_dai"
  | "outer"
  | "bikini"
  | "accessory"
  | "other";

/** D29: display order = key order. */
export const CATEGORY_TO_DB: Record<string, CategoryId> = {
  Áo: "top",
  "Quần/váy": "bottom",
  Đầm: "dress",
  "Set đồ": "set",
  "Giày/dép": "shoes",
  "Áo dài": "ao_dai",
  Khoác: "outer",
  Bikini: "bikini",
  "Phụ kiện": "accessory",
  "Loại khác": "other",
};
export const CATEGORY_FROM_DB = invert(CATEGORY_TO_DB);
export const OTHER_CATEGORY = "Loại khác";

/** Old labels and retired ids → current label. */
export const CATEGORY_ALIASES: Record<string, string> = {
  Quần: "Quần/váy",
  "Váy/Đầm": "Đầm",
  "Giày dép": "Giày/dép",
  "Áo khoác": "Khoác",
  Túi: "Phụ kiện",
  bag: "Phụ kiện",
  "Đồ thể thao": OTHER_CATEGORY,
  "Đồ ngủ/ở nhà": OTHER_CATEGORY,
  sport: OTHER_CATEGORY,
  home: OTHER_CATEGORY,
  Khác: OTHER_CATEGORY,
};

/** Current label, id, or old label/retired id → current label; anything else → "Loại khác". */
export function toCategoryLabel(v: string | null | undefined): string {
  if (!v) return OTHER_CATEGORY;
  if (v in CATEGORY_TO_DB) return v;
  return CATEGORY_FROM_DB[v as CategoryId] ?? CATEGORY_ALIASES[v] ?? OTHER_CATEGORY;
}

export const STATUS_TO_DB: Record<Status, Enums["tudo_item_status"]> = {
  "Đang dùng": "active",
  "Cất kho": "stored",
  "Đang giặt-sửa": "laundry",
  "Cho mượn": "lent",
  "Muốn thanh lý": "out",
};
export const STATUS_FROM_DB = invert(STATUS_TO_DB);

export const SEASON_TO_DB: Record<string, Enums["tudo_season"]> = {
  Xuân: "spring",
  Hạ: "summer",
  Thu: "autumn",
  Đông: "winter",
};
export const SEASON_FROM_DB = invert(SEASON_TO_DB);

export const COLOR_TO_DB: Record<string, string> = {
  Đen: "den",
  Trắng: "trang",
  Xám: "xam",
  Kem: "kem",
  Be: "be",
  Nâu: "nau",
  Đỏ: "do",
  Hồng: "hong",
  Cam: "cam",
  Vàng: "vang",
  "Xanh lá": "xanhla",
  "Xanh rêu": "reu",
  "Xanh dương": "xanhduong",
  Navy: "navy",
  Tím: "tim",
  "Hoạ tiết": "hoatiet",
};
export const COLOR_FROM_DB = invert(COLOR_TO_DB);

export function rowToItem(r: ItemRow, photoUrl = ""): Item {
  return {
    id: r.id ?? "",
    name: r.name ?? "",
    category: toCategoryLabel(r.category),
    status: (r.status && STATUS_FROM_DB[r.status]) || "Đang dùng",
    colors: (r.colors ?? []).map((c) => COLOR_FROM_DB[c] ?? c),
    seasons: (r.seasons ?? []).map((s) => SEASON_FROM_DB[s] ?? s),
    brand: r.brand ?? "",
    size: r.size ?? "",
    location: r.location_name ?? "",
    price: Number(r.price ?? 0),
    purchaseDate: r.purchase_date ?? "",
    material: r.material ?? "",
    tags: r.tags ?? [],
    notes: r.notes ?? "",
    photo: photoUrl,
    photoPath: r.primary_photo_path ?? undefined,
    wearCount: r.wear_count ?? 0,
    lastWorn: r.last_worn ?? "",
    createdAt: r.created_at ?? "",
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

/** API mode: the photo URL is built from the item_photos id (never a Drive id). */
export const apiPhotoUrl = (id: string | null | undefined, base = "/api"): string =>
  id && isUuid(id) ? `${base}/photos/${id}` : "";

export function itemToRow(it: Item, locationId: string | null): ItemInsert {
  const row: ItemInsert = {
    name: it.name.trim(),
    // Supabase's generated enum type predates D29 (A4); the API path validates the id server-side.
    category: CATEGORY_TO_DB[toCategoryLabel(it.category)] as ItemInsert["category"],
    status: STATUS_TO_DB[it.status] ?? "active",
    brand: it.brand.trim() || null,
    size: it.size.trim() || null,
    material: it.material.trim() || null,
    price: it.price > 0 ? Math.round(it.price) : null,
    purchase_date: it.purchaseDate ? it.purchaseDate.slice(0, 10) : null,
    location_id: locationId,
    colors: it.colors.map((c) => COLOR_TO_DB[c] ?? c),
    seasons: it.seasons.map((s) => SEASON_TO_DB[s]).filter(Boolean),
    tags: it.tags,
    notes: it.notes.trim() || null,
  };
  if (isUuid(it.id)) row.id = it.id;
  return row;
}
