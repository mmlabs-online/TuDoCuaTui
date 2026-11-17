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
  photo_quota_exceeded: "Bạn đã lưu đủ số ảnh tối đa — xoá bớt ảnh của món khác để thêm ảnh mới",
  rate_limited: "Bạn đã tải lên nhiều ảnh trong 24 giờ qua, thử lại sau nhé",
  restore_busy: "Đang có một lần khôi phục khác, thử lại sau vài giây",
  restore_conflict: "Không khôi phục được vì trùng mã với dữ liệu khác — chưa có gì bị thay đổi",
  db_unavailable: "Máy chủ dữ liệu đang bận, thử lại sau",
  internal: (id?: string) => (id ? `Lỗi máy chủ (mã ${id})` : "Lỗi máy chủ"),
  photoNotSaved: "Đã lưu món đồ nhưng chưa lưu được ảnh",
  unexpected: "Máy chủ phản hồi không hợp lệ, tải lại trang nhé",
  generic: "Có lỗi xảy ra, thử lại nhé",
} as const;

/** Photo-step overrides: the generic copy above is about item data. */
export const PHOTO_UPLOAD_ERROR_COPY = {
  payload_too_large: "Ảnh quá lớn để tải lên — thử chọn lại ảnh nhé",
  unsupported_media_type: "Định dạng ảnh không được hỗ trợ — hãy dùng JPG, PNG, WebP hoặc HEIC",
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
    const override =
      cause instanceof ApiError
        ? (PHOTO_UPLOAD_ERROR_COPY as Record<string, string>)[cause.code]
        : undefined;
    const detail = override || (cause as Error | null)?.message;
    super(detail ? `${API_ERROR_COPY.photoNotSaved} — ${detail}` : API_ERROR_COPY.photoNotSaved);
    this.name = "PhotoSaveError";
  }
}

/** Restore overrides: the generic copy above is about photos and single items. */
export const RESTORE_ERROR_COPY = {
  request_timeout: "Gửi tệp quá lâu nên bị ngắt — thử lại nhé",
  rate_limited: "Bạn đã khôi phục quá nhiều lần trong 1 giờ qua, thử lại sau nhé",
  payload_too_large: "Tệp sao lưu lớn hơn 8 MB nên không khôi phục được",
  invalid_json: "Tệp không phải JSON hợp lệ",
  network: "Mất kết nối khi khôi phục — chưa rõ đã xong chưa; khôi phục lại cùng tệp là an toàn",
  invalidFile: "Tệp sao lưu không hợp lệ",
} as const;

/** Reasons the server sends for `invalid_input` on restore (server/validate.js). */
export const BACKUP_REASON_COPY: Record<string, string> = {
  notObject: "dữ liệu phải là một đối tượng",
  versionUnsupported: "phiên bản tệp chưa được hỗ trợ",
  unknownKey: "có trường không nhận ra",
  invalidType: "sai kiểu dữ liệu",
  tooMany: "có quá nhiều dòng",
  idInvalid: "mã không hợp lệ",
  duplicateId: "mã bị trùng trong tệp",
  invalidValue: "giá trị không hợp lệ",
  tooLong: "quá dài",
  duplicateName: "tên vị trí bị trùng",
  danglingRef: "tham chiếu tới dòng không có trong tệp",
  cycle: "vị trí cha con bị vòng lặp",
  timestampInvalid: "thời gian không hợp lệ",
  duplicateWear: "lượt mặc bị trùng ngày",
};

/** `items[3].name` → "món #4 (name)". Other fields are shown as they are. */
export function describeBackupField(field?: string | null): string {
  if (!field) return "";
  const m = /^(items|locations|wearLogs)\[(\d+)\](?:\.([^[.]+))?/.exec(field);
  if (!m) return field;
  const label = { items: "món", locations: "vị trí", wearLogs: "lượt mặc" }[m[1] as "items"];
  return `${label} #${Number(m[2]) + 1}${m[3] ? ` (${m[3]})` : ""}`;
}

/** Message for a failed restore; `ApiError` texts are overridden where restore differs. */
export function restoreErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return API_ERROR_COPY.generic;
  const override = (RESTORE_ERROR_COPY as Record<string, string>)[e.code];
  if (e.code !== "invalid_input") return override ?? apiErrorMessage(e.code, e.reason, e.requestId);
  const base = RESTORE_ERROR_COPY.invalidFile;
  const reason = e.reason
    ? EDITOR_REASONS.includes(e.reason as ItemErrorCode)
      ? apiErrorMessage("invalid_input", e.reason)
      : BACKUP_REASON_COPY[e.reason]
    : undefined;
  const field = describeBackupField(e.field);
  return reason && field ? `${base} — ${field}: ${reason}` : base;
}
