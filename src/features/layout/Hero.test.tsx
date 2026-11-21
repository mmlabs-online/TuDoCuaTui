import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OUTFITS_COPY } from "@/features/outfits/copy";
import { blankItem } from "@/features/items/blankItem";
import { Hero } from "./Hero";

afterEach(cleanup);

test("Hôm nay mặc gì? button calls onOutfits", () => {
  const onOutfits = vi.fn();
  render(<Hero items={[]} onImport={vi.fn()} onExport={vi.fn()} onOutfits={onOutfits} />);
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.entry }));
  expect(onOutfits).toHaveBeenCalledTimes(1);
});

test("hero count follows D51 for never-worn items", () => {
  const dayMs = 86400000;
  const fresh = { ...blankItem(), id: "n1", createdAt: new Date().toISOString() };
  const old = {
    ...blankItem(),
    id: "n2",
    createdAt: new Date(Date.now() - 100 * dayMs).toISOString(),
  };
  const props = { onImport: vi.fn(), onExport: vi.fn() };
  const { unmount } = render(<Hero items={[fresh]} {...props} />);
  expect(screen.getByText(/Hôm nay có 0 món lâu chưa mặc/)).toBeTruthy();
  unmount();
  render(<Hero items={[fresh, old]} {...props} />);
  expect(screen.getByText(/Hôm nay có 1 món lâu chưa mặc/)).toBeTruthy();
});
