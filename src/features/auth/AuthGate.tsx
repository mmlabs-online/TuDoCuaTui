import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Btn } from "@/components/Btn";
import type { GetToken } from "@/data/authFetch";
import { AuthLayout } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { SignInScreen } from "./SignInScreen";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { JoinScreen } from "./JoinScreen";
import { SignUpScreen } from "./SignUpScreen";
import { UnverifiedScreen } from "./UnverifiedScreen";
import { TurnstileWidget, type TurnstileHandle } from "./TurnstileWidget";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { IdentityClient } from "./identityClient";
import type { TokenStore } from "./tokenStore";
import type { AccountChoice, AuthError, Credentials, ResendState, SubmitStatus } from "./types";

export type AppAuthProps = {
  getToken: GetToken;
  onSignOut: () => void;
  onAuthLost: () => void;
};

type View =
  | { kind: "checking" }
  | { kind: "ready"; generation: number; app: AppAuthProps }
  | {
      kind: "signed_out";
      error?: AuthError | null;
      notice?: "verified" | "signed_out" | "password_reset" | "logout_unconfirmed" | null;
    }
  | { kind: "join"; email: string; error?: AuthError | null }
  | { kind: "unverified"; email: string | null; still?: boolean }
  | { kind: "retry"; error: AuthError };

const MAX_LISTED_ACCOUNTS = 5;

const isTurnstileCode = (e?: AuthError | null) =>
  e?.code === "turnstile_required" || e?.code === "turnstile_failed";

/** Identity-mode state machine: restore, sign-in, sign-up, sign-out. Mounts the app only while signed in. */
export function AuthGate({
  store,
  client,
  renderApp,
  notice = null,
  initialScreen = "signIn",
}: {
  store: TokenStore;
  client: IdentityClient;
  renderApp: (p: AppAuthProps) => ReactNode;
  notice?: "verified" | "password_reset" | null;
  /** Used only when the device has no stored account. */
  initialScreen?: "signIn" | "forgot";
}) {
  const [view, setView] = useState<View>(() =>
    store.accountId() ? { kind: "checking" } : { kind: "signed_out", notice },
  );
  const [screen, setScreen] = useState<"signIn" | "signUp" | "forgot">(() =>
    store.accountId() ? "signIn" : initialScreen,
  );
  const [forgotSent, setForgotSent] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [signUpSent, setSignUpSent] = useState<string | null>(null);
  const [signUpKey, setSignUpKey] = useState(0);
  const [needTurnstile, setNeedTurnstile] = useState(false);
  const [tsFailed, setTsFailed] = useState(false);
  const [resend, setResend] = useState<ResendState>({ status: "idle" });
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [joinStatus, setJoinStatus] = useState<SubmitStatus>("idle");
  // "Continue as" list: "loading" only on a cold sign-in page (no stored account); null = form only
  const [accounts, setAccounts] = useState<AccountChoice[] | "loading" | null>(() =>
    !store.accountId() && initialScreen === "signIn" ? "loading" : null,
  );
  const [continuingId, setContinuingId] = useState<string | null>(null);
  const continuing = useRef(false);
  const listSeq = useRef(0); // bumped when the list is (re)loaded or dropped; a late answer of an older seq is ignored
  const lastEmail = useRef<string | null>(null); // email shown on the unverified screen: typed or listed, never fetched
  const rechecking = useRef(false); // set by "I verified my email"; a repeated email_unverified then shows `still`
  const joining = useRef(false);
  const joinSeq = useRef(0); // bumped when the join view is left; a late join result of an older seq is ignored
  const signOutSeq = useRef(0); // bumped when the sign-in page moves on; a late "logout not confirmed" of an older seq is ignored
  const generation = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const tsToken = useRef<string | null>(null);
  const widget = useRef<TurnstileHandle>(null);

  const enterReady = () => {
    rechecking.current = false;
    generation.current += 1;
    setView({
      kind: "ready",
      generation: generation.current,
      app: appPropsFor(generation.current),
    });
  };
  // Leaving `ready` retires the current App generation at once, before any new sign-in can start.
  const retireApp = () => {
    generation.current += 1;
  };
  const loadAccounts = async () => {
    const seq = ++listSeq.current;
    setAccounts("loading");
    let list: AccountChoice[] = [];
    try {
      list = await client.accounts();
    } catch {
      // any failure: the form alone, no banner
    }
    if (seq !== listSeq.current) return;
    const seen = new Set<string>();
    const unique = list.filter((a) => {
      const key = a.accountId.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setAccounts(unique.length ? unique.slice(0, MAX_LISTED_ACCOUNTS) : null);
  };
  // No list right after a sign-out or "other account": /logout may still be running, and the account just left must not be offered.
  const clearAccounts = () => {
    listSeq.current += 1;
    setAccounts(null);
  };
  const failTo = (err: AuthError) => {
    const recheck = rechecking.current;
    rechecking.current = false;
    if (err.code === "email_unverified" && store.accountId() !== null) {
      setResend({ status: "idle" });
      setView({ kind: "unverified", email: lastEmail.current, still: recheck });
      return;
    }
    if (err.code === "session_invalid") {
      setView({ kind: "signed_out", error: err });
      void loadAccounts(); // contract: re-list the accounts
      return;
    }
    if (err.code === "network" || err.code === "rate_limited" || err.code === "unknown") {
      setView({ kind: "retry", error: err });
    } else {
      setView({ kind: "signed_out", error: err });
    }
  };

  const canJoin = (err: AuthError) =>
    err.code === "not_member" && err.joinAvailable === true && store.accountId() !== null;
  // not_member + join_available: look up the account's email, then offer "Continue as" (never joins by itself).
  const offerJoin = async (live: () => boolean = () => true) => {
    setView({ kind: "checking" });
    try {
      const joinEmail = await store.accountEmail();
      if (!live()) return;
      if (store.accountId() === null) {
        // signed out meanwhile: a remote sign-out already moved the view; otherwise (id cleared by session_invalid) go to sign-in
        setView((v) =>
          v.kind === "checking" ? { kind: "signed_out", error: { code: "session_invalid" } } : v,
        );
        return;
      }
      setView(
        joinEmail
          ? { kind: "join", email: joinEmail }
          : { kind: "signed_out", error: { code: "not_member" } },
      );
    } catch (e) {
      if (live()) failTo(e as AuthError);
    }
  };
  const onTokenError = (err: AuthError, live?: () => boolean) =>
    canJoin(err) ? void offerJoin(live) : failTo(err);

  // Cross-tab channel, proactive renewal timer and visibility listener live as long as the gate.
  useEffect(() => store.start(), [store]);

  // Cold sign-in page: list the accounts already signed in on this browser.
  useEffect(() => {
    if (accounts === "loading") void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Another tab signed out: leave whatever screen this tab is on.
  useEffect(
    () =>
      store.onRemoteSignOut(() => {
        signOutSeq.current += 1;
        joinSeq.current += 1;
        joining.current = false;
        if (viewRef.current.kind === "ready") {
          retireApp();
          flushSync(() => setView({ kind: "checking" })); // the app (and its photo URLs) unmounts first
        }
        tsToken.current = null;
        continuing.current = false;
        setContinuingId(null);
        setStatus("idle");
        setJoinStatus("idle");
        setNeedTurnstile(false);
        setEmail("");
        lastEmail.current = null;
        clearAccounts();
        setScreen("signIn");
        setView({ kind: "signed_out", notice: "signed_out" });
      }),
    [store],
  );

  // Silent restore from the stored account id (the only thing kept on the device).
  useEffect(() => {
    if (view.kind !== "checking") return;
    let live = true;
    store.restore().then(
      () => live && store.accountId() !== null && enterReady(),
      (err: AuthError) => live && onTokenError(err, () => live),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // A background refresh failed while the app is open.
  useEffect(
    () =>
      store.subscribe((err) => {
        if (viewRef.current.kind !== "ready") return;
        retireApp();
        if (canJoin(err)) void offerJoin();
        else failTo(err);
      }),
    [store],
  );

  // Per App generation: a callback kept by an unmounted App can no longer read a token or end the new session.
  const appPropsFor = (gen: number): AppAuthProps => {
    const current = () => generation.current === gen;
    return {
      getToken: (rejected) => (current() ? store.getToken(rejected) : Promise.resolve(null)),
      onSignOut: () => {
        if (!current() || viewRef.current.kind !== "ready") return;
        retireApp();
        flushSync(() => setView({ kind: "checking" })); // the app (and its photo URLs) unmounts first
        const seq = ++signOutSeq.current;
        // clears the id at once; /logout is best effort and never awaited here
        void store.signOut().then(({ confirmed }) => {
          if (confirmed || seq !== signOutSeq.current) return;
          setView((v) =>
            v.kind === "signed_out" && v.notice === "signed_out"
              ? { ...v, notice: "logout_unconfirmed" }
              : v,
          );
        });
        setNeedTurnstile(false);
        setEmail("");
        lastEmail.current = null;
        clearAccounts();
        setView({ kind: "signed_out", notice: "signed_out" });
      },
      onAuthLost: () => {
        if (!current() || viewRef.current.kind !== "ready") return;
        retireApp();
        store.forget();
        setEmail("");
        lastEmail.current = null;
        clearAccounts();
        setView({ kind: "signed_out", error: { code: "no_access" } });
      },
    };
  };

  const spendTurnstile = () => {
    tsToken.current = null;
    widget.current?.reset();
  };
  const slot = (
    <TurnstileWidget
      ref={widget}
      onToken={(t) => {
        tsToken.current = t;
      }}
      onExpire={() => {
        tsToken.current = null;
      }}
      onError={() => {
        tsToken.current = null;
        setTsFailed(true);
      }}
    />
  );
  const goto = (s: "signIn" | "signUp" | "forgot") => {
    signOutSeq.current += 1;
    tsToken.current = null;
    setTsFailed(false);
    setResend({ status: "idle" });
    setView((v) => (v.kind === "signed_out" ? { ...v, error: null, notice: null } : v));
    setStatus("idle");
    setSignUpSent(null);
    setForgotSent(false);
    setScreen(s);
  };

  const signIn = async (v: Credentials) => {
    if (needTurnstile && !tsToken.current) {
      setView({ kind: "signed_out", error: { code: "turnstile_required" } });
      return;
    }
    signOutSeq.current += 1;
    setEmail(v.email);
    lastEmail.current = v.email;
    setStatus("submitting");
    setResend({ status: "idle" });
    const turnstileToken = needTurnstile ? (tsToken.current ?? undefined) : undefined;
    try {
      await store.signIn({ ...v, turnstileToken });
      setStatus("idle");
      setNeedTurnstile(false);
      if (store.accountId() !== null) enterReady();
    } catch (e) {
      const err = e as AuthError;
      setStatus("idle");
      if (canJoin(err)) {
        setNeedTurnstile(false);
        spendTurnstile();
        void offerJoin();
        return;
      }
      if (err.code === "turnstile_required") setNeedTurnstile(true);
      if (err.code === "email_unverified") failTo(err);
      else setView({ kind: "signed_out", error: err });
      if (needTurnstile || err.code === "turnstile_required") spendTurnstile();
    }
  };

  const signUp = async (v: Credentials) => {
    if (!tsToken.current) {
      setView({ kind: "signed_out", error: { code: "turnstile_required" } });
      return;
    }
    setStatus("submitting");
    const turnstileToken = tsToken.current;
    try {
      const r = await client.signup({ ...v, turnstileToken });
      spendTurnstile();
      setEmail(r.email);
      setStatus("idle");
      setSignUpKey((k) => k + 1); // remount: the typed password does not survive the "sent" screen
      setSignUpSent(r.email);
    } catch (e) {
      spendTurnstile();
      setStatus("idle");
      setView({ kind: "signed_out", error: e as AuthError });
    }
  };

  const forgot = async (forgotEmail: string) => {
    if (!tsToken.current) {
      setView({ kind: "signed_out", error: { code: "turnstile_required" } });
      return;
    }
    setEmail(forgotEmail);
    setStatus("submitting");
    const turnstileToken = tsToken.current;
    try {
      await client.forgotPassword({ email: forgotEmail, turnstileToken });
      spendTurnstile();
      setStatus("idle");
      setForgotSent(true);
    } catch (e) {
      spendTurnstile();
      setStatus("idle");
      setView({ kind: "signed_out", error: e as AuthError });
    }
  };

  const resendVerification = async () => {
    const id = store.accountId();
    if (!id) return;
    setResend({ status: "sending" });
    try {
      await client.resendVerification(id);
      setResend({ status: "sent" });
    } catch (e) {
      if ((e as AuthError).code === "email_already_verified") {
        // already verified (for example in another tab): get a token through the restore effect
        setResend({ status: "idle" });
        setView({ kind: "checking" });
        setAttempt((n) => n + 1);
        return;
      }
      if ((e as AuthError).code === "session_invalid") {
        // the account is gone: sign in again
        store.forget();
        setResend({ status: "idle" });
        failTo(e as AuthError);
        return;
      }
      setResend({ status: "idle", error: e as AuthError });
    }
  };

  const continueAs = async (a: AccountChoice) => {
    if (continuing.current) return;
    continuing.current = true;
    signOutSeq.current += 1;
    lastEmail.current = a.email;
    setContinuingId(a.accountId);
    setStatus("submitting");
    try {
      await store.continueAs(a.accountId, a.email);
      if (store.accountId() !== null) enterReady();
    } catch (e) {
      onTokenError(e as AuthError);
    } finally {
      continuing.current = false;
      setContinuingId(null);
      setStatus("idle");
    }
  };

  const join = async () => {
    if (joining.current) return;
    joining.current = true;
    const seq = joinSeq.current;
    const stale = () => joinSeq.current !== seq || viewRef.current.kind !== "join";
    setJoinStatus("submitting");
    try {
      const joined = await store.join();
      if (stale()) return;
      joining.current = false;
      setJoinStatus("idle");
      if (joined && store.accountId()) enterReady();
    } catch (e) {
      if (stale()) return;
      const err = e as AuthError;
      joining.current = false;
      setJoinStatus("idle");
      if (err.code === "session_invalid") setView({ kind: "signed_out", error: err });
      else setView((v) => (v.kind === "join" ? { ...v, error: err } : v));
    }
  };

  if (view.kind === "ready") {
    return <div key={view.generation}>{renderApp(view.app)}</div>;
  }
  if (view.kind === "checking") {
    return (
      <AuthLayout title={AUTH_COPY.signIn.title}>
        <AuthNotice kind="info" busy>
          {AUTH_COPY.gate.checking}
        </AuthNotice>
      </AuthLayout>
    );
  }
  if (view.kind === "join") {
    return (
      <JoinScreen
        email={view.email}
        status={joinStatus}
        error={view.error}
        onJoin={join}
        onUseOtherAccount={() => {
          joinSeq.current += 1;
          joining.current = false;
          store.forget();
          setEmail("");
          lastEmail.current = null;
          clearAccounts();
          setJoinStatus("idle");
          setScreen("signIn");
          setView({ kind: "signed_out" });
        }}
      />
    );
  }
  if (view.kind === "unverified") {
    return (
      <UnverifiedScreen
        email={view.email}
        resend={resend}
        still={view.still}
        onResend={resendVerification}
        onCheckAgain={() => {
          rechecking.current = true;
          setResend({ status: "idle" });
          setView({ kind: "checking" });
          setAttempt((n) => n + 1);
        }}
        onUseOtherAccount={() => {
          store.forget();
          setEmail("");
          lastEmail.current = null;
          clearAccounts();
          setResend({ status: "idle" });
          setScreen("signIn");
          setView({ kind: "signed_out" });
        }}
      />
    );
  }
  if (view.kind === "retry") {
    return (
      <AuthLayout title={AUTH_COPY.signIn.title}>
        <AuthNotice kind="error">{authErrorMessage(view.error)}</AuthNotice>
        <Btn
          type="button"
          kind="primary"
          onClick={() => {
            setView({ kind: "checking" });
            setAttempt((n) => n + 1);
          }}
        >
          {AUTH_COPY.actions.retry}
        </Btn>
      </AuthLayout>
    );
  }

  if (accounts === "loading" && screen === "signIn") {
    return (
      <AuthLayout title={AUTH_COPY.signIn.title}>
        <AuthNotice kind="info" busy>
          {AUTH_COPY.gate.checking}
        </AuthNotice>
      </AuthLayout>
    );
  }

  const error =
    tsFailed && (screen !== "signIn" || needTurnstile)
      ? { code: "turnstile_failed" as const }
      : view.error;
  const canResend = store.accountId() !== null;
  if (screen === "forgot") {
    return (
      <ForgotPasswordScreen
        status={forgotSent ? "sent" : status}
        error={error}
        initialEmail={email}
        turnstileSlot={slot}
        turnstileReady={!tsFailed}
        onSubmit={forgot}
        onGoSignIn={() => goto("signIn")}
      />
    );
  }
  if (screen === "signUp") {
    return (
      <SignUpScreen
        key={signUpKey}
        status={signUpSent ? "sent" : status}
        sentTo={signUpSent ?? undefined}
        error={error}
        turnstileSlot={slot}
        turnstileReady={!tsFailed}
        onSignUp={signUp}
        onGoSignIn={() => goto("signIn")}
        onResend={canResend ? resendVerification : undefined}
        resend={resend}
      />
    );
  }
  return (
    <SignInScreen
      status={status}
      error={error}
      notice={view.notice}
      initialEmail={email}
      turnstileSlot={slot}
      turnstileRequired={needTurnstile}
      onSignIn={signIn}
      onGoSignUp={() => goto("signUp")}
      onGoForgot={() => goto("forgot")}
      onResend={canResend ? resendVerification : undefined}
      resend={resend}
      accounts={accounts === "loading" ? undefined : (accounts ?? undefined)}
      onContinueAs={continueAs}
      continuingId={continuingId}
    />
  );
}
