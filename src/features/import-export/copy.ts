/** Vietnamese error messages for CSV row validation (F-601.2). */
export const CSV_MAP_COPY = {
  nameRequired: "Thiếu tên món đồ",
  nameTooLong: (max: number) => `Tên dài quá ${max} ký tự`,
  unknownCategory: (v: string) => `Loại không hợp lệ: ${v}`,
  unknownStatus: (v: string) => `Trạng thái không hợp lệ: ${v}`,
  unknownColors: (v: string[]) => `Màu không hợp lệ: ${v.join(", ")}`,
  unknownSeasons: (v: string[]) => `Mùa không hợp lệ: ${v.join(", ")}`,
  badPrice: (v: string) => `Giá không hợp lệ: ${v}`,
  badDate: (v: string) => `Ngày mua không hợp lệ: ${v}`,
  futureDate: (v: string) => `Ngày mua không được ở tương lai: ${v}`,
};

/** "2 giờ" / "5 phút" from a `Retry-After` in seconds; unknown → "ít phút". */
export function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "ít phút";
  if (seconds < 60) return `${Math.ceil(seconds)} giây`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} phút`;
  return `${Math.ceil(seconds / 3600)} giờ`;
}

/** UI copy for the import and export modals (F-004.3). */
export const IMPORT_EXPORT_COPY = {
  import: {
    close: "Đóng",
    eyebrow: "THÊM NHIỀU MÓN",
    titleBefore: "Đưa tủ đồ",
    titleEm: "vào app",
    tabs: ["Ảnh hàng loạt", "CSV / Excel", "JSON (backup)"],
    cancel: "Huỷ",
    processing: "Đang xử lý…",
    checkAndImport: "Kiểm tra & import",
    comingSoon: "Sắp có — hiện chỉ nhập được bằng CSV.",
    photos: {
      dropTitle: "Kéo nhiều ảnh vào đây",
      dropHint: "Mỗi ảnh sẽ trở thành một món đồ mới",
      pickPhotos: "Chọn ảnh từ máy",
      locationLabel: "Vị trí lưu trữ mặc định",
      locationPlaceholder: "Chọn vị trí…",
      statusLabel: "Trạng thái mặc định",
      fallbackName: "Món đồ mới",
      importN: (n: number) => `Nhập ${n} ảnh`,
      fileCount: (n: number) => `${n} ảnh đã chọn`,
      dailyWarning: (limit: number) =>
        `Mỗi ngày chỉ tải lên được khoảng ${limit} ảnh. Nếu vượt quá, việc nhập sẽ dừng lại và bạn có thể thử lại sau.`,
      running: (k: number, n: number, name: string) => `Đang nhập ${k}/${n}: ${name}`,
      state: {
        pending: "Chờ",
        done: "Xong",
        failed: "Lỗi",
        photoFailed: "Chưa có ảnh",
      },
      summaryImported: (n: number) => `Đã nhập: ${n}`,
      summaryFailed: (n: number) => `Lỗi: ${n}`,
      summaryPending: (n: number) => `Chưa xử lý: ${n}`,
      retry: (n: number) => `Thử lại (${n})`,
      stoppedRateLimited: (imported: number, wait: string) =>
        `Đã dừng: đã nhập ${imported} ảnh. Bạn đã đạt giới hạn tải ảnh trong 24 giờ, thử lại sau ${wait} nhé. Các ảnh còn lại vẫn nằm trong danh sách.`,
      stoppedQuota: (imported: number) =>
        `Đã dừng: đã nhập ${imported} ảnh. Bạn đã lưu đủ số ảnh tối đa — xoá bớt ảnh của món khác rồi thử lại. Các ảnh còn lại vẫn nằm trong danh sách.`,
    },
    csv: {
      title: "Nhập danh sách từ bảng tính",
      hint: "Tải lên file CSV hoặc dán dữ liệu. Hàng đầu tiên cần là tên các cột.",
      sample: "Mẫu CSV",
      copySample: "Copy mẫu",
      pickFile: "Chọn file .csv",
      orPaste: "hoặc dán dữ liệu",
      pastePlaceholder: "Dán nội dung CSV tại đây…",
      categoriesHint: (labels: string[]) => `Loại dùng được: ${labels.join(", ")}`,
      columnsHint: "Cột dùng được: name, category, colors, brand…",
      willImport: (n: number) => `Sẽ nhập ${n} món`,
      willSkip: (n: number) => `Bỏ qua ${n} dòng lỗi`,
      ignoredColumns: (c: string[]) => `Bỏ qua cột: ${c.join(", ")}`,
      noRows: "Không có dòng dữ liệu nào",
      parseError: (line: number) => `File CSV lỗi: dấu ngoặc kép chưa đóng ở dòng ${line}`,
      previewTitle: (shown: number, total: number) => `Xem trước ${shown}/${total} dòng`,
      rowLabel: (n: number) => `Dòng ${n}`,
      importN: (n: number) => `Nhập ${n} món`,
      running: (done: number, total: number) => `Đang nhập ${done}/${total}`,
      summaryImported: (n: number) => `Đã nhập: ${n}`,
      summarySkipped: (n: number) => `Bỏ qua (lỗi dữ liệu): ${n}`,
      summaryFailed: (n: number) => `Lỗi khi lưu: ${n}`,
      done: "Xong",
    },
    json: {
      title: "Khôi phục từ bản sao lưu",
      hint: "Chọn tệp JSON đã xuất trước đó. Dữ liệu hiện tại sẽ được giữ nguyên và các món mới sẽ được thêm vào.",
      pickFile: "Chọn file .json",
      orPaste: "hoặc dán JSON",
      pastePlaceholder: '[{"name": "Áo sơ mi", ...}]',
    },
  },
  export: {
    close: "Đóng",
    eyebrow: "SAO LƯU & CHIA SẺ",
    title: "Export tủ đồ",
    hint: "Chọn định dạng phù hợp với nhu cầu của bạn.",
    jsonHint: "Bản sao lưu đầy đủ để khôi phục",
    csvHint: "Mở bằng Excel hoặc Google Sheets",
    photoNote: "Ảnh được giữ an toàn trong ứng dụng và không nằm trong tệp export.",
  },
  imported: (n: number) => `Đã thêm ${n} món vào tủ`,
  exported: (t: "json" | "csv") => `Đã xuất ${t.toUpperCase()}`,
};
