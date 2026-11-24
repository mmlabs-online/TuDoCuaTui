import { OCCASION_IDS, type OccasionId } from "@/constants/occasions";
import { CATEGORY_TO_DB } from "@/data/mappers";
import { normalize } from "@/lib/text";
import type { Item } from "@/types/item";

/** Normalised (ASCII, lowercase) whole-word keywords per occasion, matched against item tags. */
export const OCCASION_TAG_KEYWORDS: Record<OccasionId, readonly string[]> = {
  di_lam: ["di lam", "dilam", "cong so", "van phong", "work", "office"],
  di_choi: ["di choi", "dichoi", "dao pho", "cafe", "casual"],
  hen_ho: ["hen ho", "henho", "date"],
  du_tiec: ["du tiec", "dutiec", "tiec", "dam cuoi", "su kien", "party"],
  du_lich: ["du lich", "dulich", "di bien", "travel", "beach"],
};

const ALL_ROLES = ["top", "bottom", "dress", "set", "ao_dai", "shoes", "outer", "accessory"];

/** Category ids allowed for an item that has no occasion tag. */
export const OCCASION_CATEGORIES: Record<OccasionId, readonly string[]> = {
  di_lam: ALL_ROLES,
  di_choi: ALL_ROLES.filter((r) => r !== "ao_dai"),
  hen_ho: ALL_ROLES,
  du_tiec: ALL_ROLES,
  du_lich: ALL_ROLES.filter((r) => r !== "ao_dai"),
};

const words = (s: string) =>
  ` ${normalize(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/** Occasions named by the tags (whole-word keyword match, diacritics and case ignored). */
export function tagOccasions(tags: readonly string[]): Set<OccasionId> {
  const out = new Set<OccasionId>();
  for (const tag of tags) {
    const w = words(tag);
    for (const id of OCCASION_IDS) {
      if (OCCASION_TAG_KEYWORDS[id].some((k) => w.includes(` ${k} `))) out.add(id);
    }
  }
  return out;
}

/** Tagged for the occasion → fits; tagged only for others → does not; untagged → category rule. */
export function fitsOccasion(item: Item, occasion: OccasionId): boolean {
  const named = tagOccasions(item.tags);
  if (named.has(occasion)) return true;
  if (named.size > 0) return false;
  return OCCASION_CATEGORIES[occasion].includes(CATEGORY_TO_DB[item.category]);
}
