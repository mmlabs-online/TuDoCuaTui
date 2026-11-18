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
  },
  shuffle: "Đổi gợi ý",
  close: "Đóng",
  empty: {
    title: "Chưa đủ đồ để phối",
    body: "Cần ít nhất một áo và một quần/váy, hoặc một đầm, set đồ hay áo dài đang dùng.",
  },
  openItem: (name: string) => `Mở ${name}`,
} as const;
