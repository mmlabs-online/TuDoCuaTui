import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast, useToast } from "@/components/Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useToast", () => {
  it("shows a message and clears it after 2400 ms", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current.notify("x"));
    expect(result.current.toast).toBe("x");
    act(() => {
      vi.advanceTimersByTime(2399);
    });
    expect(result.current.toast).toBe("x");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBe("");
  });

  it("records today's behaviour: the first timer clears a newer message early", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current.notify("a"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => result.current.notify("b"));
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.toast).toBe("");
  });
});

describe("Toast", () => {
  it("renders nothing for an empty message and the check icon otherwise", () => {
    const { container, rerender } = render(<Toast message="" />);
    expect(container.innerHTML).toBe("");
    rerender(<Toast message="Đã lưu" />);
    const el = container.querySelector(".toast")!;
    expect(el.querySelector("svg")).not.toBeNull();
    expect(el.textContent).toContain("Đã lưu");
  });
});
