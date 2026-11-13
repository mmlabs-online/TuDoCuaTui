import type { ReactNode } from "react";
import { Btn } from "@/components/Btn";

type Props = {
  kind: "error" | "info";
  children: ReactNode;
  busy?: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean };
};

export function AuthNotice({ kind, children, busy, action }: Props) {
  const error = kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      aria-busy={busy ? true : undefined}
      className="flex flex-col gap-2 rounded-xl p-3 text-sm"
      style={{
        background: error ? "transparent" : "var(--soft)",
        border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
        color: error ? "var(--danger)" : "var(--text)",
      }}
    >
      <p>{children}</p>
      {action && (
        <Btn type="button" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Btn>
      )}
    </div>
  );
}
