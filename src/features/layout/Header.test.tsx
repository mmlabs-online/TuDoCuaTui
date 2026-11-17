import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Header } from "./Header";
import { SETTINGS_COPY } from "@/features/settings/copy";
import { LAYOUT_COPY } from "./copy";

afterEach(cleanup);

test("Add button keeps an accessible name when its label is hidden", () => {
  const onAdd = vi.fn();
  render(
    <Header
      count={0}
      dark={false}
      onToggleDark={vi.fn()}
      onImport={vi.fn()}
      onExport={vi.fn()}
      onAdd={onAdd}
    />,
  );
  const btn = screen.getByRole("button", { name: LAYOUT_COPY.addItem });
  expect(btn.getAttribute("aria-label")).toBe(LAYOUT_COPY.addItem);
  fireEvent.click(btn);
  expect(onAdd).toHaveBeenCalled();
});

const baseProps = {
  count: 0,
  onToggleDark: vi.fn(),
  onImport: vi.fn(),
  onExport: vi.fn(),
  onAdd: vi.fn(),
};

test('AI settings button shows the "ai" icon, not the sun-like "settings" icon (BUG-005)', () => {
  const onSettings = vi.fn();
  render(<Header {...baseProps} dark={false} onSettings={onSettings} />);
  const btn = screen.getByRole("button", { name: SETTINGS_COPY.open });
  expect(btn.querySelector("svg")?.getAttribute("data-icon")).toBe("ai");
  fireEvent.click(btn);
  expect(onSettings).toHaveBeenCalledTimes(1);
});

test("theme toggle keeps its sun/moon icon", () => {
  const { rerender } = render(<Header {...baseProps} dark={true} />);
  expect(
    screen
      .getByRole("button", { name: "Đổi giao diện" })
      .querySelector("svg")
      ?.getAttribute("data-icon"),
  ).toBe("sun");
  rerender(<Header {...baseProps} dark={false} />);
  expect(
    screen
      .getByRole("button", { name: "Đổi giao diện" })
      .querySelector("svg")
      ?.getAttribute("data-icon"),
  ).toBe("moon");
});
