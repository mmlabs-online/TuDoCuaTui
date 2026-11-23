import { describe, expect, test } from "vitest";
import { EDITOR_COPY, lastWornLabel } from "./copy";

describe("lastWornLabel", () => {
  test("empty lastWorn returns the never-worn wording", () => {
    expect(lastWornLabel("", 999)).toBe(EDITOR_COPY.wear.neverWorn);
  });

  test("0 days is hôm nay", () => {
    expect(lastWornLabel("2026-11-07", 0)).toBe("hôm nay");
  });

  test("1 and 365 days are N ngày", () => {
    expect(lastWornLabel("2026-11-06", 1)).toBe("1 ngày");
    expect(lastWornLabel("2025-11-07", 365)).toBe("365 ngày");
  });

  test("366 days is hơn 1 năm", () => {
    expect(lastWornLabel("2025-11-06", 366)).toBe("hơn 1 năm");
  });
});
