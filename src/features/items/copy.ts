export const EDITOR_COPY = {
  save: "Lưu món đồ",
  close: "Đóng",
  duplicate: "Nhân bản",
  saving: "Đang lưu…",
  photo: {
    takePhoto: "Chụp ảnh",
    pickFromLibrary: "Chọn từ thư viện",
    loadFailed: "Không tải được ảnh",
    loadFailedHint: "Nhấp để chọn ảnh khác",
  },
  ai: {
    button: "Tự điền từ ảnh",
    busy: "Đang phân tích ảnh…",
    disclosure: (provider: string) => `Ảnh sẽ được gửi tới ${provider} bằng key của bạn`,
    notConfigured: "Chưa cài đặt AI — chọn nhà cung cấp và nhập API key trong Cài đặt",
    openSettings: "Mở cài đặt",
    undo: "Hoàn tác",
    filled: (n: number) => `Đã điền ${n} mục`,
    nothing: "AI không có gì để điền thêm",
    noPhoto: "Thêm ảnh để dùng tự điền",
    loadFailed: "Không tải được cài đặt AI",
    retry: "Thử lại",
    rateLimited: "Đã hết lượt dùng AI, thử lại sau",
  },
  errors: {
    nameRequired: "Vui lòng nhập tên món đồ",
    nameTooLong: (max: number) => `Tên tối đa ${max} ký tự`,
    priceNegative: "Giá không được âm",
    priceInvalid: "Giá không hợp lệ",
    dateInvalid: "Ngày mua không hợp lệ",
    dateFuture: "Ngày mua không được ở tương lai",
  },
  wear: {
    worn: "Đã ghi nhận mặc hôm nay",
    alreadyWorn: "Đã ghi nhận hôm nay rồi",
    adjusted: "Đã điều chỉnh số lần mặc",
  },
  discard: {
    title: "Bỏ thay đổi?",
    body: "Các thay đổi chưa lưu sẽ bị mất.",
    cancel: "Tiếp tục sửa",
    confirm: "Bỏ thay đổi",
  },
} as const;

export const GRID_COPY = { loadMore: "Xem thêm" } as const;
