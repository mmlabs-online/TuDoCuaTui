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
      ai: {
        title: "Dùng AI điền loại, màu, mùa…",
        hint: "Chỉ điền các mục còn trống, bạn có thể sửa lại sau",
        disclosure: (provider: string) => `Ảnh sẽ được gửi tới ${provider} bằng key của bạn`,
        tagging: (k: number, n: number, name: string) => `Đang nhờ AI xem ảnh ${k}/${n}: ${name}`,
        state: {
          filled: "AI đã điền",
          nothing: "AI không có gì để điền",
          skipped: "Không dùng được AI",
          off: "Không dùng AI",
        },
        summaryFilled: (n: number) => `AI đã điền: ${n}`,
        stoppedRateLimited:
          "Đã hết lượt dùng AI trong 24 giờ — các ảnh còn lại vẫn được nhập nhưng không có AI.",
        stoppedOther: (reason: string) => `${reason} — các ảnh còn lại được nhập không có AI.`,
      },
      summaryImported: (n: number) => `Đã nhập: ${n}`,
      summaryFailed: (n: number) => `Lỗi: ${n}`,
      summaryPending: (n: number) => `Chưa xử lý: ${n}`,
      retry: (n: number) => `Thử lại (${n})`,
      retryIn: (wait: string) => `Thử lại sau ${wait}`,
      stoppedRateLimited: (imported: number, wait: string) =>
        `Đã dừng: đã nhập ${imported} ảnh. Bạn đã đạt giới hạn tải ảnh trong 24 giờ, thử lại sau ${wait} nhé. Các ảnh còn lại vẫn nằm trong danh sách.`,
      stoppedQuota: (imported: number) =>
        `Đã dừng: đã nhập ${imported} ảnh. Bạn đã lưu đủ số ảnh tối đa — xoá bớt ảnh của món khác rồi thử lại. Các ảnh còn lại vẫn nằm trong danh sách.`,
      stoppedUnauthorized: (imported: number) =>
        `Đã dừng: đã nhập ${imported} ảnh. Phiên đăng nhập đã hết hạn — hãy đăng nhập lại rồi thử lại. Các ảnh còn lại vẫn nằm trong danh sách.`,
      stoppedNetwork: (imported: number) =>
        `Đã dừng: đã nhập ${imported} ảnh. Không kết nối được máy chủ — kiểm tra mạng rồi bấm Thử lại. Các ảnh còn lại vẫn nằm trong danh sách.`,
      stoppedUnavailable: (imported: number) =>
        `Đã dừng: đã nhập ${imported} ảnh. Máy chủ tạm thời chưa lưu được món đồ hoặc ảnh, thử lại sau nhé. Các ảnh còn lại vẫn nằm trong danh sách.`,
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
      hint: "Chọn tệp JSON đã xuất trước đó. Món có cùng mã sẽ được ghi đè, món mới được thêm vào, không có gì bị xoá. Ảnh không nằm trong tệp.",
      pickFile: "Chọn file .json",
      orPaste: "hoặc dán JSON",
      pastePlaceholder: '{"version": 1, "items": [...], ...}',
      pickedFile: (name: string, kb: number) => `${name} (${kb} KB)`,
      clearFile: "Bỏ chọn",
      check: "Kiểm tra & import",
      restore: "Khôi phục",
      running: "Đang khôi phục…",
      precheck: {
        tooLarge: (maxMb: number) => `Tệp lớn hơn ${maxMb} MB nên không khôi phục được`,
        empty: "Chưa có nội dung để kiểm tra",
        notJson: "Nội dung không phải JSON hợp lệ",
        legacyArray:
          "Đây là tệp xuất cũ (chỉ danh sách món), không dùng để khôi phục được — hãy xuất lại bản sao lưu mới",
        notObject: "Đây không phải tệp sao lưu của ứng dụng",
        versionUnsupported: "Phiên bản tệp sao lưu chưa được hỗ trợ",
        missingList: (field: string) => `Tệp sao lưu thiếu danh sách "${field}"`,
        tooMany: (field: string, max: number) =>
          `Danh sách "${field}" vượt quá ${max} dòng nên không khôi phục được`,
      },
      fileFrom: (date: string) => `Bản sao lưu ngày ${date}`,
      counts: (items: number, locations: number, wearLogs: number) =>
        `${items} món · ${locations} vị trí · ${wearLogs} lượt mặc`,
      warning: "Khôi phục sẽ ghi đè các món có cùng mã và không xoá gì. Ảnh không nằm trong tệp.",
      photoNote: (n: number) => `${n} món trong tệp từng có ảnh; ảnh sẽ không được khôi phục.`,
      summaryTitle: "Đã khôi phục",
      summary: {
        itemsInserted: (n: number) => `Món thêm mới: ${n}`,
        itemsUpdated: (n: number) => `Món được cập nhật: ${n}`,
        itemsUnchanged: (n: number) => `Món không đổi: ${n}`,
        itemsRemapped: (n: number) => `Món đổi mã: ${n}`,
        locationsInserted: (n: number) => `Vị trí thêm mới: ${n}`,
        locationsUpdated: (n: number) => `Vị trí được cập nhật: ${n}`,
        locationsUnchanged: (n: number) => `Vị trí không đổi: ${n}`,
        locationsMerged: (n: number) => `Vị trí gộp theo tên: ${n}`,
        locationsRemapped: (n: number) => `Vị trí đổi mã: ${n}`,
        wearLogsInserted: (n: number) => `Lượt mặc thêm mới: ${n}`,
        wearLogsUnchanged: (n: number) => `Lượt mặc không đổi: ${n}`,
        photosMissing: (n: number) => `${n} món chưa có ảnh`,
      },
      done: "Xong",
    },
  },
  export: {
    close: "Đóng",
    eyebrow: "SAO LƯU & CHIA SẺ",
    title: "Export tủ đồ",
    hint: "Chọn định dạng phù hợp với nhu cầu của bạn.",
    jsonHint: "Bản sao lưu đầy đủ (món, vị trí, lịch sử mặc) để khôi phục",
    csvHint: "Mở bằng Excel hoặc Google Sheets",
    photoNote: "Ảnh được giữ an toàn trong ứng dụng và không nằm trong tệp export.",
  },
  imported: (n: number) => `Đã thêm ${n} món vào tủ`,
  restored: "Đã khôi phục bản sao lưu",
  exported: (t: "json" | "csv") => `Đã xuất ${t.toUpperCase()}`,
};
