import type { AiErrorCode } from "@/shared/ai/errors";

export const SETTINGS_COPY = {
  open: "Cài đặt",
  close: "Đóng",
  eyebrow: "CÀI ĐẶT",
  title: "Cài đặt AI",
  provider: "Nhà cung cấp",
  providerOptions: { claude: "Claude", gemini: "Gemini (sắp có)" },
  model: "Model",
  apiKey: "API key",
  keyPlaceholder: "Dán API key",
  keySaved: (hint: string) => `Đã lưu: ${hint}. Để trống nếu giữ key cũ.`,
  noKey: "Chưa có key.",
  unsupportedModel: "Model không còn hỗ trợ, chọn model khác",
  saveFirst: "Lưu trước khi kiểm tra",
  loading: "Đang tải…",
  retry: "Thử lại",
  save: "Lưu",
  test: "Kiểm tra",
  deleteKey: "Xoá key",
  saved: "Đã lưu cài đặt AI",
  deleted: "Đã xoá key",
  testOk: "Key hoạt động",
  testFailed: "Kiểm tra thất bại: ",
  confirmDelete: {
    title: "Xoá key đã lưu?",
    body: "Key sẽ bị xoá khỏi máy chủ. Bạn cần nhập lại key để dùng AI.",
    confirm: "Xoá key",
    cancel: "Giữ lại",
  },
} as const;

export const AI_ERRORS: Record<AiErrorCode, string> = {
  bad_request: "Dữ liệu không hợp lệ",
  unauthorized: "Phiên truy cập đã hết hạn — tải lại trang để đăng nhập lại",
  method_not_allowed: "Thao tác không được hỗ trợ",
  payload_too_large: "Dữ liệu quá lớn",
  invalid_json: "Dữ liệu không hợp lệ",
  unsupported_media_type: "Dữ liệu không hợp lệ",
  forbidden_origin: "Không có quyền thao tác",
  db_unavailable: "Máy chủ dữ liệu đang bận, thử lại sau",
  invalid_provider: "Nhà cung cấp không hợp lệ",
  invalid_model: "Model không hợp lệ, chọn model khác",
  invalid_key_format: "Key không đúng định dạng (20–256 ký tự, không có khoảng trắng)",
  key_required: "Đổi nhà cung cấp thì cần nhập key mới",
  not_configured: "Chưa có key — lưu key trước khi kiểm tra",
  key_unreadable: "Không đọc được key đã lưu — hãy nhập lại key",
  invalid_key: "Key không hợp lệ hoặc đã bị thu hồi",
  key_forbidden: "Key không có quyền dùng model này",
  model_unavailable: "Model này hiện không dùng được với key của bạn",
  provider_rate_limited: "Nhà cung cấp đang giới hạn lượt gọi, thử lại sau ít phút",
  provider_unavailable: "Nhà cung cấp AI đang gặp sự cố, thử lại sau",
  rate_limited: "Thao tác quá nhiều lần, thử lại sau ít phút",
  server_misconfigured: "AI chưa được cấu hình trên máy chủ",
  internal: "Lỗi máy chủ",
  not_available: "Tính năng AI chỉ có khi dùng máy chủ",
  network: "Không kết nối được máy chủ — kiểm tra mạng hoặc tải lại trang để đăng nhập lại",
};

export function aiErrorMessage(code: string, requestId?: string): string {
  const known = Object.prototype.hasOwnProperty.call(AI_ERRORS, code);
  const msg = known ? AI_ERRORS[code as AiErrorCode] : AI_ERRORS.internal;
  return requestId && (!known || code === "internal") ? `${msg} (mã ${requestId})` : msg;
}
