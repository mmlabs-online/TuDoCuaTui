export const LAYOUT_COPY = {
  addItem: "Thêm món đồ",
  signOut: "Đăng xuất",
  version: (v: string) => `Phiên bản ${v}`,
  serverUnavailable: {
    title: "Không kết nối được máy chủ",
    body: "Ứng dụng cần máy chủ để tải tủ đồ. Kiểm tra kết nối rồi thử lại.",
    retry: "Thử lại",
    retrying: "Đang thử lại…",
    devHint:
      "Dev: chạy server Node (pnpm start) và làm mới token theo mục Development trong README.",
  },
} as const;
