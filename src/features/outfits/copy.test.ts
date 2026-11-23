import { describe, expect, it } from "vitest";

import { OUTFITS_COPY } from "@/features/outfits/copy";
import { AI_CLIENT_ERROR_CODES, AI_ERROR_STATUS } from "@/shared/ai/errors";

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

describe("OUTFITS_COPY.heading", () => {
  it("heading", () => {
    expect(OUTFITS_COPY.heading("Đông", { cold: false, hot: true })).toBe("Trời nóng");
    expect(OUTFITS_COPY.heading("Hạ", { cold: true, hot: false })).toBe("Trời lạnh");
    expect(OUTFITS_COPY.heading("Thu", { cold: false, hot: false })).toBe("Mùa Thu");
    expect(OUTFITS_COPY.reasons.seasonFit).toBe("Hợp mùa");
  });

  it("fallbackNote", () => {
    expect(OUTFITS_COPY.fallbackNote("Đông", { cold: false, hot: true })).toBe(
      "Tủ đồ chưa có đồ cho trời nóng — gợi ý có thể chưa phù hợp.",
    );
    expect(OUTFITS_COPY.fallbackNote("Hạ", { cold: true, hot: false })).toBe(
      "Tủ đồ chưa có đồ cho trời lạnh — gợi ý có thể chưa phù hợp.",
    );
    expect(OUTFITS_COPY.fallbackNote("Đông", { cold: false, hot: false })).toBe(
      "Tủ đồ chưa có đồ cho mùa Đông — gợi ý có thể chưa phù hợp.",
    );
  });
});

describe("OUTFITS_COPY.ai", () => {
  it("ai.note covers every AI error code", () => {
    for (const code of [...Object.keys(AI_ERROR_STATUS), ...AI_CLIENT_ERROR_CODES]) {
      expect(OUTFITS_COPY.ai.note(code).length).toBeGreaterThan(0);
    }
  });

  it("ai copy texts", () => {
    const ai = OUTFITS_COPY.ai;
    expect(ai.toggle).toBe("Gợi ý bằng AI");
    expect(ai.chip).toBe("AI");
    expect(ai.openSettings).toBe("Mở cài đặt");
    expect(ai.loading).toBe("Đang nhờ AI gợi ý…");
    expect(ai.note("rate_limited")).toBe("Hôm nay đã dùng hết lượt AI, đang dùng gợi ý thường.");
    expect(ai.note("provider_rate_limited")).toBe(
      "Nhà cung cấp AI đang giới hạn lượt gọi, thử lại sau ít phút.",
    );
    expect(ai.note("ai_busy")).toBe("AI đang bận, thử lại sau vài giây.");
    expect(ai.note("not_configured")).toBe("Kiểm tra lại AI trong Cài đặt.");
    expect(ai.note("invalid_key")).toBe("Kiểm tra lại AI trong Cài đặt.");
    expect(ai.note("request_timeout")).toBe("Chưa gọi được AI, thử lại sau.");
    expect(ai.note("network")).toBe("Chưa gọi được AI, thử lại sau.");
    expect(ai.note("provider_bad_response")).toBe("AI chưa đưa ra được bộ đồ hợp lệ.");
    expect(ai.note("internal")).toBe("AI không khả dụng, đang dùng gợi ý thường.");
  });
});
