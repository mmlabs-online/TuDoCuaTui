import type { ComponentProps } from "react";

type Props = ComponentProps<"input"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

export function AuthField({ id, label, error, hint, ...input }: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {hint && (
        <small id={hintId} className="text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </small>
      )}
    </div>
  );
}
