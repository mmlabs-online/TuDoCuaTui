export function Field({
  label,
  wide,
  error,
  children,
}: {
  label: string;
  wide?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {error && (
        <small role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </small>
      )}
    </label>
  );
}
