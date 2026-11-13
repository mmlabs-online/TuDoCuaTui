import type { Item, Status } from "@/types/item";

export type DbStatus = "active" | "stored" | "laundry" | "lent" | "out";
export type DbSeason = "spring" | "summer" | "autumn" | "winter";

/**
 * Wire shape of an items_with_stats row from the API (server/items.js toItemRow). Nullable as in the view.
 * category is a string: the DB enum still holds retired ids (bag, sport, home) that toCategoryLabel maps.
 */
export type ItemRow = {
  id: string | null;
  name: string | null;
  category: string | null;
  status: DbStatus | null;
  brand: string | null;
  size: string | null;
  material: string | null;
  purchase_date: string | null;
  location_id: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_worn: string | null;
  location_name: string | null;
  primary_photo_path: string | null;
  price: number | null;
  wear_count: number | null;
  colors: string[] | null;
  tags: string[] | null;
  seasons: DbSeason[] | null;
};

/** Body fields itemToRow produces (repo.http.ts drops id/location_id and adds location_name). */
export type ItemInsert = {
  id?: string;
  name: string;
  category: CategoryId;
  status: DbStatus;
  brand: string | null;
  size: string | null;
  material: string | null;
  purchase_date: string | null;
  notes: string | null;
  price: number | null;
  location_id: string | null;
  colors: string[];
  tags: string[];
  seasons: DbSeason[];
};

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

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Current label, id, or old label/retired id → current label; anything else → "Loại khác". */
export function toCategoryLabel(v: string | null | undefined): string {
  if (typeof v !== "string" || !v) return OTHER_CATEGORY;
  if (own(CATEGORY_TO_DB, v)) return v;
  if (own(CATEGORY_FROM_DB, v)) return CATEGORY_FROM_DB[v as CategoryId];
  if (own(CATEGORY_ALIASES, v)) return CATEGORY_ALIASES[v];
  return OTHER_CATEGORY;
}

export const STATUS_TO_DB: Record<Status, DbStatus> = {
  "Đang dùng": "active",
  "Cất kho": "stored",
  "Đang giặt-sửa": "laundry",
  "Cho mượn": "lent",
  "Muốn thanh lý": "out",
};
export const STATUS_FROM_DB = invert(STATUS_TO_DB);

export const SEASON_TO_DB: Record<string, DbSeason> = {
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
    category: CATEGORY_TO_DB[toCategoryLabel(it.category)],
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
