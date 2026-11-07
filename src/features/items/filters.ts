import { normalize } from "@/lib/text";
import type { Item } from "@/types/item";

export const STALE_DAYS = 90;

export const ageInDays = (date: string, now = Date.now()) =>
  date ? Math.floor((now - new Date(date).getTime()) / 86400000) : 999;

export const isStale = (i: Pick<Item, "lastWorn">, now = Date.now()) =>
  ageInDays(i.lastWorn, now) >= STALE_DAYS;

export type ItemFilters = {
  status: string;
  season: string;
  location: string;
  color: string;
  special: string;
};

export function matchesFilters(
  i: Item,
  c: { query: string; category: string; filters: ItemFilters },
  now = Date.now(),
) {
  const { query, category, filters } = c;
  const hay = normalize(
    [i.name, i.brand, ...i.colors, ...i.tags, i.material, i.notes, i.location].join(" "),
  );
  return (
    hay.includes(normalize(query)) &&
    (category === "Tất cả" || i.category === category) &&
    (!filters.status || i.status === filters.status) &&
    (!filters.season || i.seasons.includes(filters.season)) &&
    (!filters.location || i.location === filters.location) &&
    (!filters.color || i.colors.includes(filters.color)) &&
    (filters.special !== "stale" || isStale(i, now)) &&
    (filters.special !== "never" || i.wearCount === 0)
  );
}

export function sortItems(items: Item[], sort: string, now = Date.now()) {
  return [...items].sort((a, b) =>
    sort === "Tên A→Z"
      ? a.name.localeCompare(b.name, "vi")
      : sort === "Mặc nhiều nhất"
        ? b.wearCount - a.wearCount
        : sort === "Lâu chưa mặc"
          ? ageInDays(b.lastWorn, now) - ageInDays(a.lastWorn, now)
          : sort === "Giá cao → thấp"
            ? b.price - a.price
            : +new Date(b.createdAt) - +new Date(a.createdAt),
  );
}
