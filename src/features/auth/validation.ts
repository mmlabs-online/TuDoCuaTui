import type { FieldErrorCode } from "./copy";

// org-admin-api app/core/config.py `password_min_length` (default 12).
export const PASSWORD_MIN = 12;
// org-admin-api app/modules/auth/schemas.py PASSWORD_MAX_LENGTH.
export const PASSWORD_MAX = 128;
// RFC 5321 limits, as enforced by email-validator.
export const EMAIL_MAX = 254;
const LOCAL_MAX = 64;
// org-admin-api schemas.py EMAIL_TOKEN_RE, anchored to the `#token=` fragment (consumers.md).
const VERIFY_HASH_RE = /^#token=([A-Za-z0-9_-]{32,128})$/;

const LOCAL_RE = /^[^\s@]+$/;
const DOMAIN_RE = /^[^\s@.]+(\.[^\s@.]+)+$/;

const codePoints = (s: string) => [...s].length;

export function emailError(value: string): FieldErrorCode | null {
  const email = value.trim();
  if (!email) return "required";
  if (email.length > EMAIL_MAX) return "invalid";
  const parts = email.split("@");
  if (parts.length !== 2) return "invalid";
  const [local, domain] = parts;
  if (!LOCAL_RE.test(local) || local.length > LOCAL_MAX || !DOMAIN_RE.test(domain)) {
    return "invalid";
  }
  return null;
}

/** Sign-up policy: length counted after NFKC, no trimming (passwords.py normalize_password). */
export function passwordError(value: string): FieldErrorCode | null {
  if (!value) return "required";
  if (codePoints(value) > PASSWORD_MAX) return "tooLong";
  if (codePoints(value.normalize("NFKC")) < PASSWORD_MIN) return "tooShort";
  return null;
}

/** Sign-in has no policy: the server decides. */
export function signInPasswordError(value: string): FieldErrorCode | null {
  if (!value) return "required";
  if (codePoints(value) > PASSWORD_MAX) return "tooLong";
  return null;
}

/** The server hashes the NFKC form, so compare that. */
export function confirmError(password: string, confirm: string): FieldErrorCode | null {
  return password.normalize("NFKC") === confirm.normalize("NFKC") ? null : "mismatch";
}

export type FieldErrors<K extends string> = Partial<Record<K, FieldErrorCode>>;

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

function compact<K extends string>(entries: [K, FieldErrorCode | null][]): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const [k, v] of entries) if (v) out[k] = v;
  return out;
}

export function validateSignIn(v: { email: string; password: string }) {
  return compact<"email" | "password">([
    ["email", emailError(v.email)],
    ["password", signInPasswordError(v.password)],
  ]);
}

export function validateSignUp(v: { email: string; password: string; confirm: string }) {
  return compact<"email" | "password" | "confirm">([
    ["email", emailError(v.email)],
    ["password", passwordError(v.password)],
    ["confirm", v.confirm ? confirmError(v.password, v.confirm) : "required"],
  ]);
}

/**
 * Token from a `#token=<32-128 url-safe chars>` fragment, else null.
 * T-019.7 must: call history.replaceState to strip the fragment before any network call; send the
 * token only in a POST body; never log or render it; serve the page with Referrer-Policy no-referrer.
 */
export function parseVerifyToken(hash: string): string | null {
  return VERIFY_HASH_RE.exec(hash)?.[1] ?? null;
}
