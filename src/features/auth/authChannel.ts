import { AUTH_CHANNEL_NAME } from "./config";

/** Messages between tabs of this app. Only the access token, its expiry and the (non-secret) account id travel. */
export type AuthMessage =
  | {
      v: 1;
      type: "token";
      accountId: string;
      accessToken: string;
      expiresAt: number;
      at: number;
    }
  | { v: 1; type: "signedOut"; accountId: string; at: number };

export interface AuthChannel {
  post: (m: AuthMessage) => void;
  subscribe: (fn: (m: AuthMessage) => void) => () => void;
  close: () => void;
}

export interface EndpointLike {
  postMessage: (data: unknown) => void;
  addEventListener: (type: "message", fn: (ev: { data: unknown }) => void) => void;
  removeEventListener: (type: "message", fn: (ev: { data: unknown }) => void) => void;
  close: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9._-]{1,8192}$/;
const MAX_AGE_MS = 10_000;
const MAX_FUTURE_MS = 5_000;
const MAX_LIFETIME_MS = 86_400_000;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validates a received message; returns a fresh object with only the known fields, else null. */
export function parseAuthMessage(raw: unknown, now: number): AuthMessage | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1) return null;
  if (typeof m.accountId !== "string" || !UUID_RE.test(m.accountId)) return null;
  if (!isNum(m.at) || m.at < now - MAX_AGE_MS || m.at > now + MAX_FUTURE_MS) return null;
  if (m.type === "signedOut") return { v: 1, type: "signedOut", accountId: m.accountId, at: m.at };
  if (m.type !== "token") return null;
  if (typeof m.accessToken !== "string" || !TOKEN_RE.test(m.accessToken)) return null;
  if (!isNum(m.expiresAt) || m.expiresAt <= now || m.expiresAt > now + MAX_LIFETIME_MS) return null;
  return {
    v: 1,
    type: "token",
    accountId: m.accountId,
    accessToken: m.accessToken,
    expiresAt: m.expiresAt,
    at: m.at,
  };
}

const defaultCreate = (name: string): EndpointLike | undefined =>
  typeof BroadcastChannel === "function"
    ? (new BroadcastChannel(name) as unknown as EndpointLike)
    : undefined;

/** Every failure (missing API, throwing constructor or postMessage) degrades to a no-op: each tab then works alone. */
export function createAuthChannel({
  create = defaultCreate,
  name = AUTH_CHANNEL_NAME,
  now = () => Date.now(),
}: {
  create?: (name: string) => EndpointLike | undefined;
  name?: string;
  now?: () => number;
} = {}): AuthChannel {
  let endpoint: EndpointLike | undefined;
  try {
    endpoint = create(name);
  } catch {
    endpoint = undefined;
  }
  return {
    post(m) {
      try {
        endpoint?.postMessage(m);
      } catch {
        // ignored
      }
    },
    subscribe(fn) {
      if (!endpoint) return () => {};
      const ep = endpoint;
      const handler = (ev: { data: unknown }) => {
        const msg = parseAuthMessage(ev.data, now());
        if (msg) fn(msg);
      };
      ep.addEventListener("message", handler);
      return () => ep.removeEventListener("message", handler);
    },
    close() {
      try {
        endpoint?.close();
      } catch {
        // ignored
      }
      endpoint = undefined;
    },
  };
}
