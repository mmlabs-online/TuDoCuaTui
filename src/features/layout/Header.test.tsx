import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Header } from "./Header";
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
