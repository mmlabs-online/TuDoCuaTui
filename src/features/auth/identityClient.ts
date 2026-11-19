import { networkError, toAuthError } from "./errors";
import type { AuthError } from "./types";

type FetchFn = typeof fetch;

export interface IdentityClient {
  login(v: {
    email: string;
    password: string;
    turnstileToken?: string;
  }): Promise<{ accountId: string; email: string }>;
  token(accountId: string): Promise<{ accessToken: string; expiresIn: number }>;
  logout(accountId: string): Promise<void>;
  signup(v: {
    email: string;
    password: string;
    turnstileToken: string;
  }): Promise<{ email: string }>;
  verifyEmail(token: string): Promise<void>;
  /** Always 202 for any email (no enumeration); Turnstile is always required. */
  forgotPassword(v: { email: string; turnstileToken: string }): Promise<void>;
  /** Public endpoint: the token goes in the POST body only. */
  resetPassword(v: { token: string; newPassword: string }): Promise<void>;
  resendVerification(accountId: string): Promise<void>;
  /** Joins the app as the given account. Call only after the user's click (D8). */
  join(accountId: string): Promise<void>;
  accounts(): Promise<{ accountId: string; email: string }[]>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPIRES_MAX = 86400;
const LOGOUT_TIMEOUT_MS = 5000;
/** A hung /token would hold the cross-tab renewal lock for every tab. */
const TOKEN_TIMEOUT_MS = 15000;
const unknownError = (): AuthError => ({ code: "unknown" });
const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

/** Cookie-class calls to mmlabs Identity (consumers.md). Rejections are plain `AuthError` objects. */
export function createIdentityClient({
  baseUrl,
  app,
  fetchFn = (...a) => fetch(...a),
}: {
  baseUrl: string;
  app: string;
  fetchFn?: FetchFn;
}): IdentityClient {
  /** `cookie`: credentials + X-MM-App; otherwise the public endpoint (no cookie, no app header). */
  const post = async (
    path: string,
    body: unknown,
    cookie: boolean,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchFn(baseUrl + path, {
        method: "POST",
        credentials: cookie ? "include" : "omit",
        headers: { "Content-Type": "application/json", ...(cookie && { "X-MM-App": app }) },
        body: JSON.stringify(body),
        cache: "no-store",
        ...(signal && { signal }),
      });
    } catch {
      throw networkError();
    }
    let json: unknown = null;
    if (res.status !== 204) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    }
    if (!res.ok) throw toAuthError(res.status, res.headers, json);
    return json;
  };

  const get = async (path: string): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchFn(baseUrl + path, {
        method: "GET",
        credentials: "include",
        headers: { "X-MM-App": app },
        cache: "no-store",
      });
    } catch {
      throw networkError();
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) throw toAuthError(res.status, res.headers, json);
    return json;
  };

  return {
    async login({ email, password, turnstileToken }) {
      const json = asObject(
        await post(
          "/auth/login",
          { email, password, ...(turnstileToken && { turnstile_token: turnstileToken }) },
          true,
        ),
      );
      const user = asObject(json.user);
      if (typeof json.account_id !== "string" || !UUID_RE.test(json.account_id)) {
        throw unknownError();
      }
      return {
        accountId: json.account_id,
        email: typeof user.email === "string" ? user.email : email,
      };
    },
    async token(accountId) {
      const json = asObject(
        await post(
          "/auth/token",
          { audience: app, account_id: accountId },
          true,
          AbortSignal.timeout(TOKEN_TIMEOUT_MS),
        ),
      );
      const { access_token: t, token_type, expires_in: exp, audience } = json;
      if (
        typeof t !== "string" ||
        !t ||
        token_type !== "Bearer" ||
        audience !== app ||
        typeof exp !== "number" ||
        !Number.isFinite(exp) ||
        exp < 1 ||
        exp > EXPIRES_MAX
      ) {
        throw unknownError();
      }
      return { accessToken: t, expiresIn: exp };
    },
    async logout(accountId) {
      await post(
        "/auth/logout",
        { account_id: accountId },
        true,
        AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
      );
    },
    async signup({ email, password, turnstileToken }) {
      const json = asObject(
        await post("/auth/signup", { email, password, turnstile_token: turnstileToken }, true),
      );
      return { email: typeof json.email === "string" ? json.email : email };
    },
    async verifyEmail(token) {
      await post("/auth/verify-email", { token }, false);
    },
    async forgotPassword({ email, turnstileToken }) {
      await post("/auth/password/forgot", { email, turnstile_token: turnstileToken }, true);
    },
    async resetPassword({ token, newPassword }) {
      await post("/auth/password/reset", { token, new_password: newPassword }, false);
    },
    async resendVerification(accountId) {
      await post("/auth/verify-email/resend", { account_id: accountId }, true);
    },
    async join(accountId) {
      const json = asObject(
        await post(`/auth/apps/${encodeURIComponent(app)}/join`, { account_id: accountId }, true),
      );
      if (json.status !== "member") throw unknownError();
    },
    async accounts() {
      const items = asObject(await get("/auth/accounts")).items;
      if (!Array.isArray(items)) return [];
      return items.flatMap((raw) => {
        const it = asObject(raw);
        return typeof it.account_id === "string" &&
          UUID_RE.test(it.account_id) &&
          typeof it.email === "string" &&
          it.email
          ? [{ accountId: it.account_id, email: it.email }]
          : [];
      });
    },
  };
}
