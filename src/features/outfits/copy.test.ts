import { describe, expect, it } from "vitest";

import { OUTFITS_COPY } from "@/features/outfits/copy";

describe("OUTFITS_COPY", () => {
  it("outfit copy", () => {
    expect(OUTFITS_COPY.season("Đông")).toBe("Mùa Đông");
    expect(OUTFITS_COPY.outfitLabel(1)).toBe("Bộ 1");
    expect(OUTFITS_COPY.reasons.season("Hạ")).toBe("Hợp mùa Hạ");
    expect(OUTFITS_COPY.openItem("Áo dài lụa")).toBe("Mở Áo dài lụa");
  });

  it("weather summary", () => {
    expect(OUTFITS_COPY.weather.summary("Hà Nội", 18.4, 23.6, 70)).toBe(
      "Hà Nội · 18–24°C · Mưa 70%",
    );
    expect(OUTFITS_COPY.weather.summary("Hà Nội", 18.4, 23.6, null)).toBe("Hà Nội · 18–24°C");
    expect(OUTFITS_COPY.reasons.cold).toBe("Trời lạnh");
    expect(OUTFITS_COPY.reasons.hot).toBe("Trời nóng");
    expect(OUTFITS_COPY.reasons.rain).toBe("Có thể mưa");
  });
});
