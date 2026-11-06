import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase || session) return <>{children}</>;
  if (session === undefined) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div
      className="min-h-screen grid place-items-center p-6"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm grid gap-4 p-7 rounded-3xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        <p className="eyebrow">TỦ ĐỒ CÁ NHÂN</p>
        <h1 className="text-3xl font-semibold leading-tight">
          Tủ đồ <em>của tôi</em>
        </h1>
        {sent ? (
          <p style={{ color: "var(--muted)" }}>
            Đã gửi link đăng nhập tới <b style={{ color: "var(--text)" }}>{email}</b>. Mở email trên
            thiết bị này để tiếp tục.
          </p>
        ) : (
          <>
            <p style={{ color: "var(--muted)" }}>
              Nhập email, mình sẽ gửi link đăng nhập — không cần mật khẩu.
            </p>
            <input
              type="email"
              required
              autoFocus
              placeholder="ban@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-4 py-3 rounded-xl"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            />
            <button type="submit" className="btn btn-primary justify-center" disabled={busy}>
              {busy ? "Đang gửi…" : "Gửi link đăng nhập"}
            </button>
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          </>
        )}
      </form>
    </div>
  );
}
