import { CATEGORY_TO_DB, STATUS_TO_DB } from "@/data/mappers";
import { isStale } from "@/features/items/filters";
import type { Item } from "@/types/item";

/** Month index 0–11 (Jan–Dec, UTC+7) → season label. */
export const SEASON_BY_MONTH = [
  "Đông",
  "Xuân",
  "Xuân",
  "Xuân",
  "Hạ",
  "Hạ",
  "Hạ",
  "Thu",
  "Thu",
  "Thu",
  "Đông",
  "Đông",
] as const;

/** Seasons in which an outer layer (Khoác) is added to an outfit. */
export const COLD_SEASONS: readonly string[] = ["Đông"];

export const VN_OFFSET_MS = 7 * 3600_000;

export const seasonOf = (now: number): string =>
  SEASON_BY_MONTH[new Date(now + VN_OFFSET_MS).getUTCMonth()];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type OutfitReason = "neverWorn" | "stale" | "season";
export type Outfit = { main: Item[]; pieces: Item[]; reasons: OutfitReason[] };
export type Suggestion = { season: string; outfits: Outfit[] };
export type SuggestOptions = {
  now: number;
  seed: number;
  avoid?: readonly string[];
  count?: number;
};

const ONE_PIECE = ["dress", "set", "ao_dai"];

type Ranked = { item: Item; tier: number; avoided: number };

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function suggestOutfits(items: readonly Item[], opts: SuggestOptions): Suggestion {
  const { now, seed, count = 3 } = opts;
  const avoid = new Set(opts.avoid ?? []);
  const season = seasonOf(now);
  const rand = mulberry32(seed);

  const byRole: Record<string, Item[]> = {};
  for (const item of items) {
    if (STATUS_TO_DB[item.status] !== "active") continue;
    const role = CATEGORY_TO_DB[item.category];
    if (!role || role === "bikini" || role === "other") continue;
    (byRole[role] ??= []).push(item);
  }

  const inSeason = (i: Item) => i.seasons.length === 0 || i.seasons.includes(season);
  const rank = (role: string): Ranked[] => {
    const all = byRole[role] ?? [];
    const fit = all.filter(inSeason);
    const pool = fit.length ? fit : all;
    return shuffle(pool, rand)
      .map((item) => ({
        item,
        tier: isStale(item, now) || item.wearCount === 0 ? 0 : 1,
        avoided: avoid.has(item.id) ? 1 : 0,
      }))
      .sort((a, b) => a.avoided - b.avoided || a.tier - b.tier);
  };

  const units: Ranked[][] = [];
  for (const role of ONE_PIECE) for (const r of rank(role)) units.push([r]);
  const tops = rank("top");
  const bottoms = rank("bottom");
  for (let k = 0; k < Math.min(tops.length, bottoms.length); k++) units.push([tops[k], bottoms[k]]);

  const chosen = units
    .map((u) => ({ u, key: rand() }))
    .sort(
      (a, b) =>
        Math.max(...a.u.map((r) => r.avoided)) - Math.max(...b.u.map((r) => r.avoided)) ||
        Math.min(...a.u.map((r) => r.tier)) - Math.min(...b.u.map((r) => r.tier)) ||
        a.key - b.key,
    )
    .slice(0, count)
    .map((x) => x.u.map((r) => r.item));

  const shoes = rank("shoes");
  const outer = COLD_SEASONS.includes(season) ? rank("outer") : [];
  const accessory = rank("accessory");
  const pick = (list: Ranked[], k: number) => (list.length ? [list[k % list.length].item] : []);

  const outfits = chosen.map((main, k): Outfit => {
    const reasons: OutfitReason[] = [];
    if (main.some((i) => i.wearCount === 0)) reasons.push("neverWorn");
    if (main.some((i) => i.wearCount > 0 && isStale(i, now))) reasons.push("stale");
    if (main.some((i) => i.seasons.includes(season))) reasons.push("season");
    return {
      main,
      pieces: [...main, ...pick(shoes, k), ...pick(outer, k), ...pick(accessory, k)],
      reasons,
    };
  });
  return { season, outfits };
}
