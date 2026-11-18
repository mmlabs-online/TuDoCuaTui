export const OUTFITS_COPY = {
  entry: "Hôm nay mặc gì?",
  eyebrow: "GỢI Ý HÔM NAY",
  title: "Hôm nay mặc gì?",
  season: (s: string) => `Mùa ${s}`,
  outfitLabel: (n: number) => `Bộ ${n}`,
  reasons: {
    neverWorn: "Chưa mặc lần nào",
    stale: "Lâu chưa mặc",
    season: (s: string) => `Hợp mùa ${s}`,
    cold: "Trời lạnh",
    hot: "Trời nóng",
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
  shuffle: "Đổi gợi ý",
  close: "Đóng",
  empty: {
    title: "Chưa đủ đồ để phối",
    body: "Cần ít nhất một áo và một quần/váy, hoặc một đầm, set đồ hay áo dài đang dùng.",
  },
  openItem: (name: string) => `Mở ${name}`,
} as const;
