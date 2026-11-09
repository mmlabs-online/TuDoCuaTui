import { useEffect, useRef } from "react";

// Open modals, oldest first. Only the topmost one reacts to Escape.
const stack: symbol[] = [];

export function Modal({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const id = useRef(Symbol());
  useEffect(() => {
    const mine = id.current;
    stack.push(mine);
    return () => {
      stack.splice(stack.indexOf(mine), 1);
    };
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) =>
      e.key === "Escape" && stack[stack.length - 1] === id.current && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`}>{children}</div>
    </div>
  );
}
