import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { nextTrapFocus, tabbables } from "./focusTrap";

// Open modals, oldest first. Only the topmost one reacts to Escape and Tab.
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
  const dialog = useRef<HTMLDivElement>(null);
  const fallbackId = useId();
  // Read at render: React applies a child's autoFocus during the commit, before effects run.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  // Every render, so a re-rendered or replaced heading stays wired.
  useLayoutEffect(() => {
    const d = dialog.current;
    const h = d?.querySelector("h2");
    if (!d || !h) return d?.removeAttribute("aria-labelledby");
    if (!h.id) h.id = fallbackId;
    d.setAttribute("aria-labelledby", h.id);
  });
  useLayoutEffect(() => {
    const d = dialog.current;
    if (d && !d.contains(document.activeElement)) {
      const target = d.querySelector<HTMLElement>("[data-autofocus]");
      if (target) target.focus();
      else d.focus({ preventScroll: true });
    }
  }, []);
  useEffect(() => {
    const mine = id.current;
    stack.push(mine);
    return () => {
      stack.splice(stack.indexOf(mine), 1);
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id.current) return;
      if (e.key === "Escape") return onClose();
      const d = dialog.current;
      if (e.key !== "Tab" || !d) return;
      const list = tabbables(d);
      const next = nextTrapFocus(list, document.activeElement, e.shiftKey);
      if (next) {
        e.preventDefault();
        next.focus();
      } else if (list.length === 0) {
        e.preventDefault();
        d.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`modal outline-none ${wide ? "modal-wide" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
