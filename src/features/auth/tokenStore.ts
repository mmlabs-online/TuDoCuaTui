import { clearAccountId, readAccountId, writeAccountId } from "./accountId";
import type { IdentityClient } from "./identityClient";
import type { AuthError } from "./types";

export interface AccountIdStorage {
  read: () => string | null;
  write: (id: string) => void;
  clear: () => void;
}

export interface TokenStore {
  /** `null` when signed out. `rejected`: the token a request just got 401 for. */
  getToken: (rejected?: string) => Promise<string | null>;
  signIn: (v: { email: string; password: string; turnstileToken?: string }) => Promise<void>;
  restore: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Drops token and account id without calling /logout (other mmlabs apps stay signed in). */
  forget: () => void;
  /** Failures of a background refresh (`getToken`); sign-in and restore reject to their caller. */
  subscribe: (fn: (e: AuthError) => void) => () => void;
  accountId: () => string | null;
  /** Email of the current account: memory after sign-in, else one `accounts` call. */
  accountEmail: () => Promise<string | null>;
  /** Joins the app, then fetches the token. Only ever called from the user's click (D8). */
  join: () => Promise<void>;
}

const REFRESH_MARGIN_S = 60;
const NOTIFY_CODES: AuthError["code"][] = ["session_invalid", "not_member", "email_unverified"];
const isAuthError = (e: unknown): e is AuthError =>
  typeof e === "object" && e !== null && typeof (e as AuthError).code === "string";

/**
 * The access token lives only in this closure (never storage, URL or log). Refresh is lazy:
 * the token is reused until `expires_in - 60 s` after receipt, with one in-flight `/token` call.
 */
export function createTokenStore({
  client,
  storage = { read: readAccountId, write: writeAccountId, clear: clearAccountId },
  now = () => Date.now(),
}: {
  client: IdentityClient;
  storage?: AccountIdStorage;
  now?: () => number;
}): TokenStore {
  let id = storage.read();
  let email: string | null = null;
  let token: string | null = null;
  let validUntil = 0;
  let generation = 0;
  let inflight: Promise<string | null> | null = null;
  const listeners = new Set<(e: AuthError) => void>();

  const fresh = () => token !== null && now() < validUntil;

  const fetchToken = (): Promise<string | null> => {
    if (inflight) return inflight;
    if (!id) return Promise.resolve(null);
    const gen = generation;
    const p: Promise<string | null> = client
      .token(id)
      .then(
        (r) => {
          if (gen !== generation) return null;
          token = r.accessToken;
          validUntil = now() + Math.max(0, r.expiresIn - REFRESH_MARGIN_S) * 1000;
          return token;
        },
        (err: unknown) => {
          if (gen !== generation) return null;
          token = null;
          if (isAuthError(err) && err.code === "session_invalid") {
            id = null;
            email = null;
            storage.clear();
          }
          throw err;
        },
      )
      .finally(() => {
        if (inflight === p) inflight = null;
      });
    inflight = p;
    return p;
  };

  const getToken = async (rejected?: string): Promise<string | null> => {
    if (!id) return null;
    if (token !== null && fresh() && token !== rejected) return token;
    try {
      return await fetchToken();
    } catch (err) {
      if (isAuthError(err) && NOTIFY_CODES.includes(err.code)) {
        for (const fn of listeners) fn(err);
      }
      throw err;
    }
  };

  return {
    getToken,
    async signIn(v) {
      const r = await client.login(v);
      generation++;
      inflight = null;
      token = null;
      id = r.accountId;
      email = r.email;
      storage.write(id);
      await fetchToken();
    },
    async restore() {
      await fetchToken();
    },
    async signOut() {
      const gone = id;
      generation++;
      inflight = null;
      token = null;
      id = null;
      email = null;
      storage.clear(); // the local session ends first; /logout is best effort and may hang
      try {
        if (gone) await client.logout(gone);
      } catch {
        // ignored
      }
    },
    forget() {
      generation++;
      inflight = null;
      token = null;
      id = null;
      email = null;
      storage.clear();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    accountId: () => id,
    async accountEmail() {
      if (!id) return null;
      if (email) return email;
      const gen = generation;
      const wanted = id;
      const list = await client.accounts();
      if (gen !== generation) return null;
      email = list.find((a) => a.accountId.toLowerCase() === wanted.toLowerCase())?.email ?? null;
      return email;
    },
    async join() {
      if (!id) return;
      const gen = generation;
      try {
        await client.join(id);
      } catch (err) {
        if (gen === generation && isAuthError(err) && err.code === "session_invalid") {
          id = null;
          email = null;
          storage.clear();
        }
        throw err;
      }
      if (gen !== generation) return;
      await fetchToken();
    },
  };
}
