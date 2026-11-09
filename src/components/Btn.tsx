export function Btn({
  children,
  kind = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: string }) {
  return (
    <button className={`btn btn-${kind} ${className}`} {...props}>
      {children}
    </button>
  );
}
