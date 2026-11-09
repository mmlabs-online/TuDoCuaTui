import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { COPY, authErrorMessage, validateLogin } from "./authMessages";

/**
 * Requires a signed-in user when Supabase is configured.
 * In local mode (no env) it renders children directly.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setPassword("");
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase || session) return <>{children}</>;
  if (session === undefined) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const invalid = validateLogin(email, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(authErrorMessage(error));
      else setPassword("");
    } catch {
      setError(COPY.errGeneric);
    } finally {
      setBusy(false);
    }
  };

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
        <p style={{ color: "var(--muted)" }}>{COPY.intro}</p>
        <label className="field">
          <span>{COPY.emailLabel}</span>
          <input
            type="email"
            name="email"
            autoFocus
            autoComplete="email"
            placeholder={COPY.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ fontSize: 16, height: 44 }}
          />
        </label>
        <label className="field">
          <span>{COPY.passwordLabel}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ fontSize: 16, height: 44 }}
          />
        </label>
        <button type="submit" className="btn btn-primary justify-center w-full" disabled={busy}>
          {busy ? COPY.signingIn : COPY.submit}
        </button>
        {error && (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
