import { describe, expect, it } from "vitest";

import { OUTFITS_COPY } from "@/features/outfits/copy";

describe("OUTFITS_COPY", () => {
  it("outfit copy", () => {
    expect(OUTFITS_COPY.season("Đông")).toBe("Mùa Đông");
    expect(OUTFITS_COPY.outfitLabel(1)).toBe("Bộ 1");
    expect(OUTFITS_COPY.reasons.season("Hạ")).toBe("Hợp mùa Hạ");
    expect(OUTFITS_COPY.openItem("Áo dài lụa")).toBe("Mở Áo dài lụa");
  });
});
