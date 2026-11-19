import { clearAccountId, readAccountId, writeAccountId } from "./accountId";
import { createAuthChannel, type AuthChannel, type AuthMessage } from "./authChannel";
import type { IdentityClient } from "./identityClient";
import { createRefreshLock, defaultTimers, type RefreshLock, type Timers } from "./refreshLock";
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
  /** Adopts an account already signed in on this device (from `accounts`): stores its id and fetches its token. */
  continueAs: (accountId: string, email: string) => Promise<void>;
  restore: () => Promise<void>;
  /** Never rejects. `confirmed`: Identity acknowledged the logout (2xx or `session_invalid`); otherwise warn the user. */
  signOut: () => Promise<{ confirmed: boolean }>;
  /** Drops token and account id without calling /logout (other mmlabs apps stay signed in). */
  forget: () => void;
  /** Failures of a background refresh (`getToken`); sign-in and restore reject to their caller. */
  subscribe: (fn: (e: AuthError) => void) => () => void;
  accountId: () => string | null;
  /** Email of the current account: memory after sign-in, else one `accounts` call. */
  accountEmail: () => Promise<string | null>;
  /** Joins the app, then fetches the token. Only ever called from the user's click (D8). `false`: the store moved on (forget / sign-in) meanwhile. */
  join: () => Promise<boolean>;
  /** Opens the cross-tab channel, the proactive renewal timer and the visibility listener. Returns the cleanup. */
  start: () => () => void;
  /** Another tab signed this account out (this tab already dropped its session). */
  onRemoteSignOut: (fn: () => void) => () => void;
}

export interface VisibilityDoc {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", fn: () => void) => void;
  removeEventListener: (type: "visibilitychange", fn: () => void) => void;
}

const REFRESH_MARGIN_S = 60;
const LOCK_WAIT_MS = 20_000;
const SIGN_OUT_WAIT_MS = 5_000;
const RETRY_MS = 15_000;
const MAX_TIMER_MS = 2 ** 31 - 1;
const NOTIFY_CODES: AuthError["code"][] = ["session_invalid", "not_member", "email_unverified"];
const isAuthError = (e: unknown): e is AuthError =>
  typeof e === "object" && e !== null && typeof (e as AuthError).code === "string";

/**
 * The access token lives only in this closure (never storage, URL or log). It is reused until
 * `expires_in - 60 s` after receipt; once started, a timer renews it then. One in-flight `/token` call per tab,
 * serialised across tabs by a Web Lock; a renewed token is broadcast to the other tabs.
 */
export function createTokenStore({
  client,
  storage = { read: readAccountId, write: writeAccountId, clear: clearAccountId },
  now = () => Date.now(),
  timers = defaultTimers,
  lock = createRefreshLock({ timers }),
  channel: openChannel = () => createAuthChannel({ now }),
  doc = typeof document !== "undefined" ? document : undefined,
}: {
  client: IdentityClient;
  storage?: AccountIdStorage;
  now?: () => number;
  timers?: Timers;
  lock?: RefreshLock;
  channel?: () => AuthChannel;
  doc?: VisibilityDoc;
}): TokenStore {
  let id = storage.read();
  let email: string | null = null;
  let token: string | null = null;
  let validUntil = 0;
  let expiresAt = 0;
  let tokenAt = 0;
  let generation = 0; // epoch: bumped whenever the session changes; late answers of an older epoch are dropped
  let inflight: Promise<string | null> | null = null;
  let started = false;
  let channel: AuthChannel | null = null;
  let timer: unknown = null;
  const listeners = new Set<(e: AuthError) => void>();
  const remoteListeners = new Set<() => void>();

  const fresh = () => token !== null && now() < validUntil;
  const notify = (err: unknown) => {
    if (isAuthError(err) && NOTIFY_CODES.includes(err.code)) {
      for (const fn of listeners) fn(err);
    }
  };

  const disarm = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const armAt = (delay: number) => {
    disarm();
    timer = timers.setTimeout(onTimer, Math.min(Math.max(delay, 0), MAX_TIMER_MS));
  };
  // At least RETRY_MS between proactive renewals: a token valid for <= 60 s has `validUntil` = receipt time and
  // would otherwise renew at 0 ms in a loop. Such a short token may expire before the timer; `getToken` renews on demand.
  const arm = () => {
    if (started && id && token !== null) armAt(Math.max(validUntil - now(), RETRY_MS));
  };
  /** Ends the current session epoch: late `/token` answers are dropped. */
  const reset = () => {
    generation++;
    inflight = null;
    token = null;
    tokenAt = 0;
    disarm();
  };

  /** Clears the stored account id only while it still names `gone`: another tab may have stored its own account since (BUG-007). */
  const forgetStored = (gone: string | null) => {
    const stored = storage.read();
    if (gone && stored && stored.toLowerCase() === gone.toLowerCase()) storage.clear();
  };

  const renew = (rejected?: string): Promise<string | null> => {
    if (inflight) return inflight;
    if (!id) return Promise.resolve(null);
    const epoch = generation;
    const accountId = id;
    const p: Promise<string | null> = lock
      .run(
        async (locked) => {
          if (epoch !== generation) return null;
          // a message from the tab that held the lock before us arrives as a task: let it land first
          if (locked) await new Promise<void>((r) => timers.setTimeout(r, 0));
          if (epoch !== generation) return null;
          if (fresh() && token !== rejected) return token;
          const r = await client.token(accountId);
          if (epoch !== generation) return null;
          const t = now();
          token = r.accessToken;
          expiresAt = t + r.expiresIn * 1000;
          validUntil = t + Math.max(0, r.expiresIn - REFRESH_MARGIN_S) * 1000;
          tokenAt = t;
          channel?.post({
            v: 1,
            type: "token",
            accountId,
            accessToken: r.accessToken,
            expiresAt,
            at: t,
          });
          arm();
          return token;
        },
        { waitMs: LOCK_WAIT_MS },
      )
      .catch((err: unknown) => {
        if (epoch !== generation) return null;
        if (isAuthError(err)) {
          if (err.code === "session_invalid") {
            token = null;
            id = null;
            email = null;
            forgetStored(accountId);
            disarm();
          } else if (err.code === "not_member" || err.code === "email_unverified") {
            token = null;
          }
        }
        throw err;
      })
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
      return await renew(rejected);
    } catch (err) {
      notify(err);
      throw err;
    }
  };

  /** Renewal nobody awaits (timer, tab becomes visible): failures notify; a transient one retries while the token lives. */
  const background = () => {
    renew().then(
      () => {},
      (err: unknown) => {
        notify(err);
        if (started && id && token !== null && now() + RETRY_MS < expiresAt) armAt(RETRY_MS);
      },
    );
  };
  function onTimer() {
    timer = null;
    if (!id) return;
    if (now() < validUntil) return arm();
    if (doc?.visibilityState === "hidden") return; // renews when the tab becomes visible
    background();
  }
  const onVisible = () => {
    if (doc?.visibilityState === "hidden") return;
    // only a token this tab had and that went stale; no token (join, unverified, retry screens) is not renewed here
    if (id && token !== null && now() >= validUntil) background();
  };

  const onMessage = (msg: AuthMessage) => {
    if (!id || msg.accountId.toLowerCase() !== id.toLowerCase()) return;
    if (msg.type === "token") {
      if (msg.at > tokenAt && msg.expiresAt - REFRESH_MARGIN_S * 1000 > now()) {
        token = msg.accessToken;
        expiresAt = msg.expiresAt;
        validUntil = msg.expiresAt - REFRESH_MARGIN_S * 1000;
        tokenAt = msg.at;
        arm();
      }
      return;
    }
    const gone = id;
    reset();
    id = null;
    email = null;
    forgetStored(gone);
    for (const fn of remoteListeners) fn();
  };

  /** Starts a new session epoch for `accountId`. Posts no `signedOut` for any earlier id. */
  const adopt = (accountId: string, accountEmail: string): Promise<string | null> => {
    reset();
    id = accountId;
    email = accountEmail;
    storage.write(accountId);
    return renew();
  };

  return {
    getToken,
    async signIn(v) {
      const r = await client.login(v);
      await adopt(r.accountId, r.email);
    },
    async continueAs(accountId, accountEmail) {
      await adopt(accountId, accountEmail);
    },
    async restore() {
      await renew();
    },
    async signOut() {
      const gone = id;
      const running = inflight;
      reset();
      id = null;
      email = null;
      forgetStored(gone); // the local session ends first; /logout is best effort and may hang
      if (!gone) return { confirmed: true };
      channel?.post({ v: 1, type: "signedOut", accountId: gone, at: now() });
      if (running) {
        let wait: unknown;
        await Promise.race([
          running.then(
            () => {},
            () => {},
          ),
          new Promise<void>((r) => {
            wait = timers.setTimeout(r, SIGN_OUT_WAIT_MS);
          }),
        ]);
        timers.clearTimeout(wait);
      }
      try {
        // the lock also waits for a renewal running in another tab, whose late answer that tab drops
        await lock.run(() => client.logout(gone), { waitMs: SIGN_OUT_WAIT_MS });
        return { confirmed: true };
      } catch (err) {
        return { confirmed: isAuthError(err) && err.code === "session_invalid" };
      }
    },
    forget() {
      const gone = id;
      reset();
      id = null;
      email = null;
      forgetStored(gone);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    onRemoteSignOut(fn) {
      remoteListeners.add(fn);
      return () => void remoteListeners.delete(fn);
    },
    start() {
      if (started) return () => {};
      started = true;
      channel = openChannel();
      const unsubscribe = channel.subscribe(onMessage);
      doc?.addEventListener("visibilitychange", onVisible);
      arm();
      return () => {
        started = false;
        unsubscribe();
        channel?.close();
        channel = null;
        doc?.removeEventListener("visibilitychange", onVisible);
        disarm();
      };
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
      if (!id) return false;
      const gen = generation;
      try {
        await client.join(id);
      } catch (err) {
        if (gen === generation && isAuthError(err) && err.code === "session_invalid") {
          forgetStored(id);
          id = null;
          email = null;
        }
        throw err;
      }
      if (gen !== generation) return false;
      await renew();
      return gen === generation;
    },
  };
}
