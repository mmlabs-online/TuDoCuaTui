import { describe, expect, it } from "vitest";

import { SEASON_TO_DB } from "@/data/mappers";
import {
  COLD_SEASONS,
  SEASON_BY_MONTH,
  seasonOf,
  suggestOutfits,
  WEATHER_COLD_MAX_C,
  WEATHER_HOT_MAX_C,
  WEATHER_RAIN_CHANCE,
  weatherKind,
  type Outfit,
  type WeatherInput,
} from "@/features/outfits/suggest";
import type { Item } from "@/types/item";

const JULY = Date.UTC(2026, 6, 15, 5); // Hạ
const SEPT = Date.UTC(2026, 8, 15, 5); // Thu
const JAN = Date.UTC(2026, 0, 15, 5); // Đông
const DAY = 86_400_000;

let n = 0;
const iso = (now: number, daysAgo: number) =>
  new Date(now - daysAgo * DAY).toISOString().slice(0, 10);
const mk = (category: string, over: Partial<Item> = {}): Item => ({
  id: `i${++n}`,
  name: `${category} ${n}`,
  category,
  status: "Đang dùng",
  colors: [],
  seasons: [],
  brand: "",
  size: "",
  location: "",
  price: 0,
  purchaseDate: "",
  material: "",
  tags: [],
  notes: "",
  photo: "",
  wearCount: 5,
  lastWorn: iso(JULY, 120),
  createdAt: "2026-01-01",
  ...over,
});
const many = (category: string, k: number, over: Partial<Item> = {}) =>
  Array.from({ length: k }, () => mk(category, over));
const ids = (o: Outfit) => o.main.map((i) => i.id);
const run = (items: Item[], seed = 1, now = JULY, avoid?: string[]) =>
  suggestOutfits(items, { now, seed, avoid });
const mainIds = (items: Item[], seed = 1, now = JULY) => run(items, seed, now).outfits.flatMap(ids);

describe("season", () => {
  it("seasonOf maps every month", () => {
    const expected = [
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
    ];
    expected.forEach((s, m) => expect(seasonOf(Date.UTC(2026, m, 15, 5))).toBe(s));
  });

  it("seasonOf uses UTC+7 at month boundaries", () => {
    expect(seasonOf(Date.UTC(2026, 0, 31, 16, 59))).toBe("Đông");
    expect(seasonOf(Date.UTC(2026, 0, 31, 17, 0))).toBe("Xuân");
    expect(seasonOf(Date.UTC(2026, 3, 30, 17, 0))).toBe("Hạ");
    expect(seasonOf(Date.UTC(2026, 9, 31, 17, 0))).toBe("Đông");
    expect(seasonOf(Date.UTC(2026, 11, 31, 17, 0))).toBe("Đông");
  });

  it("SEASON_BY_MONTH covers 12 months with known labels", () => {
    expect(SEASON_BY_MONTH).toHaveLength(12);
    for (const s of SEASON_BY_MONTH) expect(Object.keys(SEASON_TO_DB)).toContain(s);
  });
});

describe("outfit rules", () => {
  it("builds top + bottom outfits", () => {
    const [o] = run([mk("Áo"), mk("Quần/váy")]).outfits;
    expect(o.main.map((i) => i.category)).toEqual(["Áo", "Quần/váy"]);
  });

  it("builds one-piece outfits for Đầm, Set đồ and Áo dài", () => {
    for (const c of ["Đầm", "Set đồ", "Áo dài"]) {
      const { outfits } = run([mk(c)]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].main.map((i) => i.category)).toEqual([c]);
    }
    expect(run([mk("Áo dài"), mk("Quần/váy")]).outfits[0].main).toHaveLength(1);
  });

  it("adds shoes when available", () => {
    const { outfits } = run([...many("Đầm", 3), ...many("Giày/dép", 2)]);
    for (const o of outfits)
      expect(o.pieces.filter((i) => i.category === "Giày/dép")).toHaveLength(1);
  });

  it("keeps an outfit without shoes", () => {
    expect(run(many("Đầm", 3)).outfits).toHaveLength(3);
  });

  it("adds Khoác only in Đông", () => {
    const items = [...many("Đầm", 3), ...many("Khoác", 2)];
    expect(COLD_SEASONS).toEqual(["Đông"]);
    const has = (now: number) =>
      run(items, 1, now).outfits.every((o) => o.pieces.some((i) => i.category === "Khoác"));
    expect(has(JAN)).toBe(true);
    for (const now of [JULY, SEPT])
      expect(
        run(items, 1, now).outfits.some((o) => o.pieces.some((i) => i.category === "Khoác")),
      ).toBe(false);
  });

  it("adds at most one accessory", () => {
    const { outfits } = run([...many("Đầm", 3), ...many("Phụ kiện", 3)]);
    for (const o of outfits) {
      const acc = o.pieces.filter((i) => i.category === "Phụ kiện");
      expect(acc).toHaveLength(1);
    }
  });

  it("never reuses a main piece", () => {
    const items = [
      ...many("Áo", 4),
      ...many("Quần/váy", 4),
      ...many("Đầm", 2),
      ...many("Giày/dép", 1),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      const all = mainIds(items, seed);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("returns at most 3 outfits", () => {
    expect(run(many("Đầm", 10)).outfits).toHaveLength(3);
  });

  it("returns fewer outfits when there are fewer main pieces", () => {
    expect(run(many("Đầm", 2)).outfits).toHaveLength(2);
    expect(run([mk("Áo"), ...many("Quần/váy", 3)]).outfits).toHaveLength(1);
  });

  it("returns no outfits when nothing can be built", () => {
    expect(run([]).outfits).toEqual([]);
    expect(run(many("Áo", 3)).outfits).toEqual([]);
    expect(run(many("Quần/váy", 3)).outfits).toEqual([]);
    expect(run([...many("Giày/dép", 2), ...many("Phụ kiện", 2)]).outfits).toEqual([]);
    expect(run(many("Đầm", 3, { status: "Cất kho" })).outfits).toEqual([]);
  });

  it("excludes Bikini, Loại khác and unknown categories", () => {
    const bad = [...many("Bikini", 2), ...many("Loại khác", 2), ...many("Không rõ", 2)];
    expect(run(bad).outfits).toEqual([]);
    const { outfits } = run([...bad, ...many("Đầm", 3)]);
    for (const o of outfits)
      for (const i of o.pieces)
        expect(["Bikini", "Loại khác", "Không rõ"]).not.toContain(i.category);
  });

  it("uses only Đang dùng items", () => {
    const off = (["Cất kho", "Đang giặt-sửa", "Cho mượn", "Muốn thanh lý"] as const).flatMap(
      (status) => many("Đầm", 2, { status }),
    );
    const good = many("Đầm", 3);
    const goodIds = new Set(good.map((i) => i.id));
    for (const id of mainIds([...off, ...good])) expect(goodIds.has(id)).toBe(true);
  });
});

describe("season eligibility", () => {
  it("empty seasons are eligible and rank like in-season", () => {
    const empty = mk("Đầm", { seasons: [] });
    const tagged = mk("Đầm", { seasons: ["Hạ"] });
    let emptyFirst = false;
    for (let seed = 1; seed <= 30; seed++) {
      const { outfits } = run([empty, tagged], seed);
      expect(outfits.flatMap(ids).sort()).toEqual([empty.id, tagged.id].sort());
      if (outfits[0].main[0].id === empty.id) emptyFirst = true;
    }
    expect(emptyFirst).toBe(true);
  });

  it("skips out-of-season items when the role has an in-season item", () => {
    const winter = mk("Đầm", { seasons: ["Đông"] });
    const summer = mk("Đầm", { seasons: ["Hạ"] });
    for (let seed = 1; seed <= 10; seed++)
      expect(mainIds([winter, summer], seed)).toEqual([summer.id]);
  });

  it("falls back to out-of-season items when the role has none in season", () => {
    const winter = many("Đầm", 2, { seasons: ["Đông"] });
    expect(run(winter).outfits).toHaveLength(2);
  });
});

describe("ranking and shuffle", () => {
  it("stale and never-worn pieces come before recently worn ones", () => {
    const recent = many("Đầm", 3, { lastWorn: iso(JULY, 2) });
    const never = mk("Đầm", { wearCount: 0, lastWorn: "" });
    const stale = many("Đầm", 2, { lastWorn: iso(JULY, 120) });
    const want = [never, ...stale].map((i) => i.id).sort();
    for (let seed = 1; seed <= 20; seed++)
      expect(mainIds([...recent, never, ...stale], seed).sort()).toEqual(want);
  });

  it("is deterministic for a fixed seed", () => {
    const items = many("Đầm", 6);
    expect(run(items, 7)).toEqual(run(items, 7));
  });

  it("a different seed reorders ties", () => {
    const items = many("Đầm", 6);
    const first = (seed: number) => run(items, seed).outfits[0].main[0].id;
    const base = first(1);
    expect([2, 3, 4, 5, 6, 7, 8].some((s) => first(s) !== base)).toBe(true);
  });

  it("avoid gives a different set when alternatives exist", () => {
    const four = many("Đầm", 4);
    const a = run(four, 1).outfits.flatMap(ids);
    const b = run(four, 2, JULY, a).outfits.flatMap(ids);
    expect(new Set(b)).not.toEqual(new Set(a));
    const six = many("Đầm", 6);
    const c = run(six, 1).outfits.flatMap(ids);
    const d = run(six, 2, JULY, c).outfits.flatMap(ids);
    expect(d.filter((id) => c.includes(id))).toEqual([]);
  });
});

describe("reasons and purity", () => {
  it("reasons", () => {
    expect(run([mk("Đầm", { wearCount: 0, lastWorn: "" })]).outfits[0].reasons).toEqual([
      "neverWorn",
    ]);
    expect(run([mk("Đầm", { lastWorn: iso(JULY, 120) })]).outfits[0].reasons).toEqual(["stale"]);
    expect(
      run([mk("Đầm", { lastWorn: iso(JULY, 2), seasons: ["Hạ"] })]).outfits[0].reasons,
    ).toEqual(["season"]);
    expect(run([mk("Đầm", { lastWorn: iso(JULY, 2) })]).outfits[0].reasons).toEqual([]);
  });

  it("does not mutate the input", () => {
    const items = [...many("Áo", 3), ...many("Quần/váy", 3), ...many("Đầm", 2)];
    const copy = structuredClone(items);
    run(items, 3, JULY, [items[0].id]);
    expect(items).toEqual(copy);
  });
});

describe("weather", () => {
  const w = (maxC: number, rainChance: number | null = 10): WeatherInput => ({
    minC: maxC - 5,
    maxC,
    rainChance,
  });
  const withW = (items: Item[], weather?: WeatherInput, seed = 1, now = JULY) =>
    suggestOutfits(items, { now, seed, weather });
  const hasOuter = (o: Outfit) => o.pieces.some((i) => i.category === "Khoác");
  const base = () => [...many("Đầm", 4), ...many("Khoác", 2)];

  it("weather: no weather gives the F-704.1 result", () => {
    const items = base();
    expect(withW(items, undefined)).toEqual(run(items));
    expect(withW(items, w(28, 10)).outfits.map((o) => [ids(o), o.pieces.map((i) => i.id)])).toEqual(
      run(items).outfits.map((o) => [ids(o), o.pieces.map((i) => i.id)]),
    );
    expect(withW(items, w(28, 10)).outfits.map((o) => o.reasons)).toEqual(
      run(items).outfits.map((o) => o.reasons),
    );
  });

  it("weather: cold adds Khoác outside Đông", () => {
    const r = withW(base(), w(22));
    expect(r.outfits.length).toBeGreaterThan(0);
    for (const o of r.outfits) {
      expect(hasOuter(o)).toBe(true);
      expect(o.reasons).toContain("cold");
    }
    expect(run(base()).outfits.some(hasOuter)).toBe(false);
  });

  it("weather: cold makes Đông-tagged items eligible", () => {
    const winter = mk("Đầm", { seasons: ["Đông"] });
    const items = [winter, mk("Đầm", { seasons: ["Hạ"] })];
    const seen = (weather?: WeatherInput) =>
      Array.from({ length: 20 }, (_, k) => withW(items, weather, k + 1).outfits.flatMap(ids)).some(
        (list) => list.includes(winter.id),
      );
    expect(seen(undefined)).toBe(false);
    expect(seen(w(20))).toBe(true);
  });

  it("weather: hot drops Khoác in Đông", () => {
    const r = withW(base(), w(33), 1, JAN);
    for (const o of r.outfits) {
      expect(hasOuter(o)).toBe(false);
      expect(o.reasons).toContain("hot");
    }
    expect(run(base(), 1, JAN).outfits.every(hasOuter)).toBe(true);
  });

  it("weather: hot skips Đông-tagged items when others exist", () => {
    const winter = mk("Đầm", { seasons: ["Đông"] });
    const items = [winter, mk("Đầm", { seasons: ["Hạ"] }), mk("Đầm")];
    for (let s = 1; s <= 20; s++) {
      expect(withW(items, w(34), s, JAN).outfits.flatMap(ids)).not.toContain(winter.id);
    }
    const only = [mk("Đầm", { seasons: ["Đông"] })];
    expect(withW(only, w(34), 1, JAN).outfits).toHaveLength(1);
  });

  it("weather: rain adds the rain reason", () => {
    const items = many("Đầm", 3);
    for (const o of withW(items, w(28, 60)).outfits) expect(o.reasons).toContain("rain");
    for (const o of withW(items, w(28, 59)).outfits) expect(o.reasons).not.toContain("rain");
  });

  it("weather: threshold boundaries", () => {
    expect(weatherKind(w(24)).cold).toBe(true);
    expect(weatherKind(w(24.1)).cold).toBe(false);
    expect(weatherKind(w(32)).hot).toBe(true);
    expect(weatherKind(w(31.9)).hot).toBe(false);
    expect(weatherKind(undefined)).toEqual({ cold: false, hot: false, rain: false });
    expect([WEATHER_COLD_MAX_C, WEATHER_HOT_MAX_C, WEATHER_RAIN_CHANCE]).toEqual([24, 32, 60]);
  });

  it("weather: null rain chance is not rain", () => {
    expect(weatherKind(w(28, null)).rain).toBe(false);
    for (const o of withW(many("Đầm", 3), w(28, null)).outfits) {
      expect(o.reasons).not.toContain("rain");
    }
  });
});
