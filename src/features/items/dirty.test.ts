import { describe, expect, it } from "vitest";

import type { Item } from "@/types/item";
import { isDirty } from "./dirty";

const base: Item = {
  id: "1",
  name: "Áo",
  category: "Áo",
  status: "Đang dùng",
  colors: ["Đen", "Trắng"],
  seasons: ["Hạ"],
  brand: "A",
  size: "M",
  location: "Tủ 1",
  price: 100,
  purchaseDate: "2026-01-01",
  material: "Cotton",
  tags: ["đi làm"],
  notes: "n",
  photo: "",
  photoPath: "u/1/a.jpg",
  wearCount: 2,
  lastWorn: "2026-02-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

const copy = (): Item => ({
  ...base,
  colors: [...base.colors],
  seasons: [...base.seasons],
  tags: [...base.tags],
});

describe("isDirty", () => {
  it("same values → false", () => {
    expect(isDirty(base, copy())).toBe(false);
  });

  it("each editable field change → true", () => {
    const changes: Partial<Item>[] = [
      { name: "B" },
      { category: "Quần" },
      { status: "Cất kho" },
      { colors: ["Đen"] },
      { seasons: ["Đông"] },
      { brand: "B" },
      { size: "L" },
      { location: "Tủ 2" },
      { price: 101 },
      { purchaseDate: "2026-01-02" },
      { material: "Linen" },
      { tags: [] },
      { notes: "m" },
      { photo: "data:x" },
    ];
    for (const c of changes) expect(isDirty(base, { ...copy(), ...c })).toBe(true);
  });

  it("wearCount, lastWorn, id, createdAt, photoPath changes → false", () => {
    const c = {
      ...copy(),
      wearCount: 9,
      lastWorn: "2026-03-01T00:00:00Z",
      id: "",
      createdAt: "2027-01-01T00:00:00Z",
      photoPath: undefined,
    };
    expect(isDirty(base, c)).toBe(false);
  });

  it("array order matters", () => {
    expect(isDirty(base, { ...copy(), colors: ["Trắng", "Đen"] })).toBe(true);
    expect(isDirty(base, { ...copy(), colors: ["Đen", "Trắng"] })).toBe(false);
  });
});
