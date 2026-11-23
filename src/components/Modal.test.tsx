// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

afterEach(cleanup);

const tab = (el: Element | Window, shiftKey = false) => {
  const ev = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(ev);
  return ev;
};

function Opener({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && <Modal onClose={() => setOpen(false)}>{children}</Modal>}
    </>
  );
}

const open = () => {
  const opener = screen.getByText("opener");
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe("Modal", () => {
  it("renders an aria-modal dialog and traps focus", () => {
    render(
      <Opener>
        <h2>Tiêu đề</h2>
        <button>A</button>
        <input aria-label="B" />
      </Opener>,
    );
    open();
    const dialog = screen.getByRole("dialog", { name: "Tiêu đề" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const last = screen.getByLabelText("B");
    last.focus();
    const ev = tab(last);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByText("A"));
  });

  it("keeps an existing heading id", () => {
    render(
      <Modal onClose={vi.fn()}>
        <h2 id="mine">Tên</h2>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(document.querySelector("h2")!.id).toBe("mine");
    expect(dialog.getAttribute("aria-labelledby")).toBe("mine");
  });

  it("focuses the data-autofocus element on open", () => {
    render(
      <Modal onClose={vi.fn()}>
        <button>A</button>
        <input aria-label="B" data-autofocus />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("B"));
  });

  it("focuses the dialog when nothing is marked", () => {
    render(
      <Modal onClose={vi.fn()}>
        <button>A</button>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("keeps focus that a child already moved inside", () => {
    render(
      <Modal onClose={vi.fn()}>
        <button>A</button>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input aria-label="B" autoFocus />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("B"));
  });

  it("Shift+Tab on the first element goes to the last", () => {
    render(
      <Modal onClose={vi.fn()}>
        <button>A</button>
        <button>M</button>
        <button>Z</button>
      </Modal>,
    );
    const a = screen.getByText("A");
    a.focus();
    expect(tab(a, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByText("Z"));
    const m = screen.getByText("M");
    m.focus();
    expect(tab(m).defaultPrevented).toBe(false);
  });

  it("Tab with focus outside pulls focus into the topmost dialog", () => {
    render(
      <>
        <button>behind</button>
        <Modal onClose={vi.fn()}>
          <button>A</button>
        </Modal>
      </>,
    );
    screen.getByText("behind").focus();
    const ev = tab(window);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByText("A"));
  });

  it("only the topmost of two stacked modals traps", () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    render(
      <>
        <Modal onClose={onClose1}>
          <button>L1</button>
          <button>L2</button>
        </Modal>
        <Modal onClose={onClose2}>
          <button>U1</button>
          <button>U2</button>
        </Modal>
      </>,
    );
    const l2 = screen.getByText("L2");
    l2.focus();
    tab(l2);
    expect(document.activeElement).toBe(screen.getByText("U1"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(onClose1).not.toHaveBeenCalled();
  });

  it("restores focus to the opener on close", () => {
    render(<Opener />);
    const opener = open();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not throw or move focus when the opener is gone", () => {
    const gone = document.createElement("button");
    document.body.append(gone);
    gone.focus();
    const view = render(
      <Modal onClose={vi.fn()}>
        <button>A</button>
      </Modal>,
    );
    gone.remove();
    expect(() => view.unmount()).not.toThrow();
    expect(document.activeElement).not.toBe(gone);
  });

  it("a stacked modal returns focus to the control in the modal below", () => {
    function Stack() {
      const [second, setSecond] = useState(false);
      return (
        <Modal onClose={vi.fn()}>
          <button onClick={() => setSecond(true)}>open2</button>
          {second && (
            <Modal onClose={() => setSecond(false)}>
              <button>inner</button>
            </Modal>
          )}
        </Modal>
      );
    }
    render(<Stack />);
    const b = screen.getByText("open2");
    b.focus();
    fireEvent.click(b);
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.activeElement).toBe(b);
  });
});
