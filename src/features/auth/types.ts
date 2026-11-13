import type { ReactNode } from "react";

// Mirrors the error codes of org-admin-api (auth/errors.py, core/errors.py, consumers.md).
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_unverified"
  | "not_member"
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
  | "unknown";

export type AuthError = {
  code: AuthErrorCode;
  /** rate_limited: Retry-After header / details.retry_after. */
  retryAfterSeconds?: number;
  /** weak_password: details.reasons. */
  reasons?: ("too_short" | "too_common")[];
};

/** Email is trimmed; the password is exactly as typed. */
export type Credentials = { email: string; password: string };
export type SubmitStatus = "idle" | "submitting";
export type ResendState = { status: "idle" | "sending" | "sent"; error?: AuthError | null };

export type SignInScreenProps = {
  status: SubmitStatus;
  error?: AuthError | null;
  /** Info banner, for example after /verify-email. */
  notice?: "verified" | "signed_out" | null;
  initialEmail?: string;
  onSignIn: (values: Credentials) => void;
  onGoSignUp: () => void;
  /** Offered with email_unverified only when provided. */
  onResend?: () => void;
  resend?: ResendState;
  /** Rendered only for turnstile_required / turnstile_failed. */
  turnstileSlot?: ReactNode;
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

export type VerifyState = "verifying" | "verified" | "invalid" | "rate_limited";
export type VerifyEmailScreenProps = {
  state: VerifyState;
  retryAfterSeconds?: number;
  onContinue: () => void;
  onGoSignIn: () => void;
  /** "invalid": shown only when provided, else a sign-in button. */
  onResend?: () => void;
  resend?: ResendState;
};
