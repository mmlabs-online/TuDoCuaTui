export const COPY = {
  eyebrow: "TỦ ĐỒ CÁ NHÂN",
  title: "Tủ đồ của tôi",
  intro: "Nhập email, mình sẽ gửi link đăng nhập — không cần mật khẩu.",
  emailLabel: "Email",
  emailPlaceholder: "ban@email.com",
  send: "Gửi link đăng nhập",
  sending: "Đang gửi…",
  resend: "Gửi lại",
  resendIn: (n: number) => `Gửi lại sau ${n}s`,
  sentTo: "Đã gửi link đăng nhập tới",
  sentHint: "Mở email trên thiết bị này để tiếp tục.",
  errInvalidEmail: "Email chưa đúng định dạng. Kiểm tra lại giúp mình nhé.",
  errRateLimit: "Bạn gửi hơi nhanh. Đợi khoảng một phút rồi thử lại nhé.",
  errGeneric: "Chưa gửi được link đăng nhập. Kiểm tra kết nối rồi thử lại nhé.",
};

/** Deliberately loose; the server is the final check. */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const RATE_LIMIT_CODES = ["over_email_send_rate_limit", "over_request_rate_limit"];

export function authErrorMessage(
  err: { status?: number; code?: string } | null | undefined,
): string {
  if (err?.status === 429 || (err?.code && RATE_LIMIT_CODES.includes(err.code))) {
    return COPY.errRateLimit;
  }
  if (err?.code === "email_address_invalid") return COPY.errInvalidEmail;
  return COPY.errGeneric;
}
