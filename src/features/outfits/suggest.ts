import { CATEGORY_TO_DB, STATUS_TO_DB } from "@/data/mappers";
import type { AiSuggestResult } from "@/data/aiOutfits";
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

/** Today's max at or below this is cold (add outer); at or above HOT is hot (no outer). Rain: chance in %. */
export const WEATHER_COLD_MAX_C = 24;
export const WEATHER_HOT_MAX_C = 32;
export const WEATHER_RAIN_CHANCE = 60;

export type WeatherInput = { minC: number; maxC: number; rainChance: number | null };

export function weatherKind(w?: WeatherInput): { cold: boolean; hot: boolean; rain: boolean } {
  if (!w) return { cold: false, hot: false, rain: false };
  return {
    cold: w.maxC <= WEATHER_COLD_MAX_C,
    hot: w.maxC >= WEATHER_HOT_MAX_C,
    rain: w.rainChance !== null && w.rainChance >= WEATHER_RAIN_CHANCE,
  };
}

export type OutfitReason = "neverWorn" | "stale" | "season" | "cold" | "hot" | "rain";
export type Outfit = { main: Item[]; pieces: Item[]; reasons: OutfitReason[] };
export type Suggestion = {
  season: string;
  seasons: string[];
  outfits: Outfit[];
  fallback: boolean;
};
export type SuggestOptions = {
  now: number;
  seed: number;
  avoid?: readonly string[];
  count?: number;
  weather?: WeatherInput;
};

const ONE_PIECE = ["dress", "set", "ao_dai"];

type Ranked = { item: Item; tier: number; avoided: number; summerPenalty: number };

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Eligibility = {
  season: string;
  /** Seasons whose items are eligible (calendar season adjusted by weather), no duplicates. */
  seasons: string[];
  cold: boolean;
  hot: boolean;
  rain: boolean;
  outerWanted: boolean;
  /** Per role: items fitting the wanted seasons, or all of the role when none fit (item order). */
  pools: Record<string, Item[]>;
  fallback: boolean;
};

/** Active items in the rule categories, after the season/weather step shared by the rules and the AI pool. */
function eligibility(
  items: readonly Item[],
  opts: { now: number; weather?: WeatherInput },
): Eligibility {
  const season = seasonOf(opts.now);
  const { cold, hot, rain } = weatherKind(opts.weather);
  // Weather widens (cold: Đông) or narrows (hot: no Đông) the seasons whose items are eligible.
  let wanted = [season];
  if (cold) wanted = [...wanted.filter((s) => s !== "Hạ"), "Đông"];
  if (hot) wanted = [...wanted.filter((s) => s !== "Đông"), "Hạ"];

  const byRole: Record<string, Item[]> = {};
  for (const item of items) {
    const role = ruleRole(item);
    if (role) (byRole[role] ??= []).push(item);
  }
  const inSeason = (i: Item) => i.seasons.length === 0 || i.seasons.some((s) => wanted.includes(s));
  const hasInSeason = Object.values(byRole).some((all) => all.some(inSeason));
  const pools: Record<string, Item[]> = {};
  for (const [role, all] of Object.entries(byRole)) {
    const fit = all.filter(inSeason);
    pools[role] = fit.length ? fit : all;
  }
  return {
    season,
    seasons: [...new Set(wanted)],
    cold,
    hot,
    rain,
    outerWanted: cold || (!hot && COLD_SEASONS.includes(season)),
    pools,
    fallback: items.length > 0 && !hasInSeason,
  };
}

/** The rule role of an active item, or null for other statuses and for bikini / other. */
function ruleRole(item: Item): string | null {
  if (STATUS_TO_DB[item.status] !== "active") return null;
  const role = CATEGORY_TO_DB[item.category];
  return !role || role === "bikini" || role === "other" ? null : role;
}

export function suggestOutfits(items: readonly Item[], opts: SuggestOptions): Suggestion {
  const { now, seed, count = 3 } = opts;
  const avoid = new Set(opts.avoid ?? []);
  const { season, seasons, cold, hot, rain, outerWanted, pools, fallback } = eligibility(
    items,
    opts,
  );
  const rand = mulberry32(seed);

  const rank = (role: string): Ranked[] =>
    shuffle(pools[role] ?? [], rand)
      .map((item) => ({
        item,
        tier: isStale(item, now) || item.wearCount === 0 ? 0 : 1,
        avoided: avoid.has(item.id) ? 1 : 0,
        summerPenalty: cold && item.seasons.includes("Hạ") ? 1 : 0,
      }))
      .sort(
        (a, b) => a.avoided - b.avoided || a.summerPenalty - b.summerPenalty || a.tier - b.tier,
      );

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
  const outer = outerWanted ? rank("outer") : [];
  const accessory = rank("accessory");
  const pick = (list: Ranked[], k: number) => (list.length ? [list[k % list.length].item] : []);

  const outfits = chosen.map((main, k): Outfit => {
    const reasons: OutfitReason[] = [];
    if (main.some((i) => i.wearCount === 0)) reasons.push("neverWorn");
    if (main.some((i) => i.wearCount > 0 && isStale(i, now))) reasons.push("stale");
    if (main.some((i) => i.seasons.some((s) => seasons.includes(s)))) reasons.push("season");
    if (cold) reasons.push("cold");
    if (hot) reasons.push("hot");
    if (rain) reasons.push("rain");
    return {
      main,
      pieces: [...main, ...pick(shoes, k), ...pick(outer, k), ...pick(accessory, k)],
      reasons,
    };
  });
  return { season, seasons, outfits, fallback };
}

/** Most candidates sent to the AI per call (F-704.3 A2). */
export const AI_CANDIDATE_CAP = 40;
const POOL_ROLES = ["top", "bottom", "dress", "set", "ao_dai", "shoes", "outer", "accessory"];

const wornGroup = (i: Item) => (i.wearCount === 0 ? 0 : i.lastWorn === "" ? 1 : 2);
const byUnworn = (a: Item, b: Item) =>
  wornGroup(a) - wornGroup(b) ||
  (wornGroup(a) === 2 && a.lastWorn !== b.lastWorn ? (a.lastWorn < b.lastWorn ? -1 : 1) : 0) ||
  (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Items offered to the AI: the rule pool after the season/weather step, never-worn first then longest-unworn
 * within each role, roles interleaved round-robin, at most `AI_CANDIDATE_CAP`.
 */
export function candidatePool(
  items: readonly Item[],
  opts: { now: number; weather?: WeatherInput },
): Item[] {
  const { cold, outerWanted, pools } = eligibility(items, opts);
  const lists = POOL_ROLES.filter((r) => r !== "outer" || outerWanted).map((r) =>
    [...(pools[r] ?? [])].sort((a, b) => {
      if (cold) {
        const pA = a.seasons.includes("Hạ") ? 1 : 0;
        const pB = b.seasons.includes("Hạ") ? 1 : 0;
        if (pA !== pB) return pA - pB;
      }
      return byUnworn(a, b);
    }),
  );
  const out: Item[] = [];
  for (let k = 0; out.length < AI_CANDIDATE_CAP && lists.some((l) => k < l.length); k++) {
    for (const l of lists) {
      if (k < l.length && out.length < AI_CANDIDATE_CAP) out.push(l[k]);
    }
  }
  return out;
}

export type AiOutfit = { pieces: Item[]; reason: string };

/** Plain-text reason: NFC, no control / bidi / zero-width characters, one line, at most 120 code points. */
export function cleanReason(s: string): string {
  return Array.from(
    s
      .normalize("NFC")
      // Tab, newline and U+2028/2029 stay for the whitespace collapse below.
      .replace(
        /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
        "",
      )
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, 120)
    .join("")
    .trimEnd();
}

/** Maps the AI answer back to items, dropping outfits that are no longer valid. At most 3 are returned. */
export function toAiOutfits(result: AiSuggestResult, items: readonly Item[]): AiOutfit[] {
  const byId = new Map(items.filter((i) => ruleRole(i)).map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: AiOutfit[] = [];
  for (const o of result.outfits) {
    if (out.length === 3) break;
    if (o.itemIds.length < 1 || o.itemIds.length > 5) continue;
    if (new Set(o.itemIds).size !== o.itemIds.length) continue;
    const pieces = o.itemIds.map((id) => byId.get(id));
    if (!pieces.every((p): p is Item => !!p)) continue;
    const reason = cleanReason(o.reason);
    if (!reason) continue;
    const key = [...o.itemIds].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pieces, reason });
  }
  return out;
}
