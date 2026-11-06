import type { Database } from "@/types/database";
import type { Item, Status } from "@/types/item";

type Enums = Database["public"]["Enums"];
type ItemRow = Database["public"]["Views"]["items_with_stats"]["Row"];
type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

const invert = <K extends string, V extends string>(o: Record<K, V>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<V, K>;

export const CATEGORY_TO_DB: Record<string, Enums["item_category"]> = {
  Áo: "top",
  Quần: "bottom",
  "Váy/Đầm": "dress",
  "Áo khoác": "outer",
  "Giày dép": "shoes",
  Túi: "bag",
  "Phụ kiện": "accessory",
  "Đồ thể thao": "sport",
  "Đồ ngủ/ở nhà": "home",
  Khác: "other",
};
export const CATEGORY_FROM_DB = invert(CATEGORY_TO_DB);

export const STATUS_TO_DB: Record<Status, Enums["item_status"]> = {
  "Đang dùng": "active",
  "Cất kho": "stored",
  "Đang giặt-sửa": "laundry",
  "Cho mượn": "lent",
  "Muốn thanh lý": "out",
};
export const STATUS_FROM_DB = invert(STATUS_TO_DB);

export const SEASON_TO_DB: Record<string, Enums["season"]> = {
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
    category: (r.category && CATEGORY_FROM_DB[r.category]) || "Khác",
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

export function itemToRow(it: Item, locationId: string | null): ItemInsert {
  const row: ItemInsert = {
    name: it.name.trim(),
    category: CATEGORY_TO_DB[it.category] ?? "other",
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
