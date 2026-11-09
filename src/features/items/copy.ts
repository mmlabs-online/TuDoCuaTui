export const EDITOR_COPY = {
  save: "Lưu món đồ",
  saving: "Đang lưu…",
  photo: {
    takePhoto: "Chụp ảnh",
    pickFromLibrary: "Chọn từ thư viện",
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
