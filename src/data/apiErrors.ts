import { EDITOR_COPY } from "@/features/items/copy";
import { NAME_MAX, type ItemErrorCode } from "@/features/items/validate";
import type { Item } from "@/types/item";

const invalidInput = "Dữ liệu không hợp lệ";

/** Vietnamese messages for the Node API errors (one place, R6). */
export const API_ERROR_COPY = {
  network: "Không kết nối được máy chủ, thử lại nhé",
  unauthorized: "Phiên truy cập đã hết hạn — tải lại trang để đăng nhập lại",
  forbidden_origin: "Không có quyền thao tác",
  not_found: "Món đồ không còn tồn tại, tải lại trang nhé",
  conflict: "Dữ liệu vừa thay đổi hoặc bị trùng, thử lại nhé",
  payload_too_large: "Dữ liệu quá lớn",
  invalid_input: invalidInput,
  invalid_json: invalidInput,
  unsupported_media_type: invalidInput,
  invalid_photo: "Ảnh không hợp lệ",
  photos_unavailable: "Chưa lưu được ảnh lúc này, thử lại sau",
  photo_upload_failed: "Không tải ảnh lên được, thử lại nhé",
  request_timeout: "Tải ảnh quá lâu, thử lại nhé",
  db_unavailable: "Máy chủ dữ liệu đang bận, thử lại sau",
  internal: (id?: string) => (id ? `Lỗi máy chủ (mã ${id})` : "Lỗi máy chủ"),
  photoNotSaved: "Đã lưu món đồ nhưng chưa lưu được ảnh",
  unexpected: "Máy chủ phản hồi không hợp lệ, tải lại trang nhé",
  generic: "Có lỗi xảy ra, thử lại nhé",
} as const;

const EDITOR_REASONS: ItemErrorCode[] = [
  "nameRequired",
  "nameTooLong",
  "priceNegative",
  "priceInvalid",
  "dateInvalid",
];

export function apiErrorMessage(code: string, reason?: string, requestId?: string): string {
  if (code === "invalid_input" && reason && EDITOR_REASONS.includes(reason as ItemErrorCode)) {
    const m = EDITOR_COPY.errors[reason as ItemErrorCode];
    return typeof m === "function" ? m(NAME_MAX) : m;
  }
  if (code === "internal") return API_ERROR_COPY.internal(requestId);
  const m = (API_ERROR_COPY as Record<string, unknown>)[code];
  return typeof m === "string" ? m : API_ERROR_COPY.generic;
}

/** `message` is the Vietnamese text, so `useWardrobe.message()` shows it as is. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public field?: string,
    public reason?: string,
    public requestId?: string,
  ) {
    super(apiErrorMessage(code, reason, requestId));
    this.name = "ApiError";
  }
}

/** The item was saved but its photo step failed. `item` is the saved item, so the caller can retry the photo only. */
export class PhotoSaveError extends Error {
  constructor(
    public item: Item,
    cause: unknown,
  ) {
    const detail = (cause as Error | null)?.message;
    super(detail ? `${API_ERROR_COPY.photoNotSaved} — ${detail}` : API_ERROR_COPY.photoNotSaved);
    this.name = "PhotoSaveError";
  }
}
