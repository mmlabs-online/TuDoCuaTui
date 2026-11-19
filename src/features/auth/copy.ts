import { formatWait } from "@/lib/formatWait";

import type { AuthError, AuthErrorCode } from "./types";

export type FieldErrorCode = "required" | "invalid" | "tooShort" | "tooLong" | "mismatch";

export const AUTH_COPY = {
  brand: "Tủ đồ của tôi",
  signIn: {
    title: "Đăng nhập",
    submit: "Đăng nhập",
    submitting: "Đang đăng nhập…",
    toSignUp: "Chưa có tài khoản? Tạo tài khoản",
    verified: "Email đã được xác minh. Hãy đăng nhập để tiếp tục.",
    signedOut: "Bạn đã đăng xuất.",
    logoutUnconfirmed:
      "Bạn đã đăng xuất khỏi Tủ đồ của tôi trên trình duyệt này, nhưng chưa xác nhận được việc đăng xuất khỏi tài khoản mmlabs. Nếu đây là máy dùng chung, hãy đóng hết các cửa sổ trình duyệt.",
    forgot: "Quên mật khẩu?",
    passwordReset: "Mật khẩu đã được đổi. Hãy đăng nhập bằng mật khẩu mới.",
  },
  forgot: {
    title: "Quên mật khẩu",
    intro: "Nhập email của bạn. Chúng tôi sẽ gửi link để đặt lại mật khẩu.",
    submit: "Gửi link đặt lại mật khẩu",
    submitting: "Đang gửi…",
    sentTitle: "Kiểm tra email của bạn",
    sentBody: "Nếu email này đã có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu tới đó.",
    sentNote: "Link có hiệu lực 30 phút và chỉ dùng được một lần.",
    toSignIn: "Quay lại đăng nhập",
  },
  reset: {
    title: "Đặt lại mật khẩu",
    intro: "Nhập mật khẩu mới cho tài khoản của bạn.",
    submit: "Đổi mật khẩu",
    submitting: "Đang đổi mật khẩu…",
    done: "Mật khẩu đã được đổi. Tài khoản đã được đăng xuất trên mọi thiết bị, hãy đăng nhập lại bằng mật khẩu mới.",
    continue: "Tiếp tục",
    invalid:
      "Link đặt lại mật khẩu không hợp lệ, đã được dùng hoặc đã hết hạn (link có hiệu lực 30 phút).",
    requestNew: "Gửi link mới",
  },
  signUp: {
    title: "Tạo tài khoản",
    submit: "Tạo tài khoản",
    submitting: "Đang tạo tài khoản…",
    toSignIn: "Đã có tài khoản? Đăng nhập",
    sentTitle: "Kiểm tra email của bạn",
    sentBody: (email: string) => `Chúng tôi đã gửi link xác minh tới ${email}.`,
    sentNote: "Link có hiệu lực 24 giờ.",
    passwordHint: "Ít nhất 6 ký tự.",
  },
  verify: {
    title: "Xác minh email",
    ready: "Nhấn nút bên dưới để xác minh email của bạn.",
    submit: "Xác minh email",
    verifying: "Đang xác minh email của bạn…",
    verified: "Email đã được xác minh.",
    continue: "Tiếp tục",
    goSignIn: "Đăng nhập để gửi lại email",
  },
  join: {
    title: "Tham gia Tủ đồ của tôi",
    body: "Tài khoản của bạn chưa dùng Tủ đồ của tôi. Nhấn nút bên dưới để bắt đầu.",
    continue: (email: string) => `Tiếp tục với ${email}`,
    joining: "Đang tham gia…",
    otherAccount: "Dùng tài khoản khác",
  },
  gate: {
    checking: "Đang kiểm tra phiên đăng nhập…",
  },
  fields: {
    email: "Email",
    password: "Mật khẩu",
    newPassword: "Mật khẩu mới",
    confirm: "Nhập lại mật khẩu",
    showPassword: "Hiện mật khẩu",
  },
  fieldErrors: {
    required: "Vui lòng nhập thông tin này.",
    invalid: "Email chưa đúng định dạng.",
    tooShort: "Mật khẩu cần ít nhất 6 ký tự.",
    tooLong: "Mật khẩu tối đa 128 ký tự.",
    mismatch: "Mật khẩu nhập lại chưa khớp.",
  } satisfies Record<FieldErrorCode, string>,
  actions: {
    resend: "Gửi lại email xác minh",
    resending: "Đang gửi…",
    resendSent: "Đã gửi lại email xác minh. Vui lòng kiểm tra hộp thư.",
    goSignIn: "Đăng nhập",
    retry: "Thử lại",
  },
  errors: {
    invalid_credentials: "Email hoặc mật khẩu không đúng.",
    email_unverified: "Email của bạn chưa được xác minh. Mở link trong email chúng tôi đã gửi.",
    not_member: "Tài khoản này chưa có quyền dùng Tủ đồ của tôi.",
    join_closed: "Tủ đồ của tôi hiện không nhận thành viên mới.",
    join_approval_unavailable: "Tủ đồ của tôi chưa mở cho thành viên mới. Vui lòng thử lại sau.",
    join_unavailable: "Chưa thể tham gia Tủ đồ của tôi lúc này. Vui lòng liên hệ người vận hành.",
    no_access:
      "Tài khoản này chưa được cấp quyền dùng Tủ đồ của tôi. Hãy đăng nhập bằng tài khoản khác hoặc thử lại sau.",
    session_invalid: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    turnstile_required: "Vui lòng hoàn tất bước xác minh bên dưới rồi thử lại.",
    turnstile_failed: "Xác minh không thành công, vui lòng thử lại.",
    rate_limited: (wait: string) => `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${wait}.`,
    network: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    email_taken: "Email này đã có tài khoản.",
    weak_password: "Mật khẩu chưa đủ mạnh.",
    weak_too_short: "Mật khẩu cần ít nhất 6 ký tự.",
    weak_too_common: "Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác.",
    validation_error: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
    token_invalid: "Link xác minh không hợp lệ hoặc đã hết hạn (link có hiệu lực 24 giờ).",
    email_already_verified: "Email đã được xác minh. Bạn có thể đăng nhập.",
    unknown: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
  },
  preview: {
    title: "Xem trước màn hình đăng nhập",
    screen: "Màn hình",
    state: "Trạng thái",
    error: "Lỗi",
    none: "Không có",
    dark: "Chế độ tối",
    frame: "Khung 390px",
    log: "Nhật ký",
    turnstile: "Turnstile",
    signIn: "Đăng nhập",
    signUp: "Đăng ký",
    verify: "Xác minh email",
    join: "Tham gia",
    forgot: "Quên mật khẩu",
    reset: "Đặt lại mật khẩu",
  },
};

export function authErrorMessage(error: AuthError): string {
  const e = AUTH_COPY.errors;
  const code: AuthErrorCode =
    typeof error.code === "string" && Object.prototype.hasOwnProperty.call(e, error.code)
      ? error.code
      : "unknown";
  switch (code) {
    case "rate_limited":
      return e.rate_limited(formatWait(error.retryAfterSeconds ?? NaN));
    case "weak_password": {
      const parts = (Array.isArray(error.reasons) ? error.reasons : [])
        .filter((r) => r === "too_short" || r === "too_common")
        .map((r) => (r === "too_short" ? e.weak_too_short : e.weak_too_common));
      return parts.length ? parts.join(" ") : e.weak_password;
    }
    default:
      return e[code];
  }
}
