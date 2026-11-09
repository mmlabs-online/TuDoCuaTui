import { afterEach, describe, expect, it, vi } from "vitest";

import { categoryNames, colors, seasons, statuses } from "@/constants/wardrobe";

import { locations, starter } from "./demo";

describe("demo data", () => {
  it("starter has the 16 demo items with ids 1..16", () => {
    expect(starter).toHaveLength(16);
    expect(starter.map((x) => x.id)).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
  });

  it("every demo item uses known labels", () => {
    for (const x of starter) {
      expect(categoryNames).toContain(x.category);
      expect(statuses).toContain(x.status);
      for (const c of x.colors) expect(colors).toContain(c);
      for (const s of x.seasons) expect(seasons).toContain(s);
      expect(locations).toContain(x.location);
    }
  });

  it("items 14 and 16 have no photo, the others do", () => {
    starter.forEach((x, i) => {
      if (i === 13 || i === 15) expect(x.photo).toBe("");
      else expect(x.photo).toMatch(/^https:\/\//);
    });
  });

  it("default locations are the 4 original ones", () => {
    expect(locations).toEqual([
      "Tủ phòng ngủ – ngăn 1",
      "Tủ phòng ngủ – ngăn 2",
      "Hộp dưới gầm giường",
      "Kệ giày cửa ra vào",
    ]);
  });
});

describe("demo dates", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("lastWorn and createdAt are ISO dates relative to now", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.resetModules();
    const demo = await import("./demo");
    const first = demo.starter[0];
    expect(first.createdAt).toBe(now.toISOString());
    expect(first.lastWorn).toBe(new Date(now.getTime() - 3 * 86400000).toISOString());
  });
});
