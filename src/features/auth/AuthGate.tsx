import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { COPY, authErrorMessage, isValidEmail } from "./authMessages";
import { secondsLeft } from "./cooldown";

/**
 * Requires a signed-in user when Supabase is configured.
 * In local mode (no env) it renders children directly.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cooling = secondsLeft(sentAt, now) > 0;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooling]);

  if (!supabase || session) return <>{children}</>;
  if (session === undefined) return null;

  const send = async () => {
    setError(null);
    if (!isValidEmail(email)) {
      setError(COPY.errInvalidEmail);
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setSent(true);
    setSentAt(Date.now());
    setNow(Date.now());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  const left = secondsLeft(sentAt, now);

  return (
    <div
      className="min-h-screen grid place-items-center p-4"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <form
        noValidate
        onSubmit={submit}
        className="w-full max-w-sm grid gap-4 p-6 rounded-3xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        <p className="eyebrow">{COPY.eyebrow}</p>
        <h1
          className="text-3xl font-semibold leading-tight"
          style={{
            color: "var(--brown)",
            fontFamily: '"Fraunces", serif',
            letterSpacing: "-0.04em",
          }}
        >
          {COPY.title}
        </h1>
        {sent ? (
          <>
            <p style={{ color: "var(--muted)" }}>
              {COPY.sentTo}{" "}
              <b style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{email.trim()}</b>.{" "}
              {COPY.sentHint}
            </p>
            <button
              type="button"
              className="btn justify-center w-full"
              disabled={busy || left > 0}
              onClick={() => void send()}
            >
              {left > 0 ? COPY.resendIn(left) : COPY.resend}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: "var(--muted)" }}>{COPY.intro}</p>
            <label className="field">
              <span>{COPY.emailLabel}</span>
              <input
                type="email"
                autoFocus
                autoComplete="email"
                placeholder={COPY.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ fontSize: 16, height: 44 }}
              />
            </label>
            <button type="submit" className="btn btn-primary justify-center w-full" disabled={busy}>
              {busy ? COPY.sending : COPY.send}
            </button>
          </>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
