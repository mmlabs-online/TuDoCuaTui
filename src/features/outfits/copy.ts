import { needsSettings } from "@/features/items/aiFill";

const COLD = "Trời lạnh";
const HOT = "Trời nóng";

export const OUTFITS_COPY = {
  entry: "Hôm nay mặc gì?",
  eyebrow: "GỢI Ý HÔM NAY",
  title: "Hôm nay mặc gì?",
  season: (s: string) => `Mùa ${s}`,
  heading: (s: string, w: { cold: boolean; hot: boolean }) =>
    w.hot ? HOT : w.cold ? COLD : `Mùa ${s}`,
  fallbackNote: (s: string, w: { cold: boolean; hot: boolean }) =>
    w.hot
      ? "Tủ đồ chưa có đồ cho trời nóng — gợi ý có thể chưa phù hợp."
      : w.cold
        ? "Tủ đồ chưa có đồ cho trời lạnh — gợi ý có thể chưa phù hợp."
        : `Tủ đồ chưa có đồ cho mùa ${s} — gợi ý có thể chưa phù hợp.`,
  outfitLabel: (n: number) => `Bộ ${n}`,
  reasons: {
    neverWorn: "Chưa mặc lần nào",
    stale: "Lâu chưa mặc",
    season: (s: string) => `Hợp mùa ${s}`,
    seasonFit: "Hợp mùa",
    cold: COLD,
    hot: HOT,
    rain: "Có thể mưa",
  },
  weather: {
    label: "Thời tiết",
    off: "Tắt",
    loading: "Đang xem thời tiết…",
    unavailable: "Chưa lấy được thời tiết, gợi ý theo mùa.",
    summary: (name: string, minC: number, maxC: number, rain: number | null) =>
      `${name} · ${Math.round(minC)}–${Math.round(maxC)}°C` +
      (rain === null ? "" : ` · Mưa ${Math.round(rain)}%`),
    credit: "Open-Meteo",
    creditUrl: "https://open-meteo.com/",
  },
  ai: {
    icon: "✨",
    toggle: "Gợi ý bằng AI",
    chip: "AI",
    openSettings: "Mở cài đặt",
    loading: "Đang nhờ AI gợi ý…",
    note: (code: string): string => {
      if (code === "rate_limited") return "Hôm nay đã dùng hết lượt AI, đang dùng gợi ý thường.";
      if (code === "provider_rate_limited")
        return "Nhà cung cấp AI đang giới hạn lượt gọi, thử lại sau ít phút.";
      if (code === "ai_busy") return "AI đang bận, thử lại sau vài giây.";
      if (needsSettings(code)) return "Kiểm tra lại AI trong Cài đặt.";
      if (code === "request_timeout" || code === "provider_unavailable" || code === "network")
        return "Chưa gọi được AI, thử lại sau.";
      if (code === "provider_bad_response") return "AI chưa đưa ra được bộ đồ hợp lệ.";
      return "AI không khả dụng, đang dùng gợi ý thường.";
    },
  },
  shuffle: "Đổi gợi ý",
  close: "Đóng",
  empty: {
    title: "Chưa đủ đồ để phối",
    body: "Cần ít nhất một áo và một quần/váy, hoặc một đầm, set đồ hay áo dài đang dùng.",
  },
  openItem: (name: string) => `Mở ${name}`,
} as const;
