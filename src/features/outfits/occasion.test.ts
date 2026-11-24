import { describe, expect, it } from "vitest";

import {
  isOccasionId,
  OCCASION_IDS,
  OCCASION_LABELS,
  type OccasionId,
} from "@/constants/occasions";
import { fitsOccasion, tagOccasions } from "@/features/outfits/occasion";
import type { Item } from "@/types/item";

const mk = (category: string, tags: string[] = []): Item => ({
  id: "x",
  name: "x",
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
  tags,
  notes: "",
  photo: "",
  wearCount: 0,
  lastWorn: "",
  createdAt: "2026-01-01",
});

describe("occasion enum", () => {
  it("enum holds exactly the five OQ-7 occasions", () => {
    expect([...OCCASION_IDS]).toEqual(["di_lam", "di_choi", "hen_ho", "du_tiec", "du_lich"]);
    expect(OCCASION_LABELS).toEqual({
      di_lam: "Đi làm",
      di_choi: "Đi chơi",
      hen_ho: "Hẹn hò",
      du_tiec: "Dự tiệc",
      du_lich: "Du lịch",
    });
    for (const id of OCCASION_IDS) expect(isOccasionId(id)).toBe(true);
    for (const v of ["Đi làm", "di lam", "DI_LAM", "", undefined, null, 1]) {
      expect(isOccasionId(v)).toBe(false);
    }
  });

  it("each label is a keyword of its own occasion", () => {
    for (const id of OCCASION_IDS) {
      expect(tagOccasions([OCCASION_LABELS[id]])).toEqual(new Set([id]));
    }
  });
});

describe("fitsOccasion", () => {
  const cases: [OccasionId, string, string][] = [
    ["di_lam", "công sở", "du lịch"],
    ["di_choi", "dạo phố", "đi làm"],
    ["hen_ho", "date", "đi làm"],
    ["du_tiec", "tiệc cưới", "đi làm"],
    ["du_lich", "#dulich", "đi làm"],
  ];
  it.each(cases)(
    "%s: a tag for it matches, a tag only for another occasion does not, an untagged item follows the category rule",
    (id, tag, other) => {
      expect(fitsOccasion(mk("Áo", [tag]), id)).toBe(true);
      expect(fitsOccasion(mk("Áo", [other]), id)).toBe(false);
      expect(fitsOccasion(mk("Áo"), id)).toBe(true);
    },
  );

  it("untagged Áo dài: excluded for di_choi and du_lich, included for di_lam, hen_ho, du_tiec; an Áo dài tagged 'đi chơi' fits di_choi", () => {
    const ad = mk("Áo dài");
    expect(fitsOccasion(ad, "di_choi")).toBe(false);
    expect(fitsOccasion(ad, "du_lich")).toBe(false);
    expect(fitsOccasion(ad, "di_lam")).toBe(true);
    expect(fitsOccasion(ad, "hen_ho")).toBe(true);
    expect(fitsOccasion(ad, "du_tiec")).toBe(true);
    expect(fitsOccasion(mk("Áo dài", ["đi chơi"]), "di_choi")).toBe(true);
  });

  it("tags match regardless of diacritics, case, NFD, extra spaces and punctuation", () => {
    for (const t of ["ĐI LÀM", "di lam", "Đi làm".normalize("NFD"), "đi   làm", "#đi-làm"]) {
      expect(tagOccasions([t])).toEqual(new Set(["di_lam"]));
    }
  });

  it("keywords match whole words only", () => {
    expect(tagOccasions(["update"]).has("hen_ho")).toBe(false);
    expect(tagOccasions(["tiệc"]).has("du_tiec")).toBe(true);
  });

  it("an item tagged for two occasions fits both, and fits neither of the other three", () => {
    for (const tags of [["đi làm", "đi chơi"], ["đi làm, đi chơi"]]) {
      const item = mk("Áo", tags);
      expect(fitsOccasion(item, "di_lam")).toBe(true);
      expect(fitsOccasion(item, "di_choi")).toBe(true);
      for (const id of ["hen_ho", "du_tiec", "du_lich"] as const) {
        expect(fitsOccasion(item, id)).toBe(false);
      }
    }
  });

  it("unrelated, empty and blank tags count as untagged", () => {
    for (const tags of [["yêu thích", "cotton"], [], ["", "  "]]) {
      expect(tagOccasions(tags).size).toBe(0);
      expect(fitsOccasion(mk("Áo", tags), "di_lam")).toBe(true);
      expect(fitsOccasion(mk("Áo dài", tags), "du_lich")).toBe(false);
    }
  });
});
