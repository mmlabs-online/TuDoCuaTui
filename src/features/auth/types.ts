import type { ReactNode } from "react";

// Mirrors the error codes of org-admin-api (auth/errors.py, core/errors.py, consumers.md).
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_unverified"
  | "not_member"
  | "join_closed"
  | "join_approval_unavailable"
  | "join_unavailable"
  | "session_invalid"
  | "turnstile_required"
  | "turnstile_failed"
  | "rate_limited"
  | "network"
  | "email_taken"
  | "weak_password"
  | "validation_error"
  | "token_invalid"
  | "email_already_verified"
  /** Client-only: a fresh token still got 401. Never accepted from a server body. */
  | "no_access"
  | "unknown";

export type AuthError = {
  code: AuthErrorCode;
  /** rate_limited: Retry-After header / details.retry_after. */
  retryAfterSeconds?: number;
  /** weak_password: details.reasons. */
  reasons?: ("too_short" | "too_common")[];
  /** not_member: details.join_available === true (the user may join the app). */
  joinAvailable?: boolean;
};

/** Email is trimmed; the password is exactly as typed. */
export type Credentials = { email: string; password: string };
export type SubmitStatus = "idle" | "submitting";
export type ResendState = { status: "idle" | "sending" | "sent"; error?: AuthError | null };

/** An account already signed in on this browser (`GET /accounts`). */
export type AccountChoice = { accountId: string; email: string };

export type SignInScreenProps = {
  status: SubmitStatus;
  error?: AuthError | null;
  /** Info banner, for example after /verify-email. */
  notice?: "verified" | "signed_out" | "password_reset" | "logout_unconfirmed" | null;
  initialEmail?: string;
  onSignIn: (values: Credentials) => void;
  onGoSignUp: () => void;
  /** "Quên mật khẩu?" is shown only when provided. */
  onGoForgot?: () => void;
  /** Offered with email_unverified only when provided. */
  onResend?: () => void;
  resend?: ResendState;
  /** Rendered only for turnstile_required / turnstile_failed, or while `turnstileRequired`. */
  turnstileSlot?: ReactNode;
  /** Keeps the slot visible next to other errors once the server has asked for Turnstile. */
  turnstileRequired?: boolean;
  /** One "Continue as" button per account, above the form; nothing when empty or absent. */
  accounts?: AccountChoice[];
  onContinueAs?: (account: AccountChoice) => void;
  /** The account being continued: its button shows the busy label. */
  continuingId?: string | null;
};

export type SignUpScreenProps = {
  status: SubmitStatus | "sent";
  /** Email shown in the "check your email" state. */
  sentTo?: string;
  error?: AuthError | null;
  /** The confirm value is never passed out. */
  onSignUp: (values: Credentials) => void;
  onGoSignIn: () => void;
  /** Always rendered above submit. */
  turnstileSlot?: ReactNode;
  /** Default true; false disables submit. */
  turnstileReady?: boolean;
  onResend?: () => void;
  resend?: ResendState;
};

export type ForgotPasswordScreenProps = {
  status: SubmitStatus | "sent";
  error?: AuthError | null;
  initialEmail?: string;
  /** Trimmed email. */
  onSubmit: (email: string) => void;
  onGoSignIn: () => void;
  /** Always rendered above submit (Turnstile is always required). */
  turnstileSlot?: ReactNode;
  /** Default true; false disables submit. */
  turnstileReady?: boolean;
};

export type ResetState = "ready" | "submitting" | "done" | "invalid";
export type ResetPasswordScreenProps = {
  state: ResetState;
  /** "ready": weak_password (reasons), rate_limited, network, unknown. */
  error?: AuthError | null;
  /** Called only from the form submit (button press or Enter); the confirm value is never passed out. */
  onReset: (newPassword: string) => void;
  /** "done", and "invalid" when onRequestNew is absent. */
  onContinue: () => void;
  /** "invalid": "Gửi link mới" shown only when provided (identity mode). */
  onRequestNew?: () => void;
};

export type VerifyState = "ready" | "verifying" | "verified" | "invalid" | "rate_limited";
/** Token rules for the wiring (T-019.7): see parseVerifyToken in validation.ts. */
export type VerifyEmailScreenProps = {
  state: VerifyState;
  retryAfterSeconds?: number;
  /** "ready": the user presses the button; only then is the token sent (D36). */
  onVerify?: () => void;
  /** "ready": shown after a retryable failure. */
  error?: AuthError | null;
  onContinue: () => void;
  onGoSignIn: () => void;
  /** "invalid": shown only when provided, else a sign-in button. */
  onResend?: () => void;
  resend?: ResendState;
};

export type UnverifiedScreenProps = {
  /** The unverified account's email, when known. */
  email: string | null;
  resend: ResendState;
  /** The last re-check still found the email unverified. */
  still?: boolean;
  onResend: () => void;
  onCheckAgain: () => void;
  onUseOtherAccount: () => void;
};

export type JoinScreenProps = {
  email: string;
  status: SubmitStatus;
  error?: AuthError | null;
  /** The click is the consent (D8): the only caller of join. */
  onJoin: () => void;
  onUseOtherAccount: () => void;
};
