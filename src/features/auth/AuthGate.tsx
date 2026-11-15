import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Btn } from "@/components/Btn";
import type { GetToken } from "@/data/authFetch";
import { AuthLayout } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { SignInScreen } from "./SignInScreen";
import { SignUpScreen } from "./SignUpScreen";
import { TurnstileWidget, type TurnstileHandle } from "./TurnstileWidget";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { IdentityClient } from "./identityClient";
import type { TokenStore } from "./tokenStore";
import type { AuthError, Credentials, ResendState, SubmitStatus } from "./types";

export type AppAuthProps = {
  getToken: GetToken;
  onSignOut: () => void;
  onAuthLost: () => void;
};

type View =
  | { kind: "checking" }
  | { kind: "ready"; generation: number }
  | { kind: "signed_out"; error?: AuthError | null; notice?: "verified" | "signed_out" | null }
  | { kind: "retry"; error: AuthError };

const isTurnstileCode = (e?: AuthError | null) =>
  e?.code === "turnstile_required" || e?.code === "turnstile_failed";

/** Identity-mode state machine: restore, sign-in, sign-up, sign-out. Mounts the app only while signed in. */
export function AuthGate({
  store,
  client,
  renderApp,
  notice = null,
}: {
  store: TokenStore;
  client: IdentityClient;
  renderApp: (p: AppAuthProps) => ReactNode;
  notice?: "verified" | null;
}) {
  const [view, setView] = useState<View>(() =>
    store.accountId() ? { kind: "checking" } : { kind: "signed_out", notice },
  );
  const [screen, setScreen] = useState<"signIn" | "signUp">("signIn");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [signUpSent, setSignUpSent] = useState<string | null>(null);
  const [signUpKey, setSignUpKey] = useState(0);
  const [needTurnstile, setNeedTurnstile] = useState(false);
  const [tsFailed, setTsFailed] = useState(false);
  const [resend, setResend] = useState<ResendState>({ status: "idle" });
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const tsToken = useRef<string | null>(null);
  const widget = useRef<TurnstileHandle>(null);

  const enterReady = () => {
    generation.current += 1;
    setView({ kind: "ready", generation: generation.current });
  };
  const failTo = (err: AuthError) => {
    if (err.code === "network" || err.code === "rate_limited" || err.code === "unknown") {
      setView({ kind: "retry", error: err });
    } else {
      setView({ kind: "signed_out", error: err });
    }
  };

  // Silent restore from the stored account id (the only thing kept on the device).
  useEffect(() => {
    if (view.kind !== "checking") return;
    let live = true;
    store.restore().then(
      () => live && enterReady(),
      (err: AuthError) => live && failTo(err),
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
        if (viewRef.current.kind === "ready") setView({ kind: "signed_out", error: err });
      }),
    [store],
  );

  const onSignOut = useCallback(() => {
    if (viewRef.current.kind !== "ready") return;
    flushSync(() => setView({ kind: "checking" })); // the app (and its photo URLs) unmounts first
    void store.signOut().then(() => {
      setNeedTurnstile(false);
      setView({ kind: "signed_out", notice: "signed_out" });
    });
  }, [store]);

  const onAuthLost = useCallback(() => {
    if (viewRef.current.kind !== "ready") return;
    store.forget();
    setView({ kind: "signed_out", error: { code: "no_access" } });
  }, [store]);

  const appProps = useRef<AppAuthProps>({ getToken: store.getToken, onSignOut, onAuthLost });

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
  const goto = (s: "signIn" | "signUp") => {
    tsToken.current = null;
    setTsFailed(false);
    setResend({ status: "idle" });
    setView((v) => (v.kind === "signed_out" ? { ...v, error: null, notice: null } : v));
    setStatus("idle");
    setSignUpSent(null);
    setScreen(s);
  };

  const signIn = async (v: Credentials) => {
    if (needTurnstile && !tsToken.current) {
      setView({ kind: "signed_out", error: { code: "turnstile_required" } });
      return;
    }
    setEmail(v.email);
    setStatus("submitting");
    setResend({ status: "idle" });
    const turnstileToken = needTurnstile ? (tsToken.current ?? undefined) : undefined;
    try {
      await store.signIn({ ...v, turnstileToken });
      setStatus("idle");
      setNeedTurnstile(false);
      enterReady();
    } catch (e) {
      const err = e as AuthError;
      setStatus("idle");
      if (err.code === "turnstile_required") setNeedTurnstile(true);
      // The widget lives in the sign-in screen only next to a turnstile error, so keep prompting for it.
      const shown: AuthError =
        needTurnstile && err.code === "invalid_credentials" ? { code: "turnstile_required" } : err;
      setView({ kind: "signed_out", error: shown });
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

  const resendVerification = async () => {
    const id = store.accountId();
    if (!id) return;
    setResend({ status: "sending" });
    try {
      await client.resendVerification(id);
      setResend({ status: "sent" });
    } catch (e) {
      setResend({ status: "idle", error: e as AuthError });
    }
  };

  if (view.kind === "ready") {
    return <div key={view.generation}>{renderApp(appProps.current)}</div>;
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

  const error =
    tsFailed && (screen === "signUp" || needTurnstile)
      ? { code: "turnstile_failed" as const }
      : view.error;
  const canResend = store.accountId() !== null;
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
      onSignIn={signIn}
      onGoSignUp={() => goto("signUp")}
      onResend={canResend ? resendVerification : undefined}
      resend={resend}
    />
  );
}
