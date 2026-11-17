import { describe, expect, test } from "vitest";
import { scaledSize } from "./photoScale";

describe("scaledSize", () => {
  test("landscape 4032×3024 at 1200 → 1200×900", () => {
    expect(scaledSize(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 });
  });
  test("portrait 3024×4032 at 900 → 675×900", () => {
    expect(scaledSize(3024, 4032, 900)).toEqual({ width: 675, height: 900 });
  });
  test("smaller than max is not upscaled (800×600 at 1200 → 800×600)", () => {
    expect(scaledSize(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
  test("rounds like Math.round (4000×3001 at 1200 → 1200×900)", () => {
    expect(scaledSize(4000, 3001, 1200)).toEqual({ width: 1200, height: 900 });
  });
});
