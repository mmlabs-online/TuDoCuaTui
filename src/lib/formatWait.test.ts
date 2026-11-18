import { describe, expect, it } from "vitest";

import { formatWait } from "./formatWait";

describe("formatWait", () => {
  it.each([
    [1, "1 giây"],
    [59, "59 giây"],
    [60, "1 phút"],
    [61, "2 phút"],
    [900, "15 phút"],
    [3600, "1 giờ"],
    [3601, "2 giờ"],
    [0, "ít phút"],
    [-5, "ít phút"],
    [NaN, "ít phút"],
  ])("%s → %s", (n, text) => {
    expect(formatWait(n)).toBe(text);
  });
});
