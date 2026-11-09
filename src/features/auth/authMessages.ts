export const COPY = {
  eyebrow: "TỦ ĐỒ CÁ NHÂN",
  title: "Tủ đồ của tôi",
  intro: "Đăng nhập bằng email và mật khẩu của bạn.",
  emailLabel: "Email",
  emailPlaceholder: "ban@email.com",
  passwordLabel: "Mật khẩu",
  submit: "Đăng nhập",
  signingIn: "Đang đăng nhập…",
  errInvalidEmail: "Email chưa đúng định dạng. Kiểm tra lại giúp mình nhé.",
  errEmptyPassword: "Bạn chưa nhập mật khẩu.",
  errWrongCredentials: "Email hoặc mật khẩu chưa đúng. Kiểm tra lại giúp mình nhé.",
  errRateLimit: "Bạn thử hơi nhiều lần. Đợi một lúc rồi thử lại nhé.",
  errGeneric: "Chưa đăng nhập được. Kiểm tra kết nối rồi thử lại nhé.",
};

/** Deliberately loose; the server is the final check. */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Returns an error message, or null when the form may be submitted. The password is not trimmed. */
export function validateLogin(email: string, password: string): string | null {
  if (!isValidEmail(email)) return COPY.errInvalidEmail;
  if (password === "") return COPY.errEmptyPassword;
  return null;
}

const RATE_LIMIT_CODES = ["over_email_send_rate_limit", "over_request_rate_limit"];

export function authErrorMessage(
  err: { status?: number; code?: string } | null | undefined,
): string {
  if (err?.status === 429 || (err?.code && RATE_LIMIT_CODES.includes(err.code))) {
    return COPY.errRateLimit;
  }
  if (err?.code === "invalid_credentials") return COPY.errWrongCredentials;
  if (err?.code === "email_address_invalid") return COPY.errInvalidEmail;
  return COPY.errGeneric;
}
