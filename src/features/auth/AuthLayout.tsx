import type { ReactNode } from "react";
import { AUTH_COPY } from "./copy";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-5 py-8"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-2xl p-5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        <p className="text-xs font-semibold" style={{ color: "var(--green)" }}>
          {AUTH_COPY.brand}
        </p>
        <h1 className="text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-center text-sm font-semibold underline"
      style={{ color: "var(--green)" }}
    >
      {children}
    </button>
  );
}
